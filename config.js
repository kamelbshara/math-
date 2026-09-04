// Supabase project config
const SUPABASE_URL = 'https://iokqrdqmlrculyyxsufw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlva3FyZHFtbHJjdWx5eXhzdWZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg0MzU0ODIsImV4cCI6MjEwNDAxMTQ4Mn0.DeXyzfT7y68yv7OJrZSpZG0ezaoIzWFgmZbxDU9TkFc';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true }
});

const EDGE_FN_URL = SUPABASE_URL + '/functions/v1/admin-users';

async function callAdminFn(action, payload) {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) throw new Error('Not logged in');
  const res = await fetch(EDGE_FN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + session.access_token,
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ action, ...payload }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Request failed');
  return json;
}

async function getCurrentProfile() {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data, error } = await sb.from('profiles').select('*, classrooms(name)').eq('id', user.id).single();
  if (error) return null;
  return data;
}

async function requireAuth(allowedRoles) {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { window.location.href = 'index.html'; return null; }
  const profile = await getCurrentProfile();
  if (!profile || !profile.active) {
    await sb.auth.signOut();
    window.location.href = 'index.html?err=inactive';
    return null;
  }
  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    window.location.href = profile.role === 'admin' ? 'admin.html' : 'student.html';
    return null;
  }
  return profile;
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s == null ? '' : String(s);
  return d.innerHTML;
}
