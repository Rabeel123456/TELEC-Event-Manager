import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

const required = ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing ${key}. Set it before running this script.`);
    process.exit(1);
  }
}

const username = String(process.env.ADMIN_USERNAME || 'admin').trim().toLowerCase();
const password = String(process.env.ADMIN_PASSWORD || 'Telec@2026');
const name = String(process.env.ADMIN_NAME || 'System Administrator').trim();
const email = `${username}@telec.local`;

if (password.length < 8) {
  console.error('ADMIN_PASSWORD must be at least 8 characters.');
  process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const { data: existingProfile } = await supabase.from('profiles').select('id,email').eq('username', username).maybeSingle();
let userId = existingProfile?.id;

if (!userId) {
  const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) {
    console.error(error.message);
    process.exit(1);
  }
  userId = data.user.id;
} else {
  const { error } = await supabase.auth.admin.updateUserById(userId, { password, email_confirm: true });
  if (error) {
    console.error(error.message);
    process.exit(1);
  }
}

const { error: profileError } = await supabase.from('profiles').upsert({
  id: userId,
  email,
  username,
  name,
  role: 'admin',
  active: true,
  password_hash: await bcrypt.hash(password, 12)
}, { onConflict: 'id' });

if (profileError) {
  console.error(profileError.message);
  process.exit(1);
}

console.log(`Administrator ready: ${username}`);
console.log('Change the default password before production use.');
