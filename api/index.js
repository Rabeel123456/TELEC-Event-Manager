import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const geminiKey = process.env.GEMINI_API_KEY;
const supabaseAdmin = () => createClient(url, service, { auth: { persistSession: false } });

const json = (res, status, data) => res.status(status).json(data);
const body = req => typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
const bearer = req => (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
const pathOf = req => new URL(req.url, 'https://local').pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
const mapEvent = r => ({id:r.id,eventDate:r.event_date,eventTime:r.event_time?.slice(0,5),familyPersonName:r.family_person_name,eventType:r.event_type,day:r.day,venueLocation:r.venue_location||'',city:r.city||'',googleMapsLink:r.google_maps_link||'',details:r.details||'',status:r.status,revision:r.revision||1,createdAt:r.created_at,updatedAt:r.updated_at});
const eventRow = e => ({event_date:e.eventDate,event_time:e.eventTime,family_person_name:e.familyPersonName,event_type:e.eventType,day:e.day,venue_location:e.venueLocation||'',city:e.city||'',google_maps_link:e.googleMapsLink||'',details:e.details||'',status:e.status||'Pending'});

async function authUser(req){
  const token=bearer(req); if(!token) throw Object.assign(new Error('Please sign in.'),{status:401});
  const sb=createClient(url, anon,{auth:{persistSession:false}});
  const {data,error}=await sb.auth.getUser(token); if(error||!data.user) throw Object.assign(new Error('Session expired.'),{status:401});
  const admin=supabaseAdmin();
  const {data:profile}=await admin.from('profiles').select('*').eq('id',data.user.id).single();
  if(!profile||!profile.active) throw Object.assign(new Error('Account is disabled.'),{status:403});
  return {token,user:data.user,profile,admin};
}
async function audit(admin,p,action,detail){await admin.from('activity_logs').insert({user_id:p.id,user_name:p.name,action,detail});}

async function listModels(){
  const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(geminiKey)}`);
  if(!r.ok) throw new Error('Gemini connection failed. Check API key and project access.');
  const d=await r.json();
  return (d.models||[]).filter(m=>(m.supportedGenerationMethods||[]).includes('generateContent')).map(m=>m.name.replace('models/',''));
}
async function callGemini(dataUrl){
  if(!geminiKey) throw new Error('GEMINI_API_KEY is not configured in Vercel.');
  const m=dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/); if(!m) throw new Error('Please upload a valid JPG, PNG or WebP poster.');
  const available=await listModels();
  const preferred=['gemini-2.5-flash','gemini-2.5-flash-lite','gemini-2.0-flash','gemini-1.5-flash'];
  const models=[...preferred.filter(x=>available.includes(x)),...available.filter(x=>/flash/i.test(x)&&!preferred.includes(x))].slice(0,5);
  if(!models.length) throw new Error('No compatible Gemini vision model is available for this API key.');
  const prompt=`Read this event poster and return ONLY valid JSON with these keys: eventDate (YYYY-MM-DD), eventTime (HH:MM 24-hour), familyPersonName, eventType, day, venueLocation, city, googleMapsLink, details. Use empty string when not visible. Do not invent a map link. details should include organiser, speakers, RSVP, contact, dress code and other useful information.`;
  let last='';
  for(const model of models){
    try{
      const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(geminiKey)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents:[{parts:[{text:prompt},{inline_data:{mime_type:m[1],data:m[2]}}]}],generationConfig:{temperature:0.1,responseMimeType:'application/json'}})});
      const d=await r.json(); if(!r.ok){last=d?.error?.message||`Model ${model} failed`;continue}
      const text=d?.candidates?.[0]?.content?.parts?.map(x=>x.text||'').join('')||'';
      return JSON.parse(text.replace(/^```json\s*|```$/g,'').trim());
    }catch(e){last=e.message}
  }
  throw new Error(last||'Poster could not be read. Please try another image or enter the event manually.');
}

export default async function handler(req,res){
  try{
    if(!url||!anon||!service) return json(res,500,{error:'Supabase environment variables are not configured.'});
    const p=pathOf(req), method=req.method;
    if(p[0]==='login'&&method==='POST'){
      const b=body(req), admin=supabaseAdmin();
      const {data:prof}=await admin.from('profiles').select('*').eq('username',String(b.username||'').toLowerCase()).single();
      if(!prof||!prof.active||!await bcrypt.compare(String(b.password||''),prof.password_hash)) return json(res,401,{error:'Invalid username or password.'});
      const {data,error}=await createClient(url,anon,{auth:{persistSession:false}}).auth.signInWithPassword({email:prof.email,password:String(b.password)});
      if(error) return json(res,401,{error:'Login failed. Run the admin setup script again if the password was changed.'});
      await audit(admin,prof,'Login','Signed in'); return json(res,200,{token:data.session.access_token});
    }
    const {profile,admin}=await authUser(req);
    if(p[0]==='logout') return json(res,200,{ok:true});
    if(p[0]==='bootstrap'&&method==='GET'){
      const [{data:ev},{data:us},{data:logs}]=await Promise.all([admin.from('events').select('*').order('event_date').order('event_time'),profile.role==='admin'?admin.from('profiles').select('id,name,username,role,active'):Promise.resolve({data:[]}),profile.role==='admin'?admin.from('activity_logs').select('*').order('created_at',{ascending:false}).limit(100):Promise.resolve({data:[]})]);
      return json(res,200,{user:{id:profile.id,name:profile.name,username:profile.username,role:profile.role},events:(ev||[]).map(mapEvent),users:us||[],audit:(logs||[]).map(x=>({at:x.created_at,user:x.user_name,action:x.action,detail:x.detail})),network:[{label:'Database',value:'Supabase Connected'},{label:'Hosting',value:'Vercel Online'}],settings:{geminiConfigured:!!geminiKey}});
    }
    if(p[0]==='events'){
      if(method==='POST'){if(profile.role==='viewer') throw Object.assign(new Error('Read-only account.'),{status:403});const e=body(req);const {data,error}=await admin.from('events').insert({...eventRow(e),created_by:profile.id,updated_by:profile.id}).select().single();if(error)throw new Error(error.message);await audit(admin,profile,'Create Event',e.familyPersonName);return json(res,200,mapEvent(data));}
      if(p[1]&&method==='PATCH'){if(profile.role==='viewer')throw Object.assign(new Error('Read-only account.'),{status:403});const e=body(req);const {data,error}=await admin.from('events').update({...eventRow(e),updated_by:profile.id,revision:(Number(e.revision)||1)+1}).eq('id',p[1]).select().single();if(error)throw new Error(error.message);await audit(admin,profile,'Update Event',e.familyPersonName);return json(res,200,mapEvent(data));}
      if(p[1]&&method==='DELETE'){if(profile.role!=='admin')throw Object.assign(new Error('Administrator access required.'),{status:403});await admin.from('events').delete().eq('id',p[1]);await audit(admin,profile,'Delete Event',p[1]);return json(res,200,{ok:true});}
    }
    if(p[0]==='poster'&&p[1]==='parse'&&method==='POST'){const out=await callGemini(body(req).dataUrl);return json(res,200,out);}
    if(p[0]==='system'&&p[1]==='test-gemini'&&method==='POST'){const models=await listModels();return json(res,200,{message:`Gemini connected. ${models.length} compatible model(s) available.`});}
    if(p[0]==='users'&&method==='POST'){
      if(profile.role!=='admin')throw Object.assign(new Error('Administrator access required.'),{status:403});const b=body(req),email=`${String(b.username).toLowerCase()}@telec.local`;const {data,error}=await admin.auth.admin.createUser({email,password:b.password,email_confirm:true});if(error)throw new Error(error.message);await admin.from('profiles').insert({id:data.user.id,email,username:String(b.username).toLowerCase(),name:b.name,role:b.role,active:true,password_hash:await bcrypt.hash(b.password,12)});await audit(admin,profile,'Create User',b.username);return json(res,200,{ok:true});
    }
    if(p[0]==='users'&&p[1]&&method==='PATCH'){if(profile.role!=='admin')throw Object.assign(new Error('Administrator access required.'),{status:403});await admin.from('profiles').update({active:!!body(req).active}).eq('id',p[1]);return json(res,200,{ok:true});}
    return json(res,404,{error:'API route not found.'});
  }catch(e){return json(res,e.status||500,{error:e.message||'Unexpected server error.'});}
}
