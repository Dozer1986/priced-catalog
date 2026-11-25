import { readFileSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { createServer } from './server.js';

const keyFile = process.env.KEY_FILE ?? '/root/.config/kamo-services/anthropic-api-key';
let apiKey: string | null = null;
try {
  apiKey = readFileSync(keyFile, 'utf8').trim() || null;
} catch {
  // reported by /health and as 503 on /extract
}
if (!apiKey) console.error(`No API key in ${keyFile}; /extract answers 503`);

const port = Number(process.env.PORT ?? 8446);
const host = process.env.HOST ?? '127.0.0.1';
createServer({
  client: apiKey ? new Anthropic({ apiKey }) : null,
  couchUrl: process.env.COUCH_URL ?? 'http://127.0.0.1:5984',
}).listen(port, host, () => console.log(`receipt-reader on ${host}:${port}`));
