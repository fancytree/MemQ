#!/usr/bin/env python3
"""Exercise the real Edge handler with disposable local Auth and Storage only."""
import json
import os
from pathlib import Path
import secrets
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request

project = '/private/tmp/memq-oauth-audit'
assert 'project_id = "memq-oauth-audit"' in Path(project, 'supabase/config.toml').read_text()
api = 'http://127.0.0.1:56421'
internal_api = 'http://kong:8000'
edge = 'http://127.0.0.1:18795'
root = Path(__file__).resolve().parents[1]
status = json.loads(subprocess.check_output(
    ['npx', '--offline', '--yes', 'supabase@latest', 'status', '--output', 'json', '--workdir', project],
    env={**os.environ, 'NPM_CONFIG_CACHE': '/private/tmp/memq-npm-cache'}, stderr=subprocess.DEVNULL,
))
assert status['API_URL'].rstrip('/') == api, 'Unexpected local API; refusing to run'
anon = status.get('ANON_KEY') or status['PUBLISHABLE_KEY']
admin = status['SERVICE_ROLE_KEY']
suffix = secrets.token_hex(6)
policy = f'memq_edge_pdf_{suffix}'
container = f'memq-pdf-edge-{suffix}'
bucket_created = False
policy_created = False
runtime_started = False
users = []
object_path = None


def request(base, method, path, *, token=None, body=None, content_type='application/json'):
    headers = {'apikey': anon, 'Authorization': f'Bearer {token or anon}'}
    if body is not None:
        headers['Content-Type'] = content_type
        if not isinstance(body, bytes):
            body = json.dumps(body).encode()
    req = urllib.request.Request(base + path, data=body, headers=headers, method=method)
    try:
        response = urllib.request.urlopen(req, timeout=20)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        return response.status, response.read()


def expect(code, allowed):
    assert code in allowed, f'Unexpected HTTP status {code}; expected {allowed}'


def sql(text):
    subprocess.run(['docker', 'exec', '-i', 'supabase_db_memq-oauth-audit', 'psql', '-q', '-v', 'ON_ERROR_STOP=1', '-U', 'supabase_admin', '-d', 'postgres'],
                   input=text.encode(), check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)


try:
    code, _ = request(api, 'GET', '/storage/v1/bucket/pdfs', token=admin)
    assert code in (400, 404), f'Unexpected test-bucket lookup status {code}; refusing to change it'
    count = subprocess.check_output(['docker', 'exec', 'supabase_db_memq-oauth-audit', 'psql', '-tA', '-v', 'ON_ERROR_STOP=1', '-U', 'supabase_admin', '-d', 'postgres', '-c', "select count(*) from storage.buckets where id='pdfs'"], stderr=subprocess.DEVNULL).decode().strip()
    assert count == '0', 'A pdfs bucket exists in the test project; refusing to change it'
    code, _ = request(api, 'POST', '/storage/v1/bucket', token=admin, body={'id': 'pdfs', 'name': 'pdfs', 'public': False})
    expect(code, (200, 201))
    bucket_created = True
    sql(f'''CREATE POLICY "{policy}" ON storage.objects FOR ALL TO authenticated
      USING (bucket_id = 'pdfs' AND (storage.foldername(name))[1] = auth.uid()::text)
      WITH CHECK (bucket_id = 'pdfs' AND (storage.foldername(name))[1] = auth.uid()::text);''')
    policy_created = True
    tokens = []
    for role in ('owner', 'other'):
        email = f'edge-pdf-{role}-{suffix}@example.test'
        password = f'Local-only-{secrets.token_hex(16)}!'
        code, body = request(api, 'POST', '/auth/v1/admin/users', token=admin, body={'email': email, 'password': password, 'email_confirm': True})
        expect(code, (200, 201))
        users.append(json.loads(body)['id'])
        code, body = request(api, 'POST', '/auth/v1/token?grant_type=password', body={'email': email, 'password': password})
        expect(code, (200,))
        tokens.append(json.loads(body)['access_token'])
    object_path = f'{users[0]}/sample.pdf'
    code, _ = request(api, 'POST', f'/storage/v1/object/pdfs/{object_path}', token=tokens[0],
                      body=b'%PDF-1.4\n% synthetic test only\n%%EOF\n', content_type='application/pdf')
    expect(code, (200,))
    env = {**os.environ, 'SUPABASE_ANON_KEY': anon}
    subprocess.run(['docker', 'run', '-d', '--rm', '--name', container,
                    '--network', 'supabase_network_memq-oauth-audit', '-p', '127.0.0.1:18795:9000',
                    '-e', f'SUPABASE_URL={internal_api}', '-e', f'MEMQ_PUBLIC_SUPABASE_URL={api}', '-e', 'SUPABASE_ANON_KEY',
                    '-v', f'{root / "supabase/functions"}:/opt/functions:ro',
                    'public.ecr.aws/supabase/edge-runtime:v1.78.1', 'start', '--main-service', '/opt/functions/process-file'],
                   env=env, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    runtime_started = True
    for _ in range(40):
        try:
            code, _ = request(edge, 'OPTIONS', '/')
            if code == 200:
                break
        except (OSError, urllib.error.URLError):
            pass
        time.sleep(0.25)
    else:
        raise RuntimeError('Local Edge Runtime did not become ready')
    legacy = f'{api}/storage/v1/object/public/pdfs/{object_path}'
    code, _ = request(edge, 'POST', '/', body={'pdf_url': legacy})
    expect(code, (401,))
    code, _ = request(edge, 'POST', '/', token=tokens[1], body={'pdf_url': legacy})
    expect(code, (400,))
    code, _ = request(edge, 'POST', '/', token=tokens[0], body={'pdf_url': f'https://example.test/{object_path}'})
    expect(code, (400,))
    # 503 is the deliberate, unique no-MinerU-configuration response after
    # authentication, ownership validation and real Storage URL signing.
    code, _ = request(edge, 'POST', '/', token=tokens[0], body={'pdf_url': legacy})
    expect(code, (503,))
    code, signed_data = request(api, 'POST', f'/storage/v1/object/sign/pdfs/{object_path}', token=tokens[0], body={'expiresIn': 60})
    expect(code, (200,))
    signed_path = json.loads(signed_data).get('signedURL') or json.loads(signed_data).get('signedUrl')
    assert isinstance(signed_path, str) and signed_path.startswith('/object/sign/pdfs/')
    code, _ = request(edge, 'POST', '/', token=tokens[0], body={'pdf_url': f'{api}/storage/v1{signed_path}'})
    expect(code, (503,))
finally:
    errors = []
    def cleanup(label, action):
        try:
            action()
        except Exception:
            errors.append(label)
    def cleanup_request(method, path, body=None):
        code, _ = request(api, method, path, token=admin, body=body)
        expect(code, (200,))
    if runtime_started:
        cleanup('stop isolated Edge Runtime', lambda: subprocess.run(['docker', 'stop', container], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE))
    if object_path:
        cleanup('remove sample PDF', lambda: cleanup_request('DELETE', '/storage/v1/object/pdfs', {'prefixes': [object_path]}))
    if policy_created:
        cleanup('remove test policy', lambda: sql(f'DROP POLICY IF EXISTS "{policy}" ON storage.objects;'))
    if bucket_created:
        # Do not empty the bucket: deletion must fail rather than remove any
        # unexpected concurrent objects.
        cleanup('remove empty test bucket', lambda: cleanup_request('DELETE', '/storage/v1/bucket/pdfs'))
    for user in users:
        cleanup('remove test user', lambda: cleanup_request('DELETE', f'/auth/v1/admin/users/{urllib.parse.quote(user, safe="")}'))
    if errors:
        raise RuntimeError('Local test cleanup failed: ' + ', '.join(errors))

print('Passed: real local Edge, Auth and private Storage ownership checks; no external parser was called.')
