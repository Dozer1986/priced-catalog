import { getStoredSyncCredentials } from './db';
import type { ExtractedReceipt } from './receipt';

const MAX_EDGE = 2000;
const MAX_PDF_BYTES = 5 * 1024 * 1024;

/** An image is shrunk to 2000px and JPEG; a PDF is kept as is. Throws a message fit to show. */
export async function prepareFile(file: File): Promise<{ blob: Blob; ext: 'jpg' | 'pdf' }> {
  if (file.type === 'application/pdf') {
    if (file.size > MAX_PDF_BYTES) throw new Error('That PDF is over 5 MB. Screenshot the receipt instead.');
    return { blob: file, ext: 'pdf' };
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('This browser could not open that image. Try a JPEG or PNG.');
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/jpeg', 0.85));
  if (!blob) throw new Error('Could not shrink that image.');
  return { blob, ext: 'jpg' };
}

/** The reader service sits on the sync URL's host, port 8446. */
export function readerUrl(syncUrl: string): string {
  const u = new URL(syncUrl);
  return `${u.protocol}//${u.hostname}:8446/extract`;
}

/** Sends the receipt to the reader service (10-40 s). Throws a message fit to show. */
export async function extractReceipt(blob: Blob): Promise<ExtractedReceipt> {
  const creds = getStoredSyncCredentials();
  if (!creds || !creds.url.trim()) throw new Error('Set up sync in Settings first; the receipt reader uses the same login.');
  let res: Response;
  try {
    const login = Array.from(new TextEncoder().encode(`${creds.username}:${creds.password}`), (b) => String.fromCharCode(b)).join('');
    res = await fetch(readerUrl(creds.url.trim()), {
      method: 'POST',
      headers: { Authorization: `Basic ${btoa(login)}`, 'Content-Type': blob.type },
      body: blob,
    });
  } catch {
    throw new Error('Could not reach the receipt reader. Are you on the tailnet?');
  }
  if (res.status === 401) throw new Error('The receipt reader rejected the sync login.');
  const body = (await res.json().catch(() => null)) as { receipt?: ExtractedReceipt; error?: string } | null;
  if (!res.ok || !body?.receipt) throw new Error(body?.error ?? `The receipt reader failed (${res.status}).`);
  return body.receipt;
}
