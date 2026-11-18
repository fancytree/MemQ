/**
 * Putting a file somewhere the chat function can read it.
 *
 * This used to extract the words first, through `process-file` and MinerU, and
 * hand chat the text. It no longer does: the model reads the file itself, so all
 * that is needed here is to put it where the function can fetch it from and hand
 * back the reference. That removes a wait of up to two minutes from in front of
 * the answer, and it is why this file is now short. Spec §22 has the reasoning.
 *
 * Nothing here decides whether the file is readable or short enough. Those are the
 * function's to decide, because they protect its budget and a client can be made
 * to say anything — this side refuses only what is cheap to refuse early, so the
 * person is not made to wait for an upload that was never going to work.
 */

import { createPdfProcessingUrl } from '@/lib/pdfSignedUrl';
import { supabase } from '@/lib/supabase';

/* Loaded when a photo is first attached, not at import: a native module missing
 * from some runtime would otherwise take the screen down with it, the way the
 * pickers are loaded in ChatShell. */
type Manipulator = {
  ImageManipulator: { manipulate: (uri: string) => {
    renderAsync: () => Promise<{ saveAsync: (options: { format: string; compress?: number })
      => Promise<{ uri: string }> }>;
  } };
  SaveFormat: { JPEG: string };
};
let manipulator: Manipulator | null | undefined;
function loadManipulator(): Manipulator | null {
  if (manipulator === undefined) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    try { manipulator = require('expo-image-manipulator') as Manipulator; }
    catch { manipulator = null; }
  }
  return manipulator;
}

/**
 * A photograph, redrawn so that only the picture survives.
 *
 * A photo from a phone carries EXIF, and EXIF carries where it was taken. Sent as
 * it is, asking what a page says would also hand over the room it was read in.
 * Decoding and re-encoding keeps the pixels and drops everything written around
 * them: there is no "strip metadata" call to make, but a re-encode has that
 * effect, which is why this is a render and not a copy.
 *
 * It is also what makes the file a JPEG with certainty. The picker is asked for a
 * compatible representation and usually obliges, but "usually" is not a thing to
 * send to a provider that refuses HEIC.
 *
 * When it cannot be done — the module missing from a build, or a render that
 * fails — this reports that, and the caller refuses the photo rather than falling
 * back to the original. Falling back would mean sending the location quietly,
 * which is the one thing this exists to prevent; a refusal the person can see and
 * act on is the better failure.
 */
async function redraw(uri: string): Promise<{ uri: string; stripped: boolean }> {
  const module = loadManipulator();
  if (!module) return { uri, stripped: false };
  try {
    const rendered = await module.ImageManipulator.manipulate(uri).renderAsync();
    const saved = await rendered.saveAsync({ format: module.SaveFormat.JPEG, compress: 0.8 });
    return { uri: saved.uri, stripped: true };
  } catch {
    return { uri, stripped: false };
  }
}

/** What is handed to chat: a name to speak about it by, and where it is. */
export type Attached = {
  name: string;
  url: string;
  /** Whether to show it as a picture or as a named file. */
  kind: 'image' | 'file';
  /** The copy on this device, for the thumbnail. Drawn from here rather than from
   *  the uploaded one: it is already on disk, so the thumbnail appears at once and
   *  does not depend on the bucket being readable. */
  preview: string;
};

/** How many may ride on one message. Nine is what fits the grid and roughly what
 *  the turn's token ceiling allows at a photo apiece; the function refuses the
 *  rest by what they actually cost, which is the number that matters. */
export const ATTACH_MAX = 9;

/** What a file may weigh before this refuses it. The function has its own ceiling
 *  on what it will fetch; this one is about not starting a long upload that is
 *  going to be turned away at the other end. */
export const FILE_MAX_BYTES = 8 * 1024 * 1024;

/**
 * Kinds the model can open.
 *
 * Every photograph becomes `image/jpeg` before it gets here, because it is redrawn
 * (see `redraw`), so HEIC never reaches this list — which matters, since an iPhone
 * photographs in HEIC and the provider will not read it. What this list is really
 * guarding is documents, where whatever the picker said is all there is to go on.
 *
 * Checked here only so a refusal arrives before the upload rather than after it;
 * the function checks again on the bytes it actually receives.
 */
const READABLE = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif'];

export class AttachError extends Error {}

/**
 * Upload the picked file and come back with the reference.
 *
 * `type` is the picker's own mime type, passed to storage rather than replaced
 * with a guess: the function decides what it is holding from what storage serves,
 * so a photo stored as a PDF reads as neither.
 */
export async function attachFile(uri: string, name: string, type?: string | null): Promise<Attached> {
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) throw new AttachError('Sign in to attach a file.');

  // A photograph is redrawn before anything else happens to it, so what is weighed,
  // uploaded and sent is the stripped copy and never the original.
  const photo = (type ?? '').startsWith('image/');
  const source = photo ? await redraw(uri) : { uri, stripped: false };
  if (photo && !source.stripped) {
    throw new AttachError('That photo could not be prepared. Try again, or attach a PDF.');
  }
  const contentType = photo ? 'image/jpeg' : (type || 'application/octet-stream');
  if (!READABLE.includes(contentType)) {
    throw new AttachError('That kind of file cannot be read. A PDF or a photo works.');
  }

  /* Read as bytes rather than as a Blob. A Blob from a `file://` URI arrives with
   * an empty `type` in React Native, and storage then records the upload as
   * `text/plain` — which the chat function, reading what storage serves, refuses as
   * something it cannot open. Handing over an ArrayBuffer makes `contentType` the
   * only claim there is, so what goes in is what comes out. */
  let bytes: ArrayBuffer;
  try {
    bytes = await (await fetch(source.uri)).arrayBuffer();
  } catch {
    throw new AttachError('Could not read that file.');
  }
  if (bytes.byteLength === 0) throw new AttachError('That file is empty.');
  if (bytes.byteLength > FILE_MAX_BYTES) throw new AttachError('That file is too big to attach.');

  /* The name follows the bytes. A redrawn photo is a JPEG whatever it arrived as,
   * and the name is what the URL ends in, so an extension that disagrees is one
   * more thing that could be believed instead of the file. */
  const named = photo ? `${(name || 'photo').replace(/\.[^.]+$/, '')}.jpg` : (name || 'upload');
  const safe = named.replace(/[^\w.\- ]+/g, '_').slice(-80);
  const path = `${user.id}/${Date.now()}-${safe}`;
  const { error: uploadError } = await supabase.storage
    .from('pdfs').upload(path, bytes, { contentType });
  if (uploadError) throw new AttachError('Could not upload that file.');

  /* A signed reference, not a public one. The bucket is still public, so a public
   * URL would work — and that is the point: it would also work for anyone it was
   * ever copied to, for a photo of someone's notebook, with no sign-in. The chat
   * function never trusts this URL anyway; it reads the path out of it, checks the
   * file belongs to whoever is asking, and signs its own (see pdfReference.ts,
   * which takes either form). So the only thing the public URL bought was exposure.
   *
   * Every other upload in the app already does this (createPdfProcessingUrl). */
  let url: string;
  try {
    url = await createPdfProcessingUrl(supabase.storage.from('pdfs'), path);
  } catch {
    throw new AttachError('Could not upload that file.');
  }
  return {
    name: named,
    url,
    kind: photo ? 'image' : 'file',
    // The thumbnail shows the redrawn copy, which is what will actually be sent.
    preview: source.uri,
  };
}
