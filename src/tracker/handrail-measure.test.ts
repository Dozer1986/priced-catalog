import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// public/handrail-measure.html is a standalone page; its <script id="core"> holds the geometry.
const html = readFileSync(resolve(__dirname, '../../public/handrail-measure.html'), 'utf8');
const core = html.match(/<script id="core">([\s\S]*?)<\/script>/)![1]!;
interface Core {
  parseLen(s: string): number | null;
  settings(p: unknown): unknown;
  computeFlight(f: unknown, s: unknown): { missing?: boolean; posts: { riser: number }[]; rail: number; heights: number[] };
}
const mod = { exports: {} as Core };
new Function('module', core)(mod);
const { parseLen, computeFlight, settings } = mod.exports;

const S = settings({ settings: { H: '36', lo: '34', hi: '38', span: '72', back: '2-3/4', tail: '2-3/4',
  railH: '1-1/2', plate: '3/8', bracket: false, stack: '', trim: '' } });

describe('handrail measure', () => {
  it('reads tape-measure fractions', () => {
    expect(parseLen('5 5/8')).toBe(5.625);
    expect(parseLen('5-5/8"')).toBe(5.625);
    expect(parseLen("4' 3-1/2")).toBe(51.5);
    expect(parseLen('15/16')).toBe(0.9375);
    expect(parseLen("4' 11/16")).toBe(48.6875);
    expect(parseLen('3/4')).toBe(0.75);
    expect(parseLen('5.625')).toBe(5.625);
    expect(parseLen('')).toBeNull();
    expect(parseLen('5 5/ 8')).toBeNaN();
  });

  it('lays out the Cottage top flight like the quote', () => {
    const steps = [{ rise: '5-5/8', run: '' }, ...Array(11).fill({ rise: '5-5/8', run: '19-7/8' })];
    const r = computeFlight({ steps }, S);
    expect(r.posts.map((p) => p.riser)).toEqual([1, 4, 7, 9, 12]); // half-to-even, as fab.py
    expect(r.rail).toBeCloseTo(232.93, 2);
    expect(r.heights.every((h) => h >= 34 && h <= 38)).toBe(true);
  });

  it('waits for missing measurements', () => {
    expect(computeFlight({ steps: [{ rise: '5', run: '' }, { rise: '', run: '20' }] }, S).missing).toBe(true);
  });
});
