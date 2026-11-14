import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';
if (!window.supabase?.createClient) {
  const status = document.getElementById('status');
  status.textContent = 'The sign-in service could not be loaded. Please reload this page.';
  status.hidden = false;
  throw new Error('Supabase browser library did not load');
}
const { createClient } = window.supabase;
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const $ = (id) => document.getElementById(id);
const authorizationId = new URLSearchParams(location.search).get('authorization_id');
const showError = (message) => { $('status').textContent = message; $('status').hidden = false; };
const setBusy = (busy) => document.querySelectorAll('button').forEach((button) => { button.disabled = busy; });
async function load() {
  $('status').hidden = true;
  if (!authorizationId) { showError('This authorization request is missing or expired. Start again from your AI app.'); return; }
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) { $('login').hidden = false; $('consent').hidden = true; return; }
  $('login').hidden = true;
  const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);
  if (error || !data) { showError('Could not load this authorization request. Please start again from your AI app.'); return; }
  if ('redirect_url' in data) { location.assign(data.redirect_url); return; }
  $('client').textContent = data.client.name || 'An application';
  $('account').textContent = user.email || 'your MemQ account';
  $('redirect').textContent = data.redirect_uri;
  $('scope').textContent = data.scope || 'account access';
  $('consent').hidden = false;
}
$('login').addEventListener('submit', async (event) => {
  event.preventDefault(); setBusy(true); $('status').hidden = true;
  const { error } = await supabase.auth.signInWithPassword({ email: $('email').value.trim(), password: $('password').value });
  $('password').value = '';
  if (error) showError('Could not sign in. Check your email and password and try again.');
  else await load();
  setBusy(false);
});
async function decide(approve) {
  setBusy(true); $('status').hidden = true;
  const { data, error } = approve ? await supabase.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true }) : await supabase.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true });
  if (error || !data?.redirect_url) { showError('Could not complete the request. Please try again.'); setBusy(false); return; }
  location.assign(data.redirect_url);
}
async function signInWithProvider(provider) {
  setBusy(true); $('status').hidden = true;
  const returnUrl = new URL(location.href);
  returnUrl.hash = '';
  const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: returnUrl.toString() } });
  if (error) { showError('Could not start sign in. Please try another method.'); setBusy(false); }
}
$('google').addEventListener('click', () => signInWithProvider('google'));
$('apple').addEventListener('click', () => signInWithProvider('apple'));
$('approve').addEventListener('click', () => decide(true));
$('deny').addEventListener('click', () => decide(false));
$('switch').addEventListener('click', async () => { setBusy(true); await supabase.auth.signOut({ scope: 'local' }); $('consent').hidden = true; $('email').value = ''; await load(); setBusy(false); });
void load();
