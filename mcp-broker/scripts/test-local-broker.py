#!/usr/bin/env python3
"""Disposable local project only: never point this test at a hosted project."""
import base64, hashlib, html, http.cookiejar, json, os, re, secrets, subprocess, sys, urllib.parse, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
project=os.environ.get('MEMQ_MCP_TEST_WORKDIR','/private/tmp/memq-oauth-local')
port_by_project={'/private/tmp/memq-oauth-local':('memq-oauth-local',55421),'/private/tmp/memq-oauth-audit':('memq-oauth-audit',56421)}
assert project in port_by_project, 'Only explicitly named disposable projects are allowed'
project_id,supabase_port=port_by_project[project]
assert f'project_id = "{project_id}"' in Path(project, 'supabase/config.toml').read_text()
supabase=f'http://127.0.0.1:{supabase_port}'
port=int(os.environ.get('MEMQ_BROKER_TEST_PORT','8787'))
assert 1024 <= port <= 65535
broker=f'http://127.0.0.1:{port}'
callback='http://127.0.0.1:18473/oauth/callback'
status=json.loads(subprocess.check_output(['npx','--offline','--yes','supabase@latest','status','--output','json','--workdir',project],env=dict(os.environ,NPM_CONFIG_CACHE='/private/tmp/memq-npm-cache'),stderr=subprocess.DEVNULL))
key=status.get('ANON_KEY') or status['PUBLISHABLE_KEY']
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*args,**kwargs): return None
opener=urllib.request.build_opener(NoRedirect)
cookies={}
def request(url, method='GET', body=None, bearer=None, form=False, accept='application/json', basic=None):
 headers={'Accept':accept, 'apikey':key}
 if cookies: headers['Cookie']='; '.join(f'{k}={v}' for k,v in cookies.items())
 if bearer: headers['Authorization']='Bearer '+bearer
 if basic:
  user,secret=basic
  encoded=urllib.parse.quote_plus(user)+':'+urllib.parse.quote_plus(secret)
  headers['Authorization']='Basic '+base64.b64encode(encoded.encode()).decode()
 if body is not None:
  headers['Content-Type']='application/x-www-form-urlencoded' if form else 'application/json'
  body=(urllib.parse.urlencode(body) if form else json.dumps(body)).encode()
 req=urllib.request.Request(url,data=body,method=method,headers=headers)
 try: response=opener.open(req,timeout=30)
 except urllib.error.HTTPError as e: response=e
 with response:
  for raw in response.headers.get_all('Set-Cookie',[]):
   pair=raw.split(';',1)[0]
   name,value=pair.split('=',1)
   if value: cookies[name]=value
   else: cookies.pop(name,None)
  result=(response.status,response.headers,response.read().decode())
 if result[0]>=400: raise RuntimeError(f'{method} {urllib.parse.urlparse(url).path}: {result[0]} {result[2][:200]}')
 return result
def obj(*args,**kwargs): return json.loads(request(*args,**kwargs)[2])
def register(base,name,redirect):
 return obj(base+'/oauth/clients/register' if base==supabase+'/auth/v1' else base+'/oauth/register','POST',{'client_name':name,'redirect_uris':[redirect],'grant_types':['authorization_code','refresh_token'],'response_types':['code'],'token_endpoint_auth_method':'none'})
if len(sys.argv)>1 and sys.argv[1]=='prepare':
 client=register(supabase+'/auth/v1','Local Broker',broker+'/oauth/callback')
 Path('.dev.vars').write_text('BROKER_ENABLED=true\nBROKER_ORIGIN='+broker+'\nSUPABASE_URL='+supabase+'\nSUPABASE_OAUTH_CLIENT_ID='+client['client_id']+'\nSUPABASE_ANON_KEY='+key+'\n')
 print('Prepared local broker settings.')
 sys.exit(0)
user=obj(supabase+'/auth/v1/signup','POST',{'email':f'broker-{secrets.token_hex(4)}@example.test','password':'Local-Only-Testing-123!'})
direct=user['access_token']
client=register(broker,'Local MCP client',callback)
def deny_authorization(client_id):
 cookies.clear()
 verifier=secrets.token_urlsafe(48)
 challenge=base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b'=').decode()
 params={'client_id':client_id,'redirect_uri':callback,'response_type':'code','resource':broker+'/mcp','code_challenge':challenge,'code_challenge_method':'S256','state':'deny-test'}
 _,_,page=request(broker+'/authorize?'+urllib.parse.urlencode(params),accept='text/html')
 match=re.search(r'name="handle" value="([^"]+)"',page)
 assert match,'Missing consent handle'
 handle=html.unescape(match.group(1))
 bound_cookies=cookies.copy()
 cookies.clear()
 try:
  request(broker+'/authorize','POST',{'handle':handle,'decision':'approve'},form=True)
  raise AssertionError('Unbound consent was accepted')
 except RuntimeError as e:
  assert ': 400 ' in str(e),str(e)
 cookies.update(bound_cookies)
 _,headers,_=request(broker+'/authorize','POST',{'handle':handle,'decision':'deny'},form=True)
 query=urllib.parse.parse_qs(urllib.parse.urlparse(headers['Location']).query)
 assert query.get('error')==['access_denied'] and query.get('state')==['deny-test'] and 'code' not in query
 try:
  request(broker+'/authorize','POST',{'handle':handle,'decision':'approve'},form=True)
  raise AssertionError('Replayed consent was accepted')
 except RuntimeError as e:
  assert ': 400 ' in str(e),str(e)
deny_authorization(client['client_id'])
def authorize(direct_token, client_id, client_secret=None, client_auth_method='client_secret_post', pending=False):
 cookies.clear()
 verifier=secrets.token_urlsafe(48)
 challenge=base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b'=').decode()
 params={'client_id':client_id,'redirect_uri':callback,'response_type':'code','scope':'offline_access','resource':broker+'/mcp','code_challenge':challenge,'code_challenge_method':'S256','state':'broker-test'}
 _,_,page=request(broker+'/authorize?'+urllib.parse.urlencode(params),accept='text/html')
 match=re.search(r'name="handle" value="([^"]+)"',page)
 assert match,'Missing consent handle'
 _,headers,_=request(broker+'/authorize','POST',{'handle':html.unescape(match.group(1)),'decision':'approve'},form=True)
 _,headers,_=request(headers['Location'])
 authorization_id=urllib.parse.parse_qs(urllib.parse.urlparse(headers['Location']).query)['authorization_id'][0]
 details=obj(supabase+'/auth/v1/oauth/authorizations/'+authorization_id,bearer=direct_token)
 consent=details if 'redirect_url' in details else obj(supabase+'/auth/v1/oauth/authorizations/'+authorization_id+'/consent','POST',{'action':'approve'},direct_token)
 _,headers,_=request(consent['redirect_url'])
 query=urllib.parse.parse_qs(urllib.parse.urlparse(headers['Location']).query)
 assert query['state']==['broker-test']
 if pending: return {'code':query['code'][0], 'verifier':verifier}
 token_request={'grant_type':'authorization_code','client_id':client_id,'redirect_uri':callback,'code_verifier':verifier,'code':query['code'][0]}
 basic=None
 if client_secret and client_auth_method=='client_secret_basic':
  token_request.pop('client_id')
  basic=(client_id,client_secret)
 elif client_secret: token_request['client_secret']=client_secret
 tokens=obj(broker+'/oauth/token','POST',token_request,form=True,basic=basic)
 return tokens
tokens=authorize(direct, client['client_id'])
access=tokens['access_token']
# A broker token must not act as a Supabase Auth credential.
try:
 obj(supabase+'/auth/v1/user',bearer=access)
 raise AssertionError('Broker token unexpectedly accepted by Supabase Auth')
except RuntimeError as e:
 assert ': 401 ' in str(e) or ': 403 ' in str(e),str(e)
def mcp(name,args,token=access):
 _,_,raw=request(broker+'/mcp','POST',{'jsonrpc':'2.0','id':1,'method':'tools/call','params':{'name':name,'arguments':args}},token,accept='application/json, text/event-stream')
 payload=json.loads(next(line[6:] for line in raw.splitlines() if line.startswith('data: '))) if raw.startswith('event:') else json.loads(raw)
 result=payload.get('result',{})
 if result.get('isError') or 'error' in payload: raise RuntimeError('MCP call failed: '+str(payload)[:250])
 return json.loads(result['content'][0]['text'])
_,_,raw=request(broker+'/mcp','POST',{'jsonrpc':'2.0','id':2,'method':'tools/list','params':{}},access,accept='application/json, text/event-stream')
catalog=json.loads(next(line[6:] for line in raw.splitlines() if line.startswith('data: '))) if raw.startswith('event:') else json.loads(raw)
names={tool['name'] for tool in catalog['result']['tools']}
assert {'create_lesson_with_practice','add_cards_with_practice','add_practice_questions'} <= names,names
choice={'question_type':'mcq','question_text':'What is an atom?','options':['Unit of matter','An organ','A wave','A color','A planet'],'correct_answer':'Unit of matter'}
recall={'question_type':'fill_blank','question_text':'Explain an atom.','correct_answer':'Unit of matter'}
bundle={'term':'Atom','definition':'Unit of matter','questions':[choice,recall]}
atomic=mcp('create_lesson_with_practice',{'name':'Atomic practice','cards':[bundle]})
assert atomic['cards_created']==1 and atomic['questions_created']==2
atomic_card=atomic['cards'][0]['id']
assert len(mcp('list_practice_questions',{'lesson_id':atomic['id'],'card_id':atomic_card})['questions'])==2
extra=mcp('add_cards_with_practice',{'lesson_id':atomic['id'],'cards':[bundle]})
assert extra['cards_created']==1 and extra['questions_created']==2
assert mcp('delete_lesson',{'lesson_id':atomic['id'],'confirm':True})['deleted_lesson']['id']==atomic['id']
lesson=mcp('create_lesson',{'name':'Broker local test','cards':[{'term':'Test','definition':'A local example'}]})
assert lesson['cards_created']==1
assert len(lesson['cards'])==1 and lesson['cards'][0]['term']=='Test' and lesson['cards'][0]['id']
added=mcp('add_cards',{'lesson_id':lesson['id'],'cards':[{'term':'Extra','definition':'Another example'}]})
assert added['cards_created']==1 and added['cards'][0]['term']=='Extra' and added['cards'][0]['id']
assert mcp('delete_card',{'lesson_id':lesson['id'],'card_id':added['cards'][0]['id'],'confirm':True})['deleted_card']['id']==added['cards'][0]['id']
language=mcp('create_lesson',{'name':'Language local test','learning_mode':'language','cards':[{'term':'ciao','definition':'hello','language_data':{'language_code':'it-IT','example':'Ciao amico'}}]})
language_card=mcp('list_cards',{'lesson_id':language['id']})['cards'][0]
updated=mcp('update_card',{'lesson_id':language['id'],'card_id':language_card['id'],'language_data':{'pronunciation':'chow'}})['card']
assert updated['language_data']=={'language_code':'it-IT','example':'Ciao amico','pronunciation':'chow'},updated
assert mcp('delete_lesson',{'lesson_id':language['id'],'confirm':True})['deleted_lesson']['id']==language['id']
assert any(x['id']==lesson['id'] for x in mcp('list_lessons',{})['lessons'])
cards=mcp('list_cards',{'lesson_id':lesson['id']})['cards']
assert len(cards)==1
card_id=cards[0]['id']
card_revision=cards[0]['content_revision']
questions=[
 {'card_id':card_id,'card_revision':card_revision,'question_type':'mcq','question_text':'Which is a local example?', 'options':['A local example','A remote server','A database key','A login code','A network route','A user profile'], 'correct_answer':'A local example', 'explanation':'The card defines this as a local example.'},
 {'card_id':card_id,'card_revision':card_revision,'question_type':'fill_blank','question_text':'Explain the term in your own words.', 'correct_answer':'A local example'},
]
assert mcp('add_practice_questions',{'lesson_id':lesson['id'],'questions':questions})['questions_created']==2
saved=mcp('list_practice_questions',{'lesson_id':lesson['id'],'card_id':card_id})['questions']
assert len(saved)==2 and all(q['is_stale'] is False for q in saved) and any(len(q['options'])==6 for q in saved if q['question_type']=='mcq'),saved
mcq_id=next(q['id'] for q in saved if q['question_type']=='mcq')
recall_id=next(q['id'] for q in saved if q['question_type']=='fill_blank')
revised={**questions[0],'question_text':'Which answer fits best?'}
assert mcp('replace_practice_question',{'lesson_id':lesson['id'],'question_id':mcq_id,'question':revised})['question']['question_text']=='Which answer fits best?'
try:
 mcp('delete_practice_question',{'lesson_id':lesson['id'],'card_id':card_id,'question_id':recall_id,'confirm':False})
 raise AssertionError('Unconfirmed question deletion was accepted')
except RuntimeError as e:
 assert 'MCP call failed' in str(e),str(e)
try:
 mcp('add_practice_questions',{'lesson_id':lesson['id'],'questions':[{**questions[0],'options':['x'*101,'B','C','D','E'],'correct_answer':'B'}]})
 raise AssertionError('Overly long option was accepted')
except RuntimeError as e:
 assert 'MCP call failed' in str(e),str(e)
assert len(mcp('list_practice_questions',{'lesson_id':lesson['id'],'card_id':card_id})['questions'])==2
same_client=register(broker,'Same account second client',callback)
same_tokens=authorize(direct,same_client['client_id'])
assert any(x['id']==lesson['id'] for x in mcp('list_lessons',{},same_tokens['access_token'])['lessons'])
connections=obj(broker+'/connections',bearer=direct)['connections']
assert len(connections)==2 and {x['name'] for x in connections}=={'Local MCP client','Same account second client'},connections
first_grant=next(x['id'] for x in connections if x['name']=='Local MCP client')
try:
 obj(broker+'/connections',bearer=access)
 raise AssertionError('MCP token was accepted by connection management')
except RuntimeError as e:
 assert ': 401 ' in str(e),str(e)
other=obj(supabase+'/auth/v1/signup','POST',{'email':f'broker-other-{secrets.token_hex(4)}@example.test','password':'Local-Only-Testing-123!'})
other_client=register(broker,'Other MCP client',callback)
other_tokens=authorize(other['access_token'],other_client['client_id'])
if os.environ.get('MEMQ_COORDINATED_TEST') == '1':
 try:
  request(broker+'/connections/'+first_grant,'DELETE',bearer=other['access_token'])
  raise AssertionError('Foreign coordinator unexpectedly reported success')
 except RuntimeError as e:
  assert ': 503 ' in str(e),str(e)
else:
 request(broker+'/connections/'+first_grant,'DELETE',bearer=other['access_token'])
assert any(x['id']==lesson['id'] for x in mcp('list_lessons',{})['lessons']), 'Other user revoked the connection'
assert not any(x['id']==lesson['id'] for x in mcp('list_lessons',{},other_tokens['access_token'])['lessons'])
for operation,args in [
 ('list_cards',{'lesson_id':lesson['id']}),
 ('update_lesson',{'lesson_id':lesson['id'],'name':'Not permitted'}),
 ('delete_card',{'lesson_id':lesson['id'],'card_id':card_id,'confirm':True}),
 ('add_practice_questions',{'lesson_id':lesson['id'],'questions':questions}),
 ('list_practice_questions',{'lesson_id':lesson['id'],'card_id':card_id}),
 ('replace_practice_question',{'lesson_id':lesson['id'],'question_id':mcq_id,'question':revised}),
 ('delete_practice_question',{'lesson_id':lesson['id'],'card_id':card_id,'question_id':mcq_id,'confirm':True}),
]:
 try:
  mcp(operation,args,other_tokens['access_token'])
  raise AssertionError('Cross-account operation unexpectedly succeeded: '+operation)
 except RuntimeError as e:
  assert 'MCP call failed' in str(e),str(e)
assert mcp('update_lesson',{'lesson_id':lesson['id'],'name':'Updated broker lesson'})['lesson']['name']=='Updated broker lesson'
changed_card=mcp('update_card',{'lesson_id':lesson['id'],'card_id':card_id,'definition':'Updated'})['card']
assert changed_card['definition']=='Updated' and changed_card['content_revision']!=card_revision
try:
 mcp('add_practice_questions',{'lesson_id':lesson['id'],'questions':questions})
 raise AssertionError('New question based on an old card was accepted')
except RuntimeError as e:
 assert 'MCP call failed' in str(e),str(e)
stale=mcp('list_practice_questions',{'lesson_id':lesson['id'],'card_id':card_id})['questions']
assert len(stale)==2 and all(q['is_stale'] is True for q in stale),stale
practice_url=supabase+'/rest/v1/questions?'+urllib.parse.urlencode({'select':'*,terms!inner(content_revision)','term_id':'eq.'+card_id})
practice_rows=obj(practice_url,bearer=direct)
assert len(practice_rows)==2 and all(q['source_revision']!=q['terms']['content_revision'] for q in practice_rows),practice_rows
try:
 mcp('replace_practice_question',{'lesson_id':lesson['id'],'question_id':mcq_id,'question':revised})
 raise AssertionError('Question based on old card was accepted')
except RuntimeError as e:
 assert 'MCP call failed' in str(e),str(e)
revised['card_revision']=changed_card['content_revision']
assert mcp('replace_practice_question',{'lesson_id':lesson['id'],'question_id':mcq_id,'question':revised})['question']['id']==mcq_id
refreshed=mcp('list_practice_questions',{'lesson_id':lesson['id'],'card_id':card_id})['questions']
assert next(q for q in refreshed if q['id']==mcq_id)['is_stale'] is False,refreshed
practice_rows=obj(practice_url,bearer=direct)
assert sum(q['source_revision']==q['terms']['content_revision'] for q in practice_rows)==1,practice_rows
assert mcp('delete_practice_question',{'lesson_id':lesson['id'],'card_id':card_id,'question_id':recall_id,'confirm':True})['deleted_question']['id']==recall_id
assert len(mcp('list_practice_questions',{'lesson_id':lesson['id'],'card_id':card_id})['questions'])==1
renewed=obj(broker+'/oauth/token','POST',{'grant_type':'refresh_token','client_id':client['client_id'],'refresh_token':tokens['refresh_token']},form=True)
assert any(x['id']==lesson['id'] for x in mcp('list_lessons',{},renewed['access_token'])['lessons'])
assert mcp('delete_card',{'lesson_id':lesson['id'],'card_id':card_id,'confirm':True},renewed['access_token'])['deleted_card']['id']==card_id
assert mcp('delete_lesson',{'lesson_id':lesson['id'],'confirm':True},renewed['access_token'])['deleted_lesson']['id']==lesson['id']
request(broker+'/connections/'+first_grant,'DELETE',bearer=direct)
remaining=obj(broker+'/connections',bearer=direct)['connections']
assert len(remaining)==1 and remaining[0]['name']=='Same account second client',remaining
try:
 mcp('list_lessons',{},renewed['access_token'])
 raise AssertionError('Revoked grant still accepts its access token')
except RuntimeError as e:
 assert ': 401 ' in str(e),str(e)
assert mcp('list_lessons',{},other_tokens['access_token'])['lessons']==[], 'Revocation affected another client'
same_lesson=mcp('create_lesson',{'name':'Still connected','cards':[]},same_tokens['access_token'])
assert mcp('delete_lesson',{'lesson_id':same_lesson['id'],'confirm':True},same_tokens['access_token'])['deleted_lesson']['id']==same_lesson['id']
same_renewed=obj(broker+'/oauth/token','POST',{'grant_type':'refresh_token','client_id':same_client['client_id'],'refresh_token':same_tokens['refresh_token']},form=True)
assert mcp('list_lessons',{},same_renewed['access_token'])['lessons']==[], 'Revocation broke the same user’s other connection'
def concurrent_refresh():
 try:
  return obj(broker+'/oauth/token','POST',{'grant_type':'refresh_token','client_id':same_client['client_id'],'refresh_token':same_renewed['refresh_token']},form=True)
 except RuntimeError:
  return None
with ThreadPoolExecutor(max_workers=2) as pool:
 results=list(pool.map(lambda _: concurrent_refresh(), range(2)))
assert any(results), 'Concurrent refresh invalidated both requests'
valid=0
for result in filter(None,results):
 try:
  mcp('list_lessons',{},result['access_token'])
  valid+=1
 except RuntimeError:
  pass
assert valid, 'Concurrent refresh produced no usable connection'
if os.environ.get('MEMQ_COORDINATED_TEST') == '1':
 pending_client=register(broker,'Pending authorization test',callback)
 pending=authorize(direct,pending_client['client_id'],pending=True)
 pending_grant=next(x['id'] for x in obj(broker+'/connections',bearer=direct)['connections'] if x['name']=='Pending authorization test')
 request(broker+'/connections/'+pending_grant,'DELETE',bearer=direct)
 try:
  obj(broker+'/oauth/token','POST',{'grant_type':'authorization_code','client_id':pending_client['client_id'],'redirect_uri':callback,'code_verifier':pending['verifier'],'code':pending['code']},form=True)
  raise AssertionError('Disconnected pending authorization accepted its code')
 except RuntimeError as e:
  assert ': 400 ' in str(e) or ': 503 ' in str(e),str(e)
 for kind in ('access_token', 'refresh_token'):
  rev_client=register(broker,'Revocation test '+kind,callback)
  rev_tokens=authorize(direct,rev_client['client_id'])
  request(broker+'/oauth/token','POST',{'token':rev_tokens[kind],'client_id':other_client['client_id']},form=True)
  mcp('list_lessons',{},rev_tokens['access_token'])
  request(broker+'/oauth/token','POST',{'token':'unknown:unknown:random','client_id':rev_client['client_id']},form=True)
  if os.environ.get('MEMQ_INJECT_REVOCATION_FAILURE') == '1' and kind == 'access_token':
   try:
    request(broker+'/oauth/token','POST',{'token':rev_tokens[kind],'client_id':rev_client['client_id']},form=True)
    raise AssertionError('Synthetic coordinator failure unexpectedly succeeded')
   except RuntimeError as e:
    assert ': 503 ' in str(e),str(e)
  request(broker+'/oauth/token','POST',{'token':rev_tokens[kind],'client_id':rev_client['client_id']},form=True)
  request(broker+'/oauth/token','POST',{'token':rev_tokens[kind],'client_id':rev_client['client_id']},form=True)
  try:
   mcp('list_lessons',{},rev_tokens['access_token'])
   raise AssertionError('RFC 7009 revoked grant still accepts access token')
  except RuntimeError as e:
   assert ': 401 ' in str(e),str(e)
  try:
   obj(broker+'/oauth/token','POST',{'grant_type':'refresh_token','client_id':rev_client['client_id'],'refresh_token':rev_tokens['refresh_token']},form=True)
   raise AssertionError('RFC 7009 revoked grant still refreshes')
  except RuntimeError as e:
   assert ': 400 ' in str(e) or ': 503 ' in str(e),str(e)
 confidential=obj(broker+'/oauth/register','POST',{'client_name':'Confidential revocation test','redirect_uris':[callback],'grant_types':['authorization_code','refresh_token'],'response_types':['code'],'token_endpoint_auth_method':'client_secret_post'})
 confidential_tokens=authorize(direct,confidential['client_id'],confidential['client_secret'])
 try:
  request(broker+'/oauth/token','POST',{'token':confidential_tokens['refresh_token'],'client_id':confidential['client_id'],'client_secret':'incorrect'},form=True)
  raise AssertionError('Invalid client secret accepted')
 except RuntimeError as e:
  assert ': 401 ' in str(e),str(e)
 basic_client=obj(broker+'/oauth/register','POST',{'client_name':'Basic revocation test','redirect_uris':[callback],'grant_types':['authorization_code','refresh_token'],'response_types':['code'],'token_endpoint_auth_method':'client_secret_basic'})
 basic_tokens=authorize(direct,basic_client['client_id'],basic_client['client_secret'],'client_secret_basic')
 try:
  request(broker+'/oauth/token','POST',{'token':basic_tokens['refresh_token']},form=True,basic=(basic_client['client_id'],'incorrect'))
  raise AssertionError('Invalid Basic secret accepted')
 except RuntimeError as e:
  assert ': 401 ' in str(e),str(e)
 mcp('list_lessons',{},basic_tokens['access_token'])
 request(broker+'/oauth/token','POST',{'token':basic_tokens['refresh_token']},form=True,basic=(basic_client['client_id'],basic_client['client_secret']))
 try:
  mcp('list_lessons',{},basic_tokens['access_token'])
  raise AssertionError('Basic-auth grant still accepted after revocation')
 except RuntimeError as e:
  assert ': 401 ' in str(e),str(e)
 mcp('list_lessons',{},confidential_tokens['access_token'])
 request(broker+'/oauth/token','POST',{'token':confidential_tokens['refresh_token'],'client_id':confidential['client_id'],'client_secret':confidential['client_secret']},form=True)
 try:
  mcp('list_lessons',{},confidential_tokens['access_token'])
  raise AssertionError('Confidential grant still accepted after revocation')
 except RuntimeError as e:
  assert ': 401 ' in str(e),str(e)
print('Passed: consent denial/replay, PKCE, isolation, CRUD, refresh, same-user per-client revocation, and local concurrent refresh.')
