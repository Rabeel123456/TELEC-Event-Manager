let savedToken = localStorage.getItem('telecToken') || '';

// Supabase access token valid JWT hota hai: xxx.yyy.zzz
const validToken = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(savedToken);

if (!validToken) {
  localStorage.removeItem('telecToken');
  savedToken = '';
}

let token = savedToken,
    user = null,
    events = [],
    users = [],
    audit = [],
    network = [],
    settings = {};
const $=x=>document.getElementById(x),pages=['dashboard','events','add','users','audit'];
function toast(m,e=false){const t=$('toast');t.textContent=m;t.className=e?'error':'';t.style.display='block';setTimeout(()=>t.style.display='none',3500)}
async function api(url, opt = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 65000);

  opt.signal = controller.signal;

  const headers = {
    ...(opt.headers || {}),
    'Content-Type': 'application/json'
  };

  // Login request par Authorization header mat bhejo.
  if (token && url !== '/api/login') {
    headers.Authorization = `Bearer ${token}`;
  }

  opt.headers = headers;

  try {
    const response = await fetch(url, opt);

    let data = {};
    try {
      data = await response.json();
    } catch {}

    if (!response.ok) {
      if (response.status === 401 && url !== '/api/login') {
        logout(false);
      }

      throw new Error(data.error || `Request failed (${response.status})`);
    }

    return data;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Request timed out. Please try again.');
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
}
$('loginForm').onsubmit=async e=>{e.preventDefault();try{const d=await api('/api/login',{method:'POST',body:JSON.stringify({username:$('loginUser').value,password:$('loginPass').value})});token=d.token;localStorage.telecToken=token;await load()}catch(x){toast(x.message,true)}};
async function load(){try{const d=await api('/api/bootstrap');user=d.user;events=d.events||[];users=d.users||[];audit=d.audit||[];network=d.network||[];settings=d.settings||{};$('login').classList.add('hidden');$('app').classList.remove('hidden');document.querySelectorAll('.admin-only').forEach(x=>x.classList.toggle('hidden',user.role!=='admin'));$('who').innerHTML=`<b>${esc(user.name)}</b><br>${esc(user.role)}`;renderAll()}catch(e){logout(false)}}
function logout(call=true){if(call&&token)api('/api/logout',{method:'POST'}).catch(()=>{});token='';localStorage.removeItem('telecToken');$('app').classList.add('hidden');$('login').classList.remove('hidden')}
const closeMobileMenu=()=>{document.querySelector('aside')?.classList.remove('open');$('menuBackdrop')?.classList.remove('show')};
$('menuToggle').onclick=()=>{const side=document.querySelector('aside');const open=!side.classList.contains('open');side.classList.toggle('open',open);$('menuBackdrop').classList.toggle('show',open)};
$('menuBackdrop').onclick=closeMobileMenu;
$('logout').onclick=()=>logout();$('refresh').onclick=async()=>{await load();toast('Data refreshed')};$('quickAdd').onclick=()=>show('add');document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>{show(b.dataset.page);closeMobileMenu()});
function show(p){pages.forEach(x=>$(`page-${x}`).classList.toggle('hidden',x!==p));document.querySelectorAll('nav button').forEach(x=>x.classList.toggle('active',x.dataset.page===p));$('pageTitle').textContent={dashboard:'Dashboard',events:'Events',add:$('eventId').value?'Edit Event':'Add Event / Poster Reader',users:'Users & Settings',audit:'Activity Log'}[p];if(p==='events')renderTable()}


function showStatEvents(period){
  const now=new Date(),today=iso(now),tomorrow=iso(new Date(now.getFullYear(),now.getMonth(),now.getDate()+1)),next7=iso(new Date(now.getFullYear(),now.getMonth(),now.getDate()+7));
  if(period==='today'||period==='tomorrow'){
    $('dashboardDate').value=period==='today'?today:tomorrow;
    renderDateEvents();
  }else{
    let list=[],title='Events';
    if(period==='next7'){list=events.filter(e=>e.eventDate>=today&&e.eventDate<=next7);title='Next 7 Days';}
    if(period==='pending'){list=events.filter(e=>e.status==='Pending');title='Pending Events';}
    if(period==='all'){list=[...events];title='All Events';}
    list.sort(sortEvent);
    renderDashboardEventList(title,list);
  }
  $('dateEvents').scrollIntoView({behavior:'smooth',block:'start'});
}
function eventActionButtons(e){
  const map=e.googleMapsLink?`<a class="map-button primary" href="${esc(e.googleMapsLink)}" target="_blank" rel="noopener noreferrer">📍 Open Map</a>`:'';
  return `<div class="event-card-actions"><button type="button" onclick="editEvent('${e.id}')">Open Event</button>${map}</div>`;
}
function renderDashboardEventList(title,list){
  $('dateEvents').innerHTML=`<div class="selected-date-title">${esc(title)} <span class="badge">${list.length} event${list.length===1?'':'s'}</span></div>`+(list.length?list.map(e=>`<div class="date-event-card"><div class="date-event-time"><div>${fmtDate(e.eventDate)}</div><div>${fmtTime(e.eventTime)}</div></div><div class="date-event-info"><b>${esc(e.familyPersonName)} · ${esc(e.eventType)}</b><div class="meta">${esc(e.venueLocation||'-')} · ${esc(e.city||'-')}</div><span class="badge ${esc(e.status)}">${esc(e.status)}</span></div>${eventActionButtons(e)}</div>`).join(''):'<div class="empty-date">No events found.</div>');
}

function renderDateEvents(){
  const input=$('dashboardDate'); if(!input)return;
  const selected=input.value||iso(new Date());
  const list=events.filter(e=>e.eventDate===selected).sort(sortEvent);
  const title=new Date(selected+'T00:00:00').toLocaleDateString('en-GB',{weekday:'long',day:'2-digit',month:'long',year:'numeric'});
  $('dateEvents').innerHTML=`<div class="selected-date-title">${esc(title)} <span class="badge">${list.length} event${list.length===1?'':'s'}</span></div>`+(list.length?list.map(e=>`<div class="date-event-card"><div class="date-event-time">${fmtTime(e.eventTime)}</div><div class="date-event-info"><b>${esc(e.familyPersonName)} · ${esc(e.eventType)}</b><div class="meta">${esc(e.venueLocation||'-')} · ${esc(e.city||'-')}</div><span class="badge ${esc(e.status)}">${esc(e.status)}</span></div>${eventActionButtons(e)}</div>`).join(''):'<div class="empty-date">No events found for this date.</div>');
}
$('dashboardDate').onchange=renderDateEvents;
$('viewToday').onclick=()=>{$('dashboardDate').value=iso(new Date());renderDateEvents()};
$('viewTomorrow').onclick=()=>{const d=new Date();d.setDate(d.getDate()+1);$('dashboardDate').value=iso(d);renderDateEvents()};

function renderTable(){const q=$('search').value.toLowerCase(),f=$('fromDate').value,t=$('toDate').value;const list=events.filter(e=>(!q||JSON.stringify(e).toLowerCase().includes(q))&&(!f||e.eventDate>=f)&&(!t||e.eventDate<=t)).sort(sortEvent);$('eventRows').innerHTML=list.length?list.map(e=>`<tr><td>${fmtDate(e.eventDate)}</td><td>${fmtTime(e.eventTime)}</td><td><b>${esc(e.familyPersonName)}</b><div class="meta">${esc(e.status)}</div></td><td>${esc(e.eventType)}</td><td>${esc(e.day)}</td><td>${esc(e.venueLocation||'-')}</td><td>${esc(e.city||'-')}</td><td>${e.googleMapsLink?`<a href="${esc(e.googleMapsLink)}" target="_blank">Open Map</a>`:'-'}</td><td class="actions"><button onclick="editEvent('${e.id}')">Edit</button>${user.role==='admin'?`<button class="danger" onclick="deleteEvent('${e.id}')">Delete</button>`:''}</td></tr>`).join(''):'<tr><td colspan="9">No events found.</td></tr>'}
['search','fromDate','toDate'].forEach(x=>$(x).oninput=renderTable);$('clearFilters').onclick=()=>{['search','fromDate','toDate'].forEach(x=>$(x).value='');renderTable()};$('exportBtn').onclick=()=>{const cols=['eventDate','eventTime','familyPersonName','eventType','day','venueLocation','city','googleMapsLink','details','status'];const names=['Event Date','Event Time','Family / Person Name','Event Type','Day','Venue / Location','City','Google Maps Link','Additional Details','Status'];const q=v=>'\"'+String(v??'').replace(/\"/g,'\"\"')+'\"';const csv='\ufeff'+names.map(q).join(',')+'\n'+events.map(e=>cols.map(k=>q(e[k])).join(',')).join('\n');const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='TELEC_Event_Data.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};
window.openEventMap=id=>{const e=events.find(x=>x.id===id);if(!e||!e.googleMapsLink)return toast('Google Maps link is not available for this event.',true);let url=String(e.googleMapsLink).trim();if(!/^https?:\/\//i.test(url))return toast('Invalid Google Maps link.',true);const w=window.open(url,'_blank','noopener,noreferrer');if(!w)window.location.href=url};
window.editEvent=id=>{const e=events.find(x=>x.id===id);if(!e)return;['eventDate','eventTime','familyPersonName','eventType','day','venueLocation','city','googleMapsLink','details','status'].forEach(k=>$(k).value=e[k]||'');$('eventId').value=e.id;$('revision').value=e.revision;updateMapPreview();show('add')};window.deleteEvent=async id=>{if(!confirm('Delete this event? A backup will be created.'))return;try{await api('/api/events/'+id,{method:'DELETE'});toast('Event deleted');await load()}catch(e){toast(e.message,true)}};
function setDay(){if(!$('eventDate').value){$('day').value='';return}$('day').value=new Date($('eventDate').value+'T00:00:00').toLocaleDateString('en-GB',{weekday:'long'})}$('eventDate').onchange=setDay;
function updateMapPreview(){const box=$('mapPreview');if(!box)return;const url=String($('googleMapsLink').value||'').trim();box.innerHTML=url?`<a class="map-button primary" href="${esc(url)}" target="_blank" rel="noopener noreferrer">📍 Open Saved Map Link</a>`:'<span class="meta">No map link saved for this event.</span>';} $('googleMapsLink').addEventListener('input',updateMapPreview);
function clearForm(){$('eventForm').reset();$('eventId').value='';$('revision').value='';$('status').value='Pending';$('eventDate').value=iso(new Date());setDay();$('posterStatus').textContent='';updateMapPreview()}$('cancelEdit').onclick=clearForm;
$('eventForm').onsubmit=async ev=>{ev.preventDefault();const keys=['eventDate','eventTime','familyPersonName','eventType','day','venueLocation','city','googleMapsLink','details','status','revision'];const body=Object.fromEntries(keys.map(k=>[k,$(k).value]));const id=$('eventId').value;try{await api('/api/events'+(id?'/'+id:''),{method:id?'PATCH':'POST',body:JSON.stringify(body)});toast(id?'Event updated successfully':'Event saved successfully');clearForm();await load();show('events')}catch(e){toast(e.message,true)}};
async function compressPoster(file){
  if(!file||!/^image\/(png|jpeg|webp)$/.test(file.type))throw new Error('Please select a JPG, PNG or WebP poster.');
  const dataUrl=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error('Poster could not be opened.'));r.readAsDataURL(file)});
  const image=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(new Error('Poster image is invalid.'));i.src=dataUrl});
  const maxSide=1800,scale=Math.min(1,maxSide/Math.max(image.width,image.height));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
  canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
  return canvas.toDataURL('image/jpeg',0.82)
}
$('readPoster').onclick=async()=>{const f=$('posterFile').files[0];if(!f)return toast('Please select a poster image.',true);$('posterStatus').textContent='Optimizing and reading poster...';try{const dataUrl=await compressPoster(f);const d=await api('/api/poster/parse',{method:'POST',body:JSON.stringify({dataUrl})});['eventDate','eventTime','familyPersonName','eventType','day','venueLocation','city','googleMapsLink','details'].forEach(k=>{if(d[k])$(k).value=d[k]});if(!$('day').value)setDay();updateMapPreview();$('posterStatus').textContent=`Poster read successfully${d.modelUsed?' using '+d.modelUsed:''}. Please review before saving.`;toast('Poster details extracted')}catch(e){$('posterStatus').textContent=e.message;toast(e.message,true)}};
$('userForm').onsubmit=async e=>{e.preventDefault();try{await api('/api/users',{method:'POST',body:JSON.stringify({name:$('uName').value,username:$('uUser').value,password:$('uPass').value,role:$('uRole').value})});e.target.reset();toast('User created');await load()}catch(x){toast(x.message,true)}};
function renderUsers(){if(!user||user.role!=='admin')return;$('userList').innerHTML=users.map(u=>`<div class="user-row"><div><b>${esc(u.name)}</b><div class="meta">${esc(u.username)} · ${u.role} · ${u.active?'Active':'Disabled'}</div></div><button onclick="toggleUser('${u.id}',${!u.active})">${u.active?'Disable':'Enable'}</button></div>`).join('')}
window.toggleUser=async(id,active)=>{try{await api('/api/users/'+id,{method:'PATCH',body:JSON.stringify({active})});await load();toast('User updated')}catch(e){toast(e.message,true)}};$('testGemini').onclick=async()=>{try{$('geminiState').textContent='Testing secure poster reader...';const d=await api('/api/system/test-gemini',{method:'POST'});$('geminiState').textContent=d.message;toast(d.message)}catch(e){$('geminiState').textContent=e.message;toast(e.message,true)}};
$('refreshSystem').onclick=async()=>{await load();toast('Latest data loaded from Supabase')};

function renderAudit(){if(!user||user.role!=='admin')return;$('auditList').innerHTML=audit.map(a=>`<div class="audit-row"><span>${new Date(a.at).toLocaleString('en-GB')}</span><b>${esc(a.user)}</b><span>${esc(a.action)}</span><span>${esc(a.detail)}</span></div>`).join('')}
function iso(d){return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10)}function sortEvent(a,b){return(a.eventDate+a.eventTime).localeCompare(b.eventDate+b.eventTime)}function fmtDate(s){return s?new Date(s+'T00:00:00').toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}):''}function fmtTime(s){if(!s)return'';const[h,m]=s.split(':');return new Date(2000,0,1,h,m).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}function esc(s){return String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
clearForm();if(token)load();

// Paste Email / WhatsApp schedule parser
let parsedScheduleEvents=[];
function normaliseScheduleText(text){return String(text||'').replace(/\r/g,'').replace(/[–—]/g,'-').trim()}
function parseHeaderDate(text){
  const months={jan:1,january:1,feb:2,february:2,mar:3,march:3,apr:4,april:4,may:5,jun:6,june:6,jul:7,july:7,aug:8,august:8,sep:9,sept:9,september:9,oct:10,october:10,nov:11,november:11,dec:12,december:12};
  let m=text.match(/(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)?\s*,?\s*(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\s+(20\d{2})/i);
  if(!m)m=text.match(/(20\d{2})[-\/]([01]?\d)[-\/]([0-3]?\d)/);
  if(!m)return'';
  if(/^20/.test(m[1]))return `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
  const mon=months[m[2].toLowerCase()]; if(!mon)return'';
  return `${m[3]}-${String(mon).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
}
function to24Hour(h,m,ampm){h=Number(h);m=Number(m||0);const ap=String(ampm||'').toLowerCase();if(ap==='pm'&&h<12)h+=12;if(ap==='am'&&h===12)h=0;return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`}
function smartCity(venue){const v=venue.toLowerCase();if(/pindi|rawalpindi/.test(v))return'Rawalpindi';if(/islamabad|nhq|fauji foundation|dgp army/.test(v))return'Islamabad';if(/karachi|telec office/.test(v))return'Karachi';if(/lahore/.test(v))return'Lahore';return''}
function cleanMeetingLine(line){return line.replace(/^\s*\d+\s*[).:-]\s*/,'').replace(/\s+/g,' ').trim()}
function parseScheduleText(text){
  text=normaliseScheduleText(text);const date=parseHeaderDate(text);if(!date)throw new Error('Date not found. Add a heading like: Wednesday 29 July 2026');
  let lines=text.split(/\n+/).map(cleanMeetingLine).filter(Boolean);
  lines=lines.filter(x=>!parseHeaderDate(x)||/\b(?:at|meeting|visit|dinner|lunch|seminar|conference)\b/i.test(x));
  const out=[];
  for(const line of lines){
    const tm=[...line.matchAll(/\b(?:at\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/ig)].pop();
    if(!tm)continue;
    const eventTime=to24Hour(tm[1],tm[2],tm[3]);
    let before=line.slice(0,tm.index).replace(/\s+at\s*$/i,'').trim();
    let after=line.slice(tm.index+tm[0].length).trim();
    let venue='',person='';
    const withMatch=before.match(/(?:meeting|visit|lunch|dinner|session|conference|seminar)\s+with\s+(.+?)(?:\s+at\s+(.+))?$/i);
    if(withMatch){person=withMatch[1].trim();venue=(withMatch[2]||'').trim()}
    else {
      const atParts=before.split(/\s+at\s+/i);
      const subject=atParts.shift()||'';venue=atParts.join(' at ').trim();
      person=subject.replace(/^(?:meeting|visit|lunch|dinner|session|conference|seminar)\s+(?:with\s+)?/i,'').trim();
    }
    if(after&&!venue)venue=after.replace(/^at\s+/i,'').trim();
    if(after&&venue&&!venue.toLowerCase().includes(after.toLowerCase()))venue=(venue+' '+after).trim();
    person=person.replace(/\s+at\s+.+$/i,'').replace(/\s*,\s*/g,', ').trim();
    if(!person)person='Scheduled Meeting';
    out.push({eventDate:date,eventTime,familyPersonName:person,eventType:/visit/i.test(line)?'Visit':/dinner/i.test(line)?'Dinner':/lunch/i.test(line)?'Lunch':'Meeting',day:new Date(date+'T00:00:00').toLocaleDateString('en-GB',{weekday:'long'}),venueLocation:venue,city:smartCity(venue),googleMapsLink:'',details:line,status:'Pending'});
  }
  return out.sort(sortEvent);
}
function renderSchedulePreview(){
  const box=$('schedulePreview');
  if(!parsedScheduleEvents.length){box.innerHTML='';return}
  box.innerHTML=`<div class="schedule-preview"><b>${parsedScheduleEvents.length} event${parsedScheduleEvents.length===1?'':'s'} detected — arranged by time</b><table><thead><tr><th>Date</th><th>Time</th><th>Person / Subject</th><th>Venue</th><th>City</th><th></th></tr></thead><tbody>${parsedScheduleEvents.map((e,i)=>`<tr><td><input type="date" value="${esc(e.eventDate)}" onchange="updateParsed(${i},'eventDate',this.value)"></td><td><input type="time" value="${esc(e.eventTime)}" onchange="updateParsed(${i},'eventTime',this.value)"></td><td><input class="wide" value="${esc(e.familyPersonName)}" onchange="updateParsed(${i},'familyPersonName',this.value)"></td><td><input class="wide" value="${esc(e.venueLocation)}" onchange="updateParsed(${i},'venueLocation',this.value)"></td><td><input value="${esc(e.city)}" onchange="updateParsed(${i},'city',this.value)"></td><td><button type="button" class="danger" onclick="removeParsed(${i})">Remove</button></td></tr>`).join('')}</tbody></table><div class="save-all-row"><button type="button" id="saveAllParsed" class="primary">Save All Events</button></div></div>`;
  $('saveAllParsed').onclick=saveAllParsedEvents;
}
window.updateParsed=(i,k,v)=>{parsedScheduleEvents[i][k]=v;if(k==='eventDate')parsedScheduleEvents[i].day=new Date(v+'T00:00:00').toLocaleDateString('en-GB',{weekday:'long'});parsedScheduleEvents.sort(sortEvent);renderSchedulePreview()};
window.removeParsed=i=>{parsedScheduleEvents.splice(i,1);renderSchedulePreview()};
$('parseSchedule').onclick=()=>{try{parsedScheduleEvents=parseScheduleText($('scheduleText').value);if(!parsedScheduleEvents.length)throw new Error('No meeting time found. Use times such as 10:30 AM or 3 PM.');$('scheduleStatus').className='meta parse-ok';$('scheduleStatus').textContent=`${parsedScheduleEvents.length} events detected successfully.`;renderSchedulePreview()}catch(e){parsedScheduleEvents=[];$('scheduleStatus').className='meta parse-error';$('scheduleStatus').textContent=e.message;renderSchedulePreview();toast(e.message,true)}};
$('clearSchedule').onclick=()=>{$('scheduleText').value='';parsedScheduleEvents=[];$('scheduleStatus').textContent='';renderSchedulePreview()};
async function saveAllParsedEvents(){
  if(!parsedScheduleEvents.length)return;
  const btn=$('saveAllParsed');btn.disabled=true;btn.textContent='Saving...';let ok=0,failed=[];
  for(const e of [...parsedScheduleEvents].sort(sortEvent)){
    try{await api('/api/events',{method:'POST',body:JSON.stringify(e)});ok++}catch(err){failed.push(`${e.eventTime} ${e.familyPersonName}: ${err.message}`)}
  }
  btn.disabled=false;btn.textContent='Save All Events';
  if(failed.length)toast(`${ok} saved; ${failed.length} failed.`,true);else toast(`${ok} events saved in date and time sequence.`);
  if(ok){$('scheduleText').value='';parsedScheduleEvents=[];renderSchedulePreview();await load();show('events')}
}
