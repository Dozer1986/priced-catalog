import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { createServer } from './server.js';
import { ReceiptSchema } from './receipt.js';

const GOOD = `Basic ${Buffer.from('kamotec:secret').toString('base64')}`;
const OTHER = `Basic ${Buffer.from('admin:secret').toString('base64')}`;

// Fake CouchDB _session: kamotec:secret and admin:secret log in, anything else is 401
const couch = http.createServer((req, res) => {
  const name = { [GOOD]: 'kamotec', [OTHER]: 'admin' }[req.headers.authorization ?? ''];
  if (!name && req.headers.authorization) return res.writeHead(401).end('{}');
  res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ ok: true, userCtx: { name: name ?? null } }));
});

const listen = async (server: http.Server) => {
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
};

const fixture = {
  date: '2026-11-10',
  vendor: 'Menards',
  storeCity: 'Evansville',
  storeState: 'IN',
  paidWith: 'Visa 1234',
  subtotal: 21.5,
  tax: 1.51,
  total: 23.01,
  notes: null,
  lines: [
    { item: '2X4-8 STUD', description: '2x4 stud, 8 ft', sku: '1021000', qty: 3, unitPrice: 4.5, taxRate: 0.07 },
    { item: 'RTN DRILL BIT', description: 'Returned drill bit', sku: null, qty: -1, unitPrice: 2, taxRate: 0.07 },
    { item: 'COUPON', description: 'Coupon', sku: null, qty: 1, unitPrice: -1, taxRate: 0.07 },
    { item: 'POP', description: 'Soda', sku: null, qty: 1, unitPrice: 11, taxRate: 0 },
  ],
};

let couchUrl: string;
beforeAll(async () => {
  couchUrl = await listen(couch);
});
afterAll(() => couch.close());

async function startReader(parse?: ReturnType<typeof vi.fn>) {
  const client = parse ? ({ beta: { messages: { parse } } } as unknown as Anthropic) : null;
  const server = createServer({ client, couchUrl });
  const url = await listen(server);
  return { url, close: () => server.close() };
}

const jpeg = { method: 'POST', headers: { 'Content-Type': 'image/jpeg', Authorization: GOOD }, body: Buffer.from('fake jpeg') };

describe('receipt reader', () => {
  it('rejects a missing, wrong or non-tracker login before calling Claude', async () => {
    const parse = vi.fn();
    const reader = await startReader(parse);
    for (const auth of [undefined, OTHER, `Basic ${Buffer.from('kamotec:wrong').toString('base64')}`]) {
      const headers: Record<string, string> = { 'Content-Type': 'image/jpeg', ...(auth ? { Authorization: auth } : {}) };
      const res = await fetch(`${reader.url}/extract`, { ...jpeg, headers });
      expect(res.status).toBe(401);
    }
    expect(parse).not.toHaveBeenCalled();
    reader.close();
  });

  it('answers the CORS preflight for the app only', async () => {
    const reader = await startReader(vi.fn());
    const preflight = (origin: string) =>
      fetch(`${reader.url}/extract`, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST' } });
    const ok = await preflight('https://dozer1986.github.io');
    expect(ok.status).toBe(204);
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://dozer1986.github.io');
    expect(ok.headers.get('access-control-allow-headers')).toContain('Authorization');
    const other = await preflight('https://evil.example');
    expect(other.status).toBe(403);
    expect(other.headers.get('access-control-allow-origin')).toBeNull();
    reader.close();
  });

  it('reports a missing key on /health and answers 503 on /extract', async () => {
    const reader = await startReader();
    expect(await (await fetch(`${reader.url}/health`)).json()).toEqual({ ok: true, key: false });
    expect((await fetch(`${reader.url}/extract`, jpeg)).status).toBe(503);
    reader.close();
  });

  it('sends the image before the prompt and returns the parsed receipt', async () => {
    // Round-trip through the real output format's parser, as the SDK does with the response text
    const parsed = betaZodOutputFormat(ReceiptSchema).parse(JSON.stringify(fixture));
    const parse = vi.fn().mockResolvedValue({ model: 'claude-opus-5-5', stop_reason: 'end_turn', usage: {}, parsed_output: parsed });
    const reader = await startReader(parse);
    const res = await fetch(`${reader.url}/extract`, jpeg);
    expect(res.status).toBe(200);
    expect((await res.json()).receipt).toEqual(fixture);
    const params = parse.mock.calls[0]![0];
    expect(params).toMatchObject({ model: 'claude-opus-5-5', max_tokens: 16000, fallbacks: 'default', output_config: { effort: 'medium' } });
    expect(params.messages[0].content.map((b: { type: string }) => b.type)).toEqual(['image', 'text']);
    expect(params.messages[0].content[0].source).toEqual({ type: 'base64', media_type: 'image/jpeg', data: jpeg.body.toString('base64') });
    reader.close();
  });

  it('takes a PDF as a document block', async () => {
    const parse = vi.fn().mockResolvedValue({ model: 'm', stop_reason: 'end_turn', usage: {}, parsed_output: fixture });
    const reader = await startReader(parse);
    const pdf = { method: 'POST', headers: { 'Content-Type': 'application/pdf', Authorization: GOOD }, body: Buffer.from('%PDF-1.4') };
    const res = await fetch(`${reader.url}/extract`, pdf);
    expect(res.status).toBe(200);
    expect(parse.mock.calls[0]![0].messages[0].content[0]).toMatchObject({ type: 'document', source: { media_type: 'application/pdf' } });
    reader.close();
  });

  it('answers 422 on a refusal or no parsed output, and 415 on HEIC', async () => {
    const parse = vi.fn()
      .mockResolvedValueOnce({ model: 'm', stop_reason: 'refusal', usage: {}, parsed_output: null })
      .mockResolvedValueOnce({ model: 'm', stop_reason: 'end_turn', usage: {}, parsed_output: null });
    const reader = await startReader(parse);
    for (let i = 0; i < 2; i++) {
      const res = await fetch(`${reader.url}/extract`, jpeg);
      expect(res.status).toBe(422);
      expect((await res.json()).error).toMatch(/Claude/);
    }
    const heic = await fetch(`${reader.url}/extract`, { ...jpeg, headers: { ...jpeg.headers, 'Content-Type': 'image/heic' } });
    expect(heic.status).toBe(415);
    reader.close();
  });

  it('flags an odd tax rate and a malformed date in notes', async () => {
    const odd = { ...fixture, date: '11/10/26', lines: [{ ...fixture.lines[0]!, taxRate: 0.0725 }] };
    const parse = vi.fn().mockResolvedValue({ model: 'm', stop_reason: 'end_turn', usage: {}, parsed_output: odd });
    const reader = await startReader(parse);
    const { receipt } = await (await fetch(`${reader.url}/extract`, jpeg)).json();
    expect(receipt.date).toBeNull();
    expect(receipt.notes).toMatch(/11\/10\/26.*tax rate/);
    reader.close();
  });
});

describe.runIf(process.env.LIVE === '1')('live Claude call (costs money)', () => {
  it('reads the Menards receipt', async () => {
    const apiKey = readFileSync(process.env.KEY_FILE ?? '/root/.config/kamo-services/anthropic-api-key', 'utf8').trim();
    const server = createServer({ client: new Anthropic({ apiKey }), couchUrl });
    const url = await listen(server);
    const body = readFileSync('/root/delegate-fixtures/receipts/IMG_7071.jpeg');
    const res = await fetch(`${url}/extract`, { ...jpeg, body });
    const json = await res.json();
    console.log(JSON.stringify(json, null, 2));
    expect(res.status).toBe(200);
    expect(json.receipt.total).toBe(226.79);
    server.close();
  }, 120_000);
});
