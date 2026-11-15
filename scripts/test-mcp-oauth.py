import base64, hashlib, json, os, secrets, subprocess, urllib.parse, urllib.request, urllib.error
# Only run against the named, disposable local test project.
from pathlib import Path
workdir=os.environ.get('MEMQ_MCP_TEST_WORKDIR')
if not workdir:
 raise SystemExit('Set MEMQ_MCP_TEST_WORKDIR to the disposable memq-oauth-local project directory.')
config=Path(workdir, 'supabase/config.toml').read_text()
if 'project_id = "memq-oauth-local"' not in config:
 raise SystemExit('Refusing to run: expected the disposable memq-oauth-local project.')
base='http://127.0.0.1:55421'
env=dict(os.environ, NPM_CONFIG_CACHE='/private/tmp/memq-npm-cache')
status=json.loads(subprocess.check_output(['npx','--offline','--yes','supabase@latest','status','--output','json','--workdir',workdir],env=env,stderr=subprocess.DEVNULL))
key=status.get('ANON_KEY') or status['PUBLISHABLE_KEY']
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*args,**kwargs): return None
opener=urllib.request.build_opener(NoRedirect)
def request(path, method='GET', body=None, bearer=None, form=False):
 headers={'apikey':key,'Accept':'application/json'}
 if bearer: headers['Authorization']='Bearer '+bearer
 if body is not None:
  headers['Content-Type']='application/x-www-form-urlencoded' if form else 'application/json'
  body=(urllib.parse.urlencode(body) if form else json.dumps(body)).encode()
 req=urllib.request.Request(base+path,data=body,method=method,headers=headers)
 try:
  with opener.open(req,timeout=30) as response: return response.status,dict(response.headers),response.read().decode()
 except urllib.error.HTTPError as e:
  text=e.read().decode();
  if e.code in (301,302,303,307,308): return e.code,dict(e.headers),text
  raise RuntimeError(f'{method} {path.split("?")[0]} failed: {e.code} {text[:400]}') from None
def obj(path, method='GET', body=None, bearer=None, form=False):
 status,headers,text=request(path,method,body,bearer,form);return json.loads(text)
user=obj('/auth/v1/signup','POST',{'email':f'mcp-{secrets.token_hex(4)}@example.test','password':'Local-Only-Testing-123!'})
user_token=user.get('access_token')
assert user_token, 'Signup did not issue a user token'
client=obj('/auth/v1/oauth/clients/register','POST',{'client_name':'MemQ local MCP test','redirect_uris':['http://127.0.0.1:18473/oauth/callback'],'grant_types':['authorization_code','refresh_token'],'response_types':['code'],'token_endpoint_auth_method':'none'})
client_id=client['client_id']
verifier=secrets.token_urlsafe(48)
challenge=base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b'=').decode()
params={'client_id':client_id,'redirect_uri':'http://127.0.0.1:18473/oauth/callback','response_type':'code','scope':'openid offline_access','code_challenge':challenge,'code_challenge_method':'S256','state':'test-state'}
status,headers,_=request('/auth/v1/oauth/authorize?'+urllib.parse.urlencode(params))
assert status in (302,303),f'expected auth redirect got {status}'
auth_id=urllib.parse.parse_qs(urllib.parse.urlparse(headers['Location']).query)['authorization_id'][0]
details=obj('/auth/v1/oauth/authorizations/'+auth_id,bearer=user_token)
assert details['client']['id']==client_id
consent=obj('/auth/v1/oauth/authorizations/'+auth_id+'/consent','POST',{'action':'approve'},user_token)
query=urllib.parse.parse_qs(urllib.parse.urlparse(consent['redirect_url']).query)
assert query['state']==['test-state']
tokens=obj('/auth/v1/oauth/token','POST',{'grant_type':'authorization_code','client_id':client_id,'redirect_uri':'http://127.0.0.1:18473/oauth/callback','code_verifier':verifier,'code':query['code'][0]},form=True)
access=tokens['access_token']
if os.environ.get('MEMQ_MCP_AUDIT_AUTH') == '1':
 # Disposable user only: determine whether an OAuth token can mutate Auth user metadata.
 try:
  obj('/auth/v1/user','PUT',{'data':{'mcp_local_audit':'temporary'}},access)
  current=obj('/auth/v1/user',bearer=user_token)
  assert current.get('user_metadata',{}).get('mcp_local_audit')=='temporary', 'Auth response did not persist metadata'
  print('AUDIT: OAuth token can modify the user’s Auth metadata; RLS does not protect Auth endpoints.')
 except RuntimeError as e:
  if 'failed: 401' in str(e) or 'failed: 403' in str(e):
   print('AUDIT: Auth rejected metadata modification with an OAuth token.')
  else: raise
if os.environ.get('MEMQ_MCP_TEST_RLS') == '1':
 user_id=user['user']['id']
 request('/rest/v1/user_daily_progress','POST',{'user_id':user_id,'value':1},user_token)
 assert len(obj('/rest/v1/user_daily_progress?select=*',bearer=user_token))==1, 'direct user cannot read progress'
 assert obj('/rest/v1/user_daily_progress?select=*',bearer=access)==[], 'OAuth token can read progress'
 try:
  request('/rest/v1/user_daily_progress','POST',{'user_id':user_id,'value':2},access)
  raise AssertionError('OAuth token could insert progress')
 except RuntimeError as e:
  assert 'failed: 403' in str(e),str(e)
headers={'Content-Type':'application/json','Accept':'application/json, text/event-stream','Authorization':'Bearer '+access}
def mcp(name,args, token=None, expect_error=False):
 headers['Authorization']='Bearer '+(token or access)
 data=json.dumps({'jsonrpc':'2.0','id':1,'method':'tools/call','params':{'name':name,'arguments':args}}).encode()
 req=urllib.request.Request(base+'/functions/v1/mcp',data=data,headers=headers)
 try:
  with urllib.request.urlopen(req,timeout=60) as response: text=response.read().decode()
 except urllib.error.HTTPError as e: raise RuntimeError(f'MCP {name} failed: {e.code} {e.read().decode()[:400]}') from None
 payload=json.loads(next(line[6:] for line in text.splitlines() if line.startswith('data: ')))
 res=payload.get('result',{})
 if (res.get('isError') or 'error' in payload) and not expect_error: raise RuntimeError(f'MCP {name} failed')
 if expect_error:
  assert res.get('isError') or 'error' in payload, f'MCP {name} should have failed'
  return res
 return json.loads(res['content'][0]['text'])
r=mcp('create_lesson',{'name':'Local OAuth Lesson','cards':[{'term':'Hello','definition':'A greeting'}]})
assert r['cards_created']==1,r
lesson_id=r['id']
result=mcp('add_cards',{'lesson_id':lesson_id,'cards':[{'term':'World','definition':'Earth'}]})
assert result['cards_created']==1,result
cards=mcp('list_cards',{'lesson_id':lesson_id})['cards']
assert len(cards)==2,cards
card_id=cards[0]['id']
assert mcp('update_lesson',{'lesson_id':lesson_id,'name':'Updated Lesson'})['lesson']['name']=='Updated Lesson'
assert mcp('update_card',{'lesson_id':lesson_id,'card_id':card_id,'definition':'Updated definition'})['card']['definition']=='Updated definition'
mcp('delete_card',{'lesson_id':lesson_id,'card_id':card_id,'confirm':False},expect_error=True)
second=mcp('create_lesson',{'name':'Second Local Lesson','cards':[]})
r=mcp('list_lessons',{'limit':1})
assert len(r['lessons'])==1 and r['next_offset']==1,r
page2=mcp('list_lessons',{'limit':1,'offset':r['next_offset']})
assert len(page2['lessons'])==1 and page2['next_offset'] is None,page2
assert {r['lessons'][0]['id'],page2['lessons'][0]['id']}=={lesson_id,second['id']},'pagination omitted a lesson'
r=mcp('list_lessons',{})
assert any(x['id']==lesson_id for x in r['lessons']),r
other=obj('/auth/v1/signup','POST',{'email':f'mcp-{secrets.token_hex(4)}@example.test','password':'Local-Only-Testing-123!'})
other_token=other['access_token']
r=mcp('list_lessons',{},other_token)
assert not any(x['id']==lesson_id for x in r['lessons']),r
mcp('add_cards',{'lesson_id':lesson_id,'cards':[{'term':'intrusion','definition':'blocked'}]},other_token,True)
mcp('list_cards',{'lesson_id':lesson_id},other_token,True)
mcp('update_lesson',{'lesson_id':lesson_id,'name':'intrusion'},other_token,True)
mcp('delete_lesson',{'lesson_id':lesson_id,'confirm':True},other_token,True)
mcp('update_card',{'lesson_id':lesson_id,'card_id':card_id,'term':'intrusion'},other_token,True)
mcp('delete_card',{'lesson_id':lesson_id,'card_id':card_id,'confirm':True},other_token,True)
assert mcp('delete_card',{'lesson_id':lesson_id,'card_id':card_id,'confirm':True})['deleted_card']['id']==card_id
assert len(mcp('list_cards',{'lesson_id':lesson_id})['cards'])==1
assert mcp('delete_lesson',{'lesson_id':second['id'],'confirm':True})['deleted_lesson']['id']==second['id']
refresh=tokens.get('refresh_token')
assert refresh, 'offline access did not produce a refresh token'
renewed=obj('/auth/v1/oauth/token','POST',{'grant_type':'refresh_token','client_id':client_id,'refresh_token':refresh},form=True)
assert renewed.get('access_token') and renewed.get('refresh_token'), 'refresh failed'
assert any(x['id']==lesson_id for x in mcp('list_lessons',{},renewed['access_token'])['lessons'])
request('/auth/v1/user/oauth/grants?'+urllib.parse.urlencode({'client_id':client_id}),'DELETE',bearer=user_token)
try:
 obj('/auth/v1/oauth/token','POST',{'grant_type':'refresh_token','client_id':client_id,'refresh_token':renewed['refresh_token']},form=True)
 raise AssertionError('revoked refresh token remained usable')
except RuntimeError as e:
 assert 'failed: 4' in str(e),str(e)
try:
 mcp('list_lessons',{},renewed['access_token'])
 raise AssertionError('revoked access token remained usable')
except RuntimeError as e:
 assert 'MCP list_lessons failed: 401' in str(e),str(e)
denied_client=obj('/auth/v1/oauth/clients/register','POST',{'client_name':'MemQ denied test','redirect_uris':['http://127.0.0.1:18473/oauth/callback'],'grant_types':['authorization_code'],'response_types':['code'],'token_endpoint_auth_method':'none'})
denied_params={**params,'client_id':denied_client['client_id'],'state':'deny-test'}
_,denied_headers,_=request('/auth/v1/oauth/authorize?'+urllib.parse.urlencode(denied_params))
denied_id=urllib.parse.parse_qs(urllib.parse.urlparse(denied_headers['Location']).query)['authorization_id'][0]
obj('/auth/v1/oauth/authorizations/'+denied_id,bearer=user_token)
denied=obj('/auth/v1/oauth/authorizations/'+denied_id+'/consent','POST',{'action':'deny'},user_token)
denied_query=urllib.parse.parse_qs(urllib.parse.urlparse(denied['redirect_url']).query)
assert denied_query.get('error') == ['access_denied'] and denied_query.get('state') == ['deny-test'] and 'code' not in denied_query, 'denial did not return access_denied'
print('Passed: registration, PKCE, consent, lesson/card CRUD, isolation, refresh, and revocation.' + (' OAuth RLS verified.' if os.environ.get('MEMQ_MCP_TEST_RLS') == '1' else ''))
