#!/usr/bin/env python3
"""Real-browser OAuth test against localhost-only disposable services."""
import base64, hashlib, json, os, secrets, subprocess, time, urllib.parse, urllib.request, websocket
from pathlib import Path
project='/private/tmp/memq-oauth-local'
assert 'project_id = "memq-oauth-local"' in Path(project,'supabase/config.toml').read_text()
supabase='http://127.0.0.1:55421'; broker='http://127.0.0.1:8787'; callback='http://127.0.0.1:18473/oauth/callback'
status=json.loads(subprocess.check_output(['npx','--offline','--yes','supabase@latest','status','--output','json','--workdir',project],env=dict(os.environ,NPM_CONFIG_CACHE='/private/tmp/memq-npm-cache'),stderr=subprocess.DEVNULL))
key=status.get('ANON_KEY') or status['PUBLISHABLE_KEY']
def post(url,body,form=False,token=None):
 headers={'Accept':'application/json','apikey':key,'Content-Type':'application/x-www-form-urlencoded' if form else 'application/json'}
 if token: headers['Authorization']='Bearer '+token
 req=urllib.request.Request(url,data=(urllib.parse.urlencode(body) if form else json.dumps(body)).encode(),headers=headers,method='POST')
 with urllib.request.urlopen(req,timeout=30) as response: return json.load(response)
email=f'browser-{secrets.token_hex(6)}@example.test'; password='Local-Only-Testing-123!'
post(supabase+'/auth/v1/signup',{'email':email,'password':password})
client=post(broker+'/oauth/register',{'client_name':'Browser integration test','redirect_uris':[callback],'grant_types':['authorization_code','refresh_token'],'response_types':['code'],'token_endpoint_auth_method':'none'})
verifier=secrets.token_urlsafe(48);challenge=base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b'=').decode()
params={'client_id':client['client_id'],'redirect_uri':callback,'response_type':'code','scope':'offline_access','resource':broker+'/mcp','code_challenge':challenge,'code_challenge_method':'S256','state':'browser-test'}
req=urllib.request.Request('http://127.0.0.1:19224/json/new?about:blank',method='PUT')
with urllib.request.urlopen(req) as r: tab=json.load(r)
ws=websocket.create_connection(tab['webSocketDebuggerUrl'],timeout=20); serial=0
def call(method,params=None):
 global serial
 serial+=1; ident=serial; ws.send(json.dumps({'id':ident,'method':method,'params':params or {}}))
 while True:
  event=json.loads(ws.recv())
  if event.get('id')==ident:
   if 'error' in event: raise RuntimeError(event['error'].get('message','CDP error'))
   return event.get('result',{})
def evaluate(js):
 try:
  result=call('Runtime.evaluate',{'expression':js,'returnByValue':True})
  if 'exceptionDetails' in result: return None
  return result.get('result',{}).get('value')
 except RuntimeError: return None
def wait_for(js, description):
 end=time.monotonic()+25
 while time.monotonic()<end:
  value=evaluate(js)
  if value: return value
  time.sleep(.2)
 raise RuntimeError('Timed out waiting for '+description)
call('Page.enable');call('Runtime.enable');call('Emulation.setDeviceMetricsOverride',{'width':390,'height':844,'deviceScaleFactor':1,'mobile':True})
call('Page.navigate',{'url':broker+'/authorize?'+urllib.parse.urlencode(params)})
wait_for("document.querySelector('button[value=approve]') && document.querySelector('button[value=approve]').offsetWidth > 0",'broker consent')
evaluate("document.querySelector('button[value=approve]').click(); true")
wait_for("location.port==='18475' && document.querySelector('#login') && !document.querySelector('#login').hidden",'MemQ sign in')
evaluate("document.querySelector('#email').value="+json.dumps(email)+";document.querySelector('#password').value="+json.dumps(password)+";document.querySelector('#login').requestSubmit();true")
wait_for("document.querySelector('#consent') && !document.querySelector('#consent').hidden",'MemQ consent')
evaluate("document.querySelector('#approve').click(); true")
redirect=wait_for("location.port==='18473' && location.pathname==='/oauth/callback' && location.search ? location.href : null",'client callback')
query=urllib.parse.parse_qs(urllib.parse.urlparse(redirect).query)
assert query['state']==['browser-test'] and query.get('code')
tokens=post(broker+'/oauth/token',{'grant_type':'authorization_code','client_id':client['client_id'],'redirect_uri':callback,'code_verifier':verifier,'code':query['code'][0]},form=True)
body={'jsonrpc':'2.0','id':1,'method':'tools/call','params':{'name':'list_lessons','arguments':{}}}
req=urllib.request.Request(broker+'/mcp',data=json.dumps(body).encode(),headers={'Authorization':'Bearer '+tokens['access_token'],'Content-Type':'application/json','Accept':'application/json, text/event-stream'},method='POST')
with urllib.request.urlopen(req,timeout=30) as response: raw=response.read().decode()
payload=json.loads(next(line[6:] for line in raw.splitlines() if line.startswith('data: '))) if raw.startswith('event:') else json.loads(raw)
assert not payload.get('result',{}).get('isError') and 'error' not in payload
ws.close()
print('Passed: real mobile browser consent, MemQ sign-in, authorization callback, and MCP call.')
