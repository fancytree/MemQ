#!/usr/bin/env python3
"""Real Storage/Auth check; strictly limited to the disposable local audit project."""
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
base = 'http://127.0.0.1:56421'
status = json.loads(subprocess.check_output(
    ['npx', '--offline', '--yes', 'supabase@latest', 'status', '--output', 'json', '--workdir', project],
    env={**os.environ, 'NPM_CONFIG_CACHE': '/private/tmp/memq-npm-cache'}, stderr=subprocess.DEVNULL,
))
assert status['API_URL'].rstrip('/') == base, 'Unexpected local API; refusing to run'
anon_key = status.get('ANON_KEY') or status['PUBLISHABLE_KEY']
admin_key = status['SERVICE_ROLE_KEY']
suffix = secrets.token_hex(6)
bucket = f'memq-pdf-test-{suffix}'
policy = f'memq_pdf_test_{suffix}'
users = []
bucket_created = False
policy_created = False


def request(method, path, *, token=None, body=None, content_type='application/json'):
    headers = {'apikey': anon_key, 'Authorization': f'Bearer {token or anon_key}'}
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


def expect(code, expected):
    assert code in expected, f'Unexpected status {code}; expected {expected}'


def sql(text):
    subprocess.run(['docker', 'exec', '-i', 'supabase_db_memq-oauth-audit', 'psql', '-q', '-v', 'ON_ERROR_STOP=1', '-U', 'supabase_admin', '-d', 'postgres'],
                   input=text.encode(), check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)


try:
    code, _ = request('POST', '/storage/v1/bucket', token=admin_key, body={'id': bucket, 'name': bucket, 'public': False})
    expect(code, (200, 201))
    bucket_created = True
    # Generated hex-only identifiers and a dedicated bucket prevent changes to other data.
    sql(f'''CREATE POLICY "{policy}" ON storage.objects FOR ALL TO authenticated
      USING (bucket_id = '{bucket}' AND (storage.foldername(name))[1] = auth.uid()::text)
      WITH CHECK (bucket_id = '{bucket}' AND (storage.foldername(name))[1] = auth.uid()::text);''')
    policy_created = True
    credentials = []
    for label in ('owner', 'other'):
        email = f'pdf-{label}-{suffix}@example.test'
        password = f'Local-only-{secrets.token_hex(16)}!'
        code, body = request('POST', '/auth/v1/admin/users', token=admin_key,
                             body={'email': email, 'password': password, 'email_confirm': True})
        expect(code, (200, 201))
        users.append(json.loads(body)['id'])
        code, body = request('POST', '/auth/v1/token?grant_type=password', body={'email': email, 'password': password})
        expect(code, (200,))
        credentials.append(json.loads(body)['access_token'])
    owner_id = users[0]
    object_path = f'{owner_id}/sample.pdf'
    object_url = f'/storage/v1/object/{bucket}/{object_path}'
    code, _ = request('POST', object_url, token=credentials[0], body=b'%PDF-1.4\n% synthetic test only\n%%EOF\n', content_type='application/pdf')
    expect(code, (200,))
    code, _ = request('GET', f'/storage/v1/object/public/{bucket}/{object_path}')
    assert code >= 400, 'A private bucket served the public URL'
    code, _ = request('POST', f'/storage/v1/object/sign/{bucket}/{object_path}', token=credentials[1], body={'expiresIn': 2})
    assert code >= 400, 'A different user signed the object'
    code, body = request('POST', f'/storage/v1/object/sign/{bucket}/{object_path}', token=credentials[0], body={'expiresIn': 2})
    expect(code, (200,))
    signed = json.loads(body).get('signedURL') or json.loads(body).get('signedUrl')
    assert isinstance(signed, str) and signed.startswith('/object/sign/'), 'Unexpected signed URL format'
    code, data = request('GET', '/storage/v1' + signed)
    expect(code, (200,))
    assert data.startswith(b'%PDF-1.4')
    time.sleep(3)
    code, _ = request('GET', '/storage/v1' + signed)
    assert code >= 400, 'Expired signed URL was still accepted'
finally:
    cleanup_errors = []
    def cleanup(label, action):
        try:
            action()
        except Exception:
            cleanup_errors.append(label)

    def cleanup_request(method, path):
        code, _ = request(method, path, token=admin_key)
        expect(code, (200,))

    if bucket_created:
        # These names and users were created in this test's disposable project only.
        cleanup('empty bucket', lambda: cleanup_request('POST', f'/storage/v1/bucket/{bucket}/empty'))
        cleanup('delete bucket', lambda: cleanup_request('DELETE', f'/storage/v1/bucket/{bucket}'))
    if policy_created:
        cleanup('delete test policy', lambda: sql(f'DROP POLICY IF EXISTS "{policy}" ON storage.objects;'))
    for user in users:
        cleanup('delete test user', lambda: cleanup_request('DELETE', f'/auth/v1/admin/users/{urllib.parse.quote(user, safe="")}'))
    if cleanup_errors:
        raise RuntimeError('Local test cleanup failed: ' + ', '.join(cleanup_errors))

print('Passed: private bucket, owner signing, cross-user denial, signed URL expiry and cleanup.')
