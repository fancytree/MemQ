/**
 * The one place that decides whether a URL someone handed us is theirs.
 *
 * process-file takes a `pdf_url` from the caller and gets a third party
 * (MinerU) to fetch it. Without this check that endpoint is a relay: any signed
 * -in person could name any URL and be handed back whatever text came out of
 * it. So these are the tests for refusing, not for accepting — the accepting
 * case is one line and the refusing cases are the whole job.
 */

import { ownedPdfPath, signOwnedPdfReference } from './pdfReference.ts';

const ROOT = 'https://project.supabase.co';
const ME = '11111111-1111-1111-1111-111111111111';
const YOU = '22222222-2222-2222-2222-222222222222';
const PUBLIC = `${ROOT}/storage/v1/object/public/pdfs/`;
const SIGNED = `${ROOT}/storage/v1/object/sign/pdfs/`;

function refused(reference: unknown, why: string, publicUrl?: string) {
  const got = ownedPdfPath(reference, ROOT, ME, publicUrl);
  if (got !== null) throw new Error(`${why}: resolved to ${got}`);
}

Deno.test('resolves a reference to the caller’s own object, in either shape', () => {
  // Older app versions send a public URL, newer ones a signed one. Both name the
  // same object, and neither is taken as authority — only as a name.
  if (ownedPdfPath(`${PUBLIC}${ME}/a.pdf`, ROOT, ME) !== `${ME}/a.pdf`) throw new Error('Public reference refused');
  if (ownedPdfPath(`${SIGNED}${ME}/a.pdf?token=whatever`, ROOT, ME) !== `${ME}/a.pdf`) throw new Error('Signed reference refused');
  // The token on a signed URL is not consulted, so an expired one still names
  // the object; what it does not do is let anyone fetch it.
  if (ownedPdfPath(`${PUBLIC}${ME}/deep/folder/a.pdf`, ROOT, ME) !== `${ME}/deep/folder/a.pdf`) throw new Error('Nested path refused');
  if (ownedPdfPath(`${PUBLIC}${ME}/space%20name.pdf`, ROOT, ME) !== `${ME}/space name.pdf`) throw new Error('Encoded name refused');
});

Deno.test('refuses an object belonging to somebody else', () => {
  refused(`${PUBLIC}${YOU}/a.pdf`, 'Another user’s file');
  refused(`${SIGNED}${YOU}/a.pdf?token=t`, 'Another user’s signed file');
  // A folder that merely starts with the id is a different folder.
  refused(`${PUBLIC}${ME}x/a.pdf`, 'Look-alike folder');
  refused(`${PUBLIC}a.pdf`, 'Object with no owner folder');
});

Deno.test('refuses anything that is not an object in this project’s pdfs bucket', () => {
  refused(`https://elsewhere.example/storage/v1/object/public/pdfs/${ME}/a.pdf`, 'Another host');
  refused(`http://project.supabase.co/storage/v1/object/public/pdfs/${ME}/a.pdf`, 'Another scheme/origin');
  refused(`${ROOT}/storage/v1/object/public/avatars/${ME}/a.png`, 'Another bucket');
  refused(`${ROOT}/storage/v1/object/pdfs/${ME}/a.pdf`, 'Authenticated endpoint, not a reference we issue');
  refused(`${ROOT}/${ME}/a.pdf`, 'No storage prefix');
  refused('not a url at all', 'Unparseable reference');
});

Deno.test('refuses a reference carrying anything but a path', () => {
  refused(`https://user:pass@project.supabase.co/storage/v1/object/public/pdfs/${ME}/a.pdf`, 'Credentials in the URL');
  refused(`${PUBLIC}${ME}/a.pdf#fragment`, 'Fragment');
});

Deno.test('refuses traversal, empty segments and control characters', () => {
  // Dot segments never reach the ownership check: the URL parser removes them
  // first, encoded or not (the spec treats `%2e` as a dot segment too). So what
  // these actually prove is that climbing out lands somewhere that is then
  // refused for the ordinary reason — the folder is not the caller's.
  refused(`${PUBLIC}${ME}/../${YOU}/a.pdf`, 'Parent traversal');
  refused(`${PUBLIC}${ME}/%2e%2e/${YOU}/a.pdf`, 'Encoded parent traversal');
  refused(`${PUBLIC}${ME}/../../etc/passwd`, 'Traversal out of the bucket prefix');
  // …and that going nowhere leaves the caller's own object, which is harmless.
  // Pinned so that nobody "hardens" it into a refusal of a legitimate file.
  for (const same of [`${PUBLIC}${ME}/./a.pdf`, `${PUBLIC}${ME}/%2e/a.pdf`]) {
    if (ownedPdfPath(same, ROOT, ME) !== `${ME}/a.pdf`) throw new Error(`Normalised path refused: ${same}`);
  }
  // The `.`/`..` guard in the code is the belt to that parser's braces, and the
  // empty-segment and control-character guards do catch things on their own.
  refused(`${PUBLIC}${ME}//a.pdf`, 'Empty segment');
  refused(`${PUBLIC}${ME}/a%00.pdf`, 'NUL in the name');
  refused(`${PUBLIC}${ME}/a%0a.pdf`, 'Newline in the name');
});

Deno.test('refuses references that are not usable strings', () => {
  refused(null, 'Null reference');
  refused(42, 'Numeric reference');
  refused('', 'Empty reference');
  refused(`${PUBLIC}${ME}/${'a'.repeat(9000)}.pdf`, 'Over-long reference');
  if (ownedPdfPath(`${PUBLIC}${ME}/a.pdf`, ROOT, '') !== null) throw new Error('Missing user id allowed');
});

Deno.test('accepts the configured public origin as well as the internal one', () => {
  const external = 'https://api.memq.app';
  const got = ownedPdfPath(`${external}/storage/v1/object/public/pdfs/${ME}/a.pdf`, ROOT, ME, external);
  if (got !== `${ME}/a.pdf`) throw new Error('Configured public origin refused');
  refused(`${external}/storage/v1/object/public/pdfs/${ME}/a.pdf`, 'Unconfigured external origin');
});

const user = (id: string | null) => () => Promise.resolve({ data: { user: id ? { id } : null }, error: null });
const signs = (signedUrl: string | null) => () =>
  Promise.resolve(signedUrl ? { data: { signedUrl }, error: null } : { data: null, error: new Error('nope') });
const MINE = `${PUBLIC}${ME}/a.pdf`;
const FRESH = `${ROOT}/storage/v1/object/sign/pdfs/${ME}/a.pdf?token=fresh`;

Deno.test('signs only after the caller is known to own the object', async () => {
  if (await signOwnedPdfReference(MINE, ROOT, user(ME), signs(FRESH)) !== FRESH) throw new Error('Owner refused');
  if (await signOwnedPdfReference(MINE, ROOT, user(null), signs(FRESH)) !== null) throw new Error('Signed for nobody');
  if (await signOwnedPdfReference(MINE, ROOT, user(YOU), signs(FRESH)) !== null) throw new Error('Signed for another user');
  if (await signOwnedPdfReference(MINE, ROOT, user(ME), signs(null)) !== null) throw new Error('Storage failure not reported');
});

Deno.test('never forwards the caller’s own URL, even when it would have worked', async () => {
  // The returned URL is the one storage just minted, not the one that came in:
  // that is the whole point of the pass.
  const out = await signOwnedPdfReference(MINE, ROOT, user(ME), signs(FRESH));
  if (out === MINE) throw new Error('Caller’s URL forwarded');
  if (out !== FRESH) throw new Error('Expected the freshly signed URL');
});

Deno.test('rewrites the signed URL onto the configured public origin, or refuses', async () => {
  const external = 'https://api.memq.app';
  const out = await signOwnedPdfReference(MINE, ROOT, user(ME), signs(FRESH), external);
  if (out !== `${external}/storage/v1/object/sign/pdfs/${ME}/a.pdf?token=fresh`) throw new Error(`Bad rewrite: ${out}`);
  // A misconfigured public URL must not quietly produce a URL pointing somewhere
  // unintended; refusing is the safe end of that branch.
  for (const bad of ['https://api.memq.app/base/', 'https://api.memq.app/?x=1', 'ftp://api.memq.app', 'https://u:p@api.memq.app']) {
    if (await signOwnedPdfReference(MINE, ROOT, user(ME), signs(FRESH), bad) !== null) throw new Error(`Accepted bad public URL: ${bad}`);
  }
});
