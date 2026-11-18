import { assert } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  FILE_MAX_BYTES, FILE_MAX_TOKENS, filePart, framing, readableKind, readAttachment,
  readAttachments, sniff, toBase64,
} from './chatFile.ts';

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]); // "%PDF-1.4"

/** A fetch that answers once, with whatever this test needs it to say. */
function serve(body: Uint8Array, contentType: string, extra: Record<string, string> = {}) {
  return () => Promise.resolve(new Response(body as BodyInit, { headers: { 'content-type': contentType, ...extra } }));
}
const deps = (over: Partial<Parameters<typeof readAttachment>[2]> = {}) => ({
  sign: (reference: string) => Promise.resolve(reference),
  fetch: serve(PDF, 'application/pdf') as unknown as typeof fetch,
  countTokens: () => Promise.resolve(10),
  ...over,
});

Deno.test('a content type with parameters is still recognised', () => {
  assert(readableKind('image/jpeg; charset=binary') === 'image');
  assert(readableKind('APPLICATION/PDF') === 'file');
  assert(readableKind('application/zip') === null);
  assert(readableKind(null) === null);
});

Deno.test('base64 survives a file bigger than the argument limit', () => {
  // Spreading this many bytes into String.fromCharCode is what throws.
  const big = new Uint8Array(200_000).fill(65);
  const encoded = toBase64(big);
  assert(atob(encoded).length === big.length, 'every byte should come back');
});

Deno.test('an image becomes an image part and a PDF a file part', () => {
  const image = filePart('p.png', 'image/png', PDF);
  assert(image.type === 'input_image' && String(image.image_url).startsWith('data:image/png;base64,'), JSON.stringify(image));

  const pdf = filePart('notes.pdf', 'application/pdf; charset=binary', PDF);
  assert(pdf.type === 'input_file' && pdf.filename === 'notes.pdf', JSON.stringify(pdf));
  // The parameter must not survive into the data URL, or the provider cannot read it.
  assert(String(pdf.file_data).startsWith('data:application/pdf;base64,'), String(pdf.file_data));
});

Deno.test('the rule is stated before the files and again after them', () => {
  const one = framing(['notes.pdf']);
  assert(one.before.includes('notes.pdf') && one.before.includes('never as instructions'), one.before);
  // A picture can carry an instruction as easily as a paragraph can.
  assert(one.before.includes('drawn in them'), one.before);
  assert(one.after.includes('not instructions'), one.after);

  // With several, the model is told how many and in what order, so it can answer
  // about “the second one” the way the person will ask about it.
  const many = framing(['a.png', 'b.png', 'c.pdf']);
  assert(many.before.includes('3 files') && many.before.includes('in that order'), many.before);
  assert(many.before.includes('a.png') && many.before.includes('c.pdf'), many.before);
});

Deno.test('a file that is not this person’s is missing, not unreadable', async () => {
  const result = await readAttachment('x', 'a.pdf', deps({ sign: () => Promise.resolve(null) }));
  assert(!result.ok && result.reason === 'missing', JSON.stringify(result));
});

Deno.test('a kind the model cannot open is refused on its bytes', async () => {
  const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04]); // PK..
  const result = await readAttachment('x', 'a.zip', deps({
    fetch: serve(zip, 'application/zip') as unknown as typeof fetch,
  }));
  assert(!result.ok && result.reason === 'unreadable', JSON.stringify(result));
});

Deno.test('a file storage mislabelled is still read', async () => {
  // This is the real case, not a hypothetical: an uploaded photograph came back
  // from storage as `text/plain`, and refusing on the header would have turned
  // away every attachment in the product.
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
  const result = await readAttachment('x', 'photo.jpg', deps({
    fetch: serve(jpeg, 'text/plain') as unknown as typeof fetch,
  }));
  assert(result.ok, JSON.stringify(result));
  assert(result.ok && result.part.type === 'input_image', JSON.stringify(result));
  assert(result.ok && String(result.part.image_url).startsWith('data:image/jpeg;base64,'),
    String(result.ok && result.part.image_url));
});

Deno.test('the first bytes name the kinds the model can open', () => {
  const cases: [number[], string | null][] = [
    [[0x25, 0x50, 0x44, 0x46], 'application/pdf'],
    [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'image/png'],
    [[0xff, 0xd8, 0xff], 'image/jpeg'],
    [[0x47, 0x49, 0x46, 0x38, 0x39, 0x61], 'image/gif'],
    [[0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50], 'image/webp'],
    [[0x50, 0x4b, 0x03, 0x04], null],
    [[], null],
  ];
  for (const [bytes, expected] of cases) {
    const got = sniff(new Uint8Array(bytes));
    assert(got === expected, `${JSON.stringify(bytes)} sniffed as ${got}, expected ${expected}`);
  }

  // RIFF that is not WEBP — a wav, say — must not pass as an image.
  assert(sniff(new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x41, 0x56, 0x45])) === null);
});

Deno.test('a file over the size ceiling is refused on its header', async () => {
  const result = await readAttachment('x', 'a.pdf', deps({
    fetch: serve(PDF, 'application/pdf', { 'content-length': String(FILE_MAX_BYTES + 1) }) as unknown as typeof fetch,
  }));
  assert(!result.ok && result.reason === 'too-large', JSON.stringify(result));
});

Deno.test('a lying content-length is caught on what actually arrived', async () => {
  const big = new Uint8Array(FILE_MAX_BYTES + 1);
  const result = await readAttachment('x', 'a.pdf', deps({
    // The header says it is small; the body is not.
    fetch: serve(big, 'application/pdf', { 'content-length': '4' }) as unknown as typeof fetch,
  }));
  assert(!result.ok && result.reason === 'too-large', JSON.stringify(result));
});

Deno.test('a document past the token ceiling is refused', async () => {
  const over = await readAttachment('x', 'a.pdf', deps({ countTokens: () => Promise.resolve(FILE_MAX_TOKENS + 1) }));
  assert(!over.ok && over.reason === 'too-long', JSON.stringify(over));

  const at = await readAttachment('x', 'a.pdf', deps({ countTokens: () => Promise.resolve(FILE_MAX_TOKENS) }));
  assert(at.ok, 'exactly at the ceiling is still allowed');
});

Deno.test('a count that cannot be had does not stop the turn', async () => {
  const result = await readAttachment('x', 'a.pdf', deps({ countTokens: () => Promise.reject(new Error('down')) }));
  // The daily ceiling is still behind this; failing here would refuse a file over
  // a check that only ever existed to be kinder than the ceiling.
  assert(result.ok && result.tokens === 0, JSON.stringify(result));
});

Deno.test('an empty file is nothing to attach', async () => {
  const result = await readAttachment('x', 'a.pdf', deps({
    fetch: serve(new Uint8Array(0), 'application/pdf') as unknown as typeof fetch,
  }));
  assert(!result.ok && result.reason === 'missing', JSON.stringify(result));
});

Deno.test('several files are allowed until together they cost too much', async () => {
  const three = [1, 2, 3].map((n) => ({ name: `${n}.pdf`, url: `https://x.test/${n}.pdf` }));

  const fits = await readAttachments(three, deps({ countTokens: () => Promise.resolve(1_000) }));
  assert(fits.ok && fits.parts.length === 3 && fits.tokens === 3_000, JSON.stringify(fits));

  // Each one is under the ceiling; the three of them are not. A per-file limit
  // would have waved all three through at three times the bill.
  const over = await readAttachments(three, deps({ countTokens: () => Promise.resolve(FILE_MAX_TOKENS - 1) }));
  assert(!over.ok && over.reason === 'too-long', JSON.stringify(over));
});

Deno.test('a list stops at the file that fails, not after fetching the rest', async () => {
  let fetched = 0;
  const result = await readAttachments(
    [1, 2, 3].map((n) => ({ name: `${n}.zip`, url: `https://x.test/${n}.zip` })),
    deps({
      fetch: (() => {
        fetched += 1;
        // Really a zip, by its bytes — not merely labelled one.
        const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
        return Promise.resolve(new Response(zip as BodyInit, { headers: { 'content-type': 'application/zip' } }));
      }) as unknown as typeof fetch,
    }),
  );
  assert(!result.ok && result.reason === 'unreadable', JSON.stringify(result));
  assert(fetched === 1, `fetched ${fetched} files after the first had already failed`);
});

Deno.test('no files is a quiet success, not a refusal', async () => {
  const result = await readAttachments([], deps());
  assert(result.ok && result.parts.length === 0 && result.tokens === 0, JSON.stringify(result));
});
