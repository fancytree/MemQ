/**
 * How much of a PDF is read.
 *
 * Reading a PDF is the one thing here whose cost is set by what is sent rather
 * than by how often: the processor is paid by the page and storage by the byte.
 * So besides how many (aiGate.ts) there is how big.
 *
 * The page limit is not as tight as it looks. Only the first 15,000 characters of
 * what the processor returns ever reach the model — about ten pages of prose — so
 * pages past that were being paid for and thrown away.
 */

/** 20 MB. A long scanned document is a few megabytes; past this it is a book. */
export const PDF_MAX_BYTES = 20 * 1024 * 1024;

export const PDF_PAGES_FREE = 30;
/** The processor's own ceiling. */
export const PDF_PAGES_PRO = 200;

/** The processor's `page_ranges`: "from-to", counted from one. */
export function pageRange(isPro: boolean): string {
  return `1-${isPro ? PDF_PAGES_PRO : PDF_PAGES_FREE}`;
}

/** What the app is told, in words it can show as they are. */
export function tooLarge(): { error: string; code: 'too_large'; message: string } {
  const message = 'That PDF is larger than 20 MB. Try a smaller file, or paste the part you need.';
  return { error: message, code: 'too_large', message };
}
