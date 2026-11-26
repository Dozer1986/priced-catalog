import http from 'node:http';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { ReceiptSchema, PROMPT, checkReceipt } from './receipt.js';

const ALLOWED_ORIGIN = 'https://dozer1986.github.io';
const ALLOWED_USER = 'kamotec';
const MAX_BYTES = 10 * 1024 * 1024; // the app sends at most a 2000px JPEG or a 5 MB PDF
const MAX_PER_HOUR = 30; // a leaked login can't run up the Anthropic bill; a big shopping day is ~10 receipts
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;

export interface ServerOptions {
  client: Anthropic | null; // null: no API key
  couchUrl: string; // e.g. http://127.0.0.1:5984
}

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** True when CouchDB accepts these Basic credentials as the tracker's user. */
async function isTrackerLogin(couchUrl: string, authorization: string | undefined): Promise<boolean> {
  if (!authorization?.startsWith('Basic ')) return false;
  const res = await fetch(`${couchUrl}/_session`, { headers: { Authorization: authorization } });
  if (!res.ok) return false;
  const body = (await res.json()) as { userCtx?: { name?: string | null } };
  return body.userCtx?.name === ALLOWED_USER;
}

async function readBody(req: http.IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BYTES) throw new HttpError(413, 'The file is too big (over 10 MB).');
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

/** The uploaded file (the raw body) and its type. */
async function readUpload(req: http.IncomingMessage): Promise<{ type: string; data: Buffer }> {
  return { type: (req.headers['content-type'] ?? '').split(';')[0]!.trim(), data: await readBody(req) };
}

function contentBlock(type: string, data: string): Anthropic.Beta.BetaContentBlockParam {
  if (type === 'application/pdf') return { type: 'document', source: { type: 'base64', media_type: type, data } };
  const mediaType = IMAGE_TYPES.find((t) => t === type);
  if (!mediaType) throw new HttpError(415, `Send a JPEG, PNG or PDF (got "${type || 'no type'}"). HEIC photos must be converted first.`);
  return { type: 'image', source: { type: 'base64', media_type: mediaType, data } };
}

async function extract(client: Anthropic, upload: { type: string; data: Buffer }) {
  const file = contentBlock(upload.type, upload.data.toString('base64'));
  const msg = await client.beta.messages.parse({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { format: betaZodOutputFormat(ReceiptSchema), effort: 'medium' },
    messages: [{ role: 'user', content: [file, { type: 'text', text: PROMPT }] }],
  });
  console.log(`claude: ${msg.model} stop=${msg.stop_reason} in=${msg.usage.input_tokens} out=${msg.usage.output_tokens}`);
  if (msg.stop_reason === 'refusal') throw new HttpError(422, 'Claude declined to read this file. Enter the receipt by hand.');
  if (msg.stop_reason === 'max_tokens') throw new HttpError(422, 'The receipt is too long to read in one go.');
  if (!msg.parsed_output) throw new HttpError(422, 'Claude could not read a receipt from this file.');
  return checkReceipt(msg.parsed_output);
}

export function createServer({ client, couchUrl }: ServerOptions): http.Server {
  const recent: number[] = []; // start times of Claude calls in the last hour
  return http.createServer(async (req, res) => {
    const started = Date.now();
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
      // Method, path and status only: never headers (the login) or the file
      console.log(`${req.method} ${req.url} ${status} ${Date.now() - started}ms`);
    };
    res.setHeader('Vary', 'Origin');
    if (req.headers.origin === ALLOWED_ORIGIN) {
      res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.setHeader('Access-Control-Max-Age', '600');
    }
    try {
      if (req.method === 'OPTIONS') {
        res.writeHead(req.headers.origin === ALLOWED_ORIGIN ? 204 : 403).end();
        return;
      }
      if (req.method === 'GET' && req.url === '/health') return send(200, { ok: true, key: client !== null });
      if (req.method !== 'POST' || req.url !== '/extract') return send(404, { error: 'Not found' });
      if (!client) return send(503, { error: 'The receipt reader has no Anthropic API key.' });
      // Before reading the file or calling Claude: each call costs money
      if (!(await isTrackerLogin(couchUrl, req.headers.authorization))) return send(401, { error: 'Login rejected.' });
      const now = Date.now();
      while (recent.length && recent[0]! < now - 3_600_000) recent.shift();
      if (recent.length >= MAX_PER_HOUR) return send(429, { error: `Over ${MAX_PER_HOUR} receipts this hour. Try again later or enter it by hand.` });
      recent.push(now);
      send(200, { receipt: await extract(client, await readUpload(req)) });
    } catch (err) {
      if (err instanceof HttpError) return send(err.status, { error: err.message });
      if (err instanceof Anthropic.APIError) {
        // The API's own reason (e.g. "credit balance is too low") tells the user what to fix
        const reason = (err.error as { error?: { message?: string } } | undefined)?.error?.message;
        console.error(`claude: API error ${err.status} ${reason ?? ''}`);
        return send(502, { error: `Claude is unavailable (${err.status ?? 'no connection'}): ${reason ?? 'try again in a minute.'}` });
      }
      console.error('extract failed:', err instanceof Error ? err.message : err);
      send(500, { error: 'The receipt reader failed.' });
    }
  });
}
