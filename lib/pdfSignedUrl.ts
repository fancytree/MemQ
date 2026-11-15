/** A temporary bearer URL for the PDF processor; do not log or persist it. */
export const PDF_SIGNED_URL_TTL_SECONDS = 15 * 60;

export async function createPdfProcessingUrl(
  bucket: { createSignedUrl(path: string, expiresIn: number): PromiseLike<{ data: { signedUrl: string } | null; error: unknown }> },
  path: string,
): Promise<string> {
  const { data, error } = await bucket.createSignedUrl(path, PDF_SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) throw new Error('Could not prepare the PDF for processing.');
  return data.signedUrl;
}
