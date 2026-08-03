import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const json = (res, status, data) => res.status(status).json(data);
const parseBody = (req) => {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return req.body;
};
const adminClient = () => createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});
const anonClient = () => createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});
const bearer = (req) => String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
const clean = (value) => value == null ? '' : String(value).trim();

function routeParts(req) {
  const queryPath = req.query?.path;
  if (Array.isArray(queryPath)) return queryPath.filter(Boolean);
  if (typeof queryPath === 'string' && queryPath) return queryPath.split('/').filter(Boolean);
  const pathname = new URL(req.url, 'https://local.invalid').pathname;
  return pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean).filter((x) => !['index.js'].includes(x));
}

function mapEvent(row) {
  return {
    id: row.id,
    eventDate: row.event_date,
    eventTime: row.event_time ? String(row.event_time).slice(0, 5) : '',
    familyPersonName: row.family_person_name,
    eventType: row.event_type,
    day: row.day || '',
    venueLocation: row.venue_location || '',
    city: row.city || '',
    googleMapsLink: row.google_maps_link || '',
    details: row.details || '',
    status: row.status || 'Pending',
    revision: row.revision || 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function eventRow(event) {
  return {
    event_date: clean(event.eventDate),
    event_time: clean(event.eventTime),
    family_person_name: clean(event.familyPersonName),
    event_type: clean(event.eventType),
    day: clean(event.day),
    venue_location: clean(event.venueLocation),
    city: clean(event.city),
    google_maps_link: clean(event.googleMapsLink),
    details: clean(event.details),
    status: clean(event.status) || 'Pending'
  };
}

function validateEvent(event) {
  const required = [
    ['eventDate', 'Event Date'],
    ['eventTime', 'Event Time'],
    ['familyPersonName', 'Family / Person Name'],
    ['eventType', 'Event Type']
  ];
  for (const [key, label] of required) {
    if (!clean(event[key])) throw Object.assign(new Error(`${label} is required.`), { status: 400 });
  }
}

async function authenticated(req) {
  const token = bearer(req);
  if (!token) throw Object.assign(new Error('Please sign in.'), { status: 401 });
  const client = anonClient();
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw Object.assign(new Error('Session expired. Please sign in again.'), { status: 401 });
  const admin = adminClient();
  const { data: profile, error: profileError } = await admin.from('profiles').select('*').eq('id', data.user.id).single();
  if (profileError || !profile || !profile.active) throw Object.assign(new Error('Account is disabled or missing.'), { status: 403 });
  return { user: data.user, profile, admin };
}

async function audit(admin, profile, action, detail = '') {
  await admin.from('activity_logs').insert({
    user_id: profile.id,
    user_name: profile.name,
    action,
    detail: clean(detail)
  });
}

async function fetchGeminiModels() {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not configured in Vercel.');
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(GEMINI_API_KEY)}`);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || 'Gemini connection failed.');
  return (payload.models || [])
    .filter((model) => (model.supportedGenerationMethods || []).includes('generateContent'))
    .map((model) => model.name.replace(/^models\//, ''));
}

function normalizePosterResult(raw) {
  const result = raw && typeof raw === 'object' ? raw : {};
  const date = clean(result.eventDate);
  const time = clean(result.eventTime).replace(/^(\d):/, '0$1:').slice(0, 5);
  return {
    eventDate: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '',
    eventTime: /^\d{2}:\d{2}$/.test(time) ? time : '',
    familyPersonName: clean(result.familyPersonName),
    eventType: clean(result.eventType),
    day: clean(result.day),
    venueLocation: clean(result.venueLocation),
    city: clean(result.city),
    googleMapsLink: /^https?:\/\//i.test(clean(result.googleMapsLink)) ? clean(result.googleMapsLink) : '',
    details: clean(result.details)
  };
}

async function callGemini(dataUrl) {
  if (!GEMINI_API_KEY) throw new Error('Gemini API key is not configured in Vercel.');
  const match = clean(dataUrl).match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);
  if (!match) throw new Error('Please upload a valid JPG, PNG or WebP poster.');

  const available = await fetchGeminiModels();
  const preferred = [
    'gemini-3.6-flash',
    'gemini-3.5-flash',
    'gemini-3.1-flash-lite',
    'gemini-3-flash',
    'gemini-2.5-flash-lite',
    'gemini-2.5-flash'
  ];
  const candidates = [
    ...preferred.filter((name) => available.includes(name)),
    ...available.filter((name) => /flash/i.test(name) && !preferred.includes(name))
  ].slice(0, 6);
  if (!candidates.length) throw new Error('No compatible Gemini Flash model is available for this API key.');

  const prompt = `Analyze this event invitation/poster. Return ONLY valid JSON, with no markdown, using exactly these keys:
{
  "eventDate":"YYYY-MM-DD or empty",
  "eventTime":"HH:MM in 24-hour format or empty",
  "familyPersonName":"main invited person, family, host or meeting subject",
  "eventType":"Meeting, Dinner, Majlis, Seminar, Conference, Workshop, Invitation, Visit, Travel, Wedding, Birthday or Other",
  "day":"weekday or empty",
  "venueLocation":"complete venue/address",
  "city":"city",
  "googleMapsLink":"only if explicitly printed as a full URL, otherwise empty",
  "details":"organizer, speakers, RSVP, contact number, dress code, agenda and other useful visible details"
}
Do not invent missing information. Read English and Urdu/Roman Urdu text where visible.`;

  let lastError = '';
  for (const model of candidates) {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: match[1], data: match[2] } }] }],
            generationConfig: { temperature: 0.1, responseMimeType: 'application/json' }
          })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          lastError = payload?.error?.message || `${model} failed.`;
          if ([429, 500, 502, 503, 504].includes(response.status) && attempt === 1) {
            await new Promise((resolve) => setTimeout(resolve, 750));
            continue;
          }
          break;
        }
        const text = payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '';
        const parsed = JSON.parse(text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim());
        return { ...normalizePosterResult(parsed), modelUsed: model };
      } catch (error) {
        lastError = error.message;
      }
    }
  }
  throw new Error(lastError || 'Poster could not be read. Please try again or enter the event manually.');
}

export default async function handler(req, res) {
  try {
    res.setHeader('Cache-Control', 'no-store');
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      return json(res, 500, { error: 'Supabase environment variables are incomplete in Vercel.' });
    }

    const parts = routeParts(req);
    const method = String(req.method || 'GET').toUpperCase();

    if (parts[0] === 'health' && method === 'GET') {
      return json(res, 200, { ok: true, databaseConfigured: true, geminiConfigured: Boolean(GEMINI_API_KEY) });
    }

    if (parts[0] === 'login' && method === 'POST') {
      const input = parseBody(req);
      const username = clean(input.username).toLowerCase();
      const password = String(input.password || '');
      const admin = adminClient();
      let { data: profile } = await admin.from('profiles').select('*').eq('username', username).maybeSingle();
      if (!profile) {
        const { count } = await admin.from('profiles').select('id', { count: 'exact', head: true });
        if (count === 0 && username === 'admin' && password.length >= 8) {
          const email = 'admin@telec.local';
          const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
          if (created.error) return json(res, 500, { error: created.error.message });
          const profileRow = {
            id: created.data.user.id,
            email,
            username: 'admin',
            name: 'System Administrator',
            role: 'admin',
            active: true,
            password_hash: await bcrypt.hash(password, 12)
          };
          const inserted = await admin.from('profiles').insert(profileRow).select().single();
          if (inserted.error) return json(res, 500, { error: inserted.error.message });
          profile = inserted.data;
        }
      }
      if (!profile || !profile.active || !(await bcrypt.compare(password, profile.password_hash))) {
        return json(res, 401, { error: 'Invalid username or password.' });
      }
      let { data, error } = await anonClient().auth.signInWithPassword({ email: profile.email, password });

      // Self-heal an out-of-sync Supabase Auth password.
      // The local profile password hash has already been verified above.
      if (error || !data.session) {
        const passwordUpdate = await admin.auth.admin.updateUserById(profile.id, {
          password,
          email_confirm: true
        });

        if (passwordUpdate.error) {
          console.error('Supabase Auth password sync failed:', passwordUpdate.error);
          return json(res, 401, { error: 'Login failed. Administrator account could not be synchronized.' });
        }

        const retry = await anonClient().auth.signInWithPassword({
          email: profile.email,
          password
        });

        data = retry.data;
        error = retry.error;
      }

      if (error || !data.session) {
        return json(res, 401, { error: 'Invalid username or password.' });
      }

      await audit(admin, profile, 'Login', 'Signed in');
      return json(res, 200, { token: data.session.access_token });
    }

    const { profile, admin } = await authenticated(req);

    if (parts[0] === 'logout' && method === 'POST') return json(res, 200, { ok: true });

    if (parts[0] === 'bootstrap' && method === 'GET') {
      const eventsQuery = admin.from('events').select('*').order('event_date', { ascending: true }).order('event_time', { ascending: true });
      const usersQuery = profile.role === 'admin'
        ? admin.from('profiles').select('id,name,username,role,active,created_at').order('name')
        : Promise.resolve({ data: [] });
      const logsQuery = profile.role === 'admin'
        ? admin.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(150)
        : Promise.resolve({ data: [] });
      const [{ data: eventRows, error: eventError }, { data: userRows }, { data: logRows }] = await Promise.all([eventsQuery, usersQuery, logsQuery]);
      if (eventError) throw new Error(eventError.message);
      return json(res, 200, {
        user: { id: profile.id, name: profile.name, username: profile.username, role: profile.role },
        events: (eventRows || []).map(mapEvent),
        users: userRows || [],
        audit: (logRows || []).map((row) => ({ at: row.created_at, user: row.user_name, action: row.action, detail: row.detail })),
        network: [
          { label: 'Database', value: 'Supabase Connected' },
          { label: 'Hosting', value: 'Vercel Online' },
          { label: 'Poster Reader', value: GEMINI_API_KEY ? 'Gemini Configured' : 'Gemini Not Configured' }
        ],
        settings: { geminiConfigured: Boolean(GEMINI_API_KEY) }
      });
    }

    if (parts[0] === 'events') {
      if (method === 'POST' && !parts[1]) {
        if (profile.role === 'viewer') throw Object.assign(new Error('This account is read-only.'), { status: 403 });
        const input = parseBody(req);
        validateEvent(input);
        const duplicate = await admin.from('events')
          .select('id')
          .eq('event_date', input.eventDate)
          .eq('event_time', input.eventTime)
          .ilike('family_person_name', clean(input.familyPersonName))
          .maybeSingle();
        if (duplicate.data) throw Object.assign(new Error('A matching event already exists.'), { status: 409 });
        const { data, error } = await admin.from('events').insert({
          ...eventRow(input), created_by: profile.id, updated_by: profile.id
        }).select().single();
        if (error) throw new Error(error.message);
        await audit(admin, profile, 'Create Event', input.familyPersonName);
        return json(res, 201, mapEvent(data));
      }

      if (parts[1] && ['PATCH', 'PUT'].includes(method)) {
        if (profile.role === 'viewer') throw Object.assign(new Error('This account is read-only.'), { status: 403 });
        const input = parseBody(req);
        validateEvent(input);
        const expectedRevision = Number(input.revision || 1);
        const { data: existing, error: existingError } = await admin.from('events').select('revision').eq('id', parts[1]).single();
        if (existingError || !existing) throw Object.assign(new Error('Event not found.'), { status: 404 });
        if (Number(existing.revision) !== expectedRevision) {
          throw Object.assign(new Error('This event was updated by another user. Refresh and try again.'), { status: 409 });
        }
        const { data, error } = await admin.from('events').update({
          ...eventRow(input), updated_by: profile.id, revision: expectedRevision + 1, updated_at: new Date().toISOString()
        }).eq('id', parts[1]).eq('revision', expectedRevision).select().single();
        if (error) throw new Error(error.message);
        await audit(admin, profile, 'Update Event', input.familyPersonName);
        return json(res, 200, mapEvent(data));
      }

      if (parts[1] && method === 'DELETE') {
        if (profile.role !== 'admin') throw Object.assign(new Error('Administrator access is required.'), { status: 403 });
        const { data: existing } = await admin.from('events').select('family_person_name').eq('id', parts[1]).maybeSingle();
        const { error } = await admin.from('events').delete().eq('id', parts[1]);
        if (error) throw new Error(error.message);
        await audit(admin, profile, 'Delete Event', existing?.family_person_name || parts[1]);
        return json(res, 200, { ok: true });
      }
    }

    if (parts[0] === 'poster' && parts[1] === 'parse' && method === 'POST') {
      if (profile.role === 'viewer') throw Object.assign(new Error('This account is read-only.'), { status: 403 });
      const output = await callGemini(parseBody(req).dataUrl);
      await audit(admin, profile, 'Read Poster', `Model: ${output.modelUsed || 'Gemini'}`);
      return json(res, 200, output);
    }

    if (parts[0] === 'system' && parts[1] === 'test-gemini' && method === 'POST') {
      const models = await fetchGeminiModels();
      const flashModels = models.filter((name) => /flash/i.test(name));
      return json(res, 200, { message: `Gemini connected. ${flashModels.length || models.length} compatible model(s) available.` });
    }

    if (parts[0] === 'users' && method === 'POST' && !parts[1]) {
      if (profile.role !== 'admin') throw Object.assign(new Error('Administrator access is required.'), { status: 403 });
      const input = parseBody(req);
      const username = clean(input.username).toLowerCase();
      const password = String(input.password || '');
      if (!/^[a-z0-9._-]{3,30}$/.test(username)) throw Object.assign(new Error('Username must be 3-30 characters using letters, numbers, dot, dash or underscore.'), { status: 400 });
      if (password.length < 8) throw Object.assign(new Error('Password must contain at least 8 characters.'), { status: 400 });
      const email = `${username}@telec.local`;
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error) throw new Error(error.message);
      const { error: insertError } = await admin.from('profiles').insert({
        id: data.user.id,
        email,
        username,
        name: clean(input.name),
        role: ['admin', 'editor', 'viewer'].includes(input.role) ? input.role : 'viewer',
        active: true,
        password_hash: await bcrypt.hash(password, 12)
      });
      if (insertError) {
        await admin.auth.admin.deleteUser(data.user.id);
        throw new Error(insertError.message);
      }
      await audit(admin, profile, 'Create User', username);
      return json(res, 201, { ok: true });
    }

    if (parts[0] === 'users' && parts[1] && method === 'PATCH') {
      if (profile.role !== 'admin') throw Object.assign(new Error('Administrator access is required.'), { status: 403 });
      if (parts[1] === profile.id && parseBody(req).active === false) throw Object.assign(new Error('You cannot disable your own account.'), { status: 400 });
      const { error } = await admin.from('profiles').update({ active: Boolean(parseBody(req).active) }).eq('id', parts[1]);
      if (error) throw new Error(error.message);
      await audit(admin, profile, 'Update User', parts[1]);
      return json(res, 200, { ok: true });
    }

    return json(res, 404, { error: 'API route not found.' });
  } catch (error) {
    console.error(error);
    return json(res, error.status || 500, { error: error.message || 'Unexpected server error.' });
  }
}