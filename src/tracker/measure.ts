// Stair handrail geometry for the Measure page: rise/run per riser timber -> posts, rail, cut lengths.
// Same rules as the shop's fab.py, so a quote and a cut list from the same numbers agree.

export interface MeasureStep {
  rise: string;
  run: string;
  post: boolean | null; // true/false = set by hand; null = auto layout
  note: string;
}

export interface MeasureFlight {
  name: string;
  steps: MeasureStep[];
  totRise: string;
  totRun: string;
  notes: string;
}

export interface MeasureSettings {
  H: string; lo: string; hi: string; span: string; back: string; tail: string;
  railH: string; plate: string; bracket: boolean; stack: string; trim: string;
}

export interface Settings {
  H: number; lo: number; hi: number; span: number; back: number; tail: number;
  railH: number; plate: number; bracket: boolean; stack: number; trim: number;
}

export interface Post { riser: number; px: number; along: number; top: number; under: number; tube: number }

export type FlightResult =
  | { missing: true }
  | {
      missing?: false;
      noses: [number, number][];
      deg: number;
      heights: number[];
      posts: Post[];
      spans: number[];
      manual: boolean;
      rail: number;
      railEnd: [number, number];
      sumRise: number;
      sumRun: number;
    };

export const DEFAULT_SETTINGS: MeasureSettings = {
  H: '36', lo: '34', hi: '38', span: '72', back: '2-3/4', tail: '2-3/4', railH: '1-1/2', plate: '3/8',
  bracket: false, stack: '', trim: '1/2',
};

/** Tape-measure text to inches: "5 5/8", "5-5/8", "5.625", "4' 3-1/2\"", "15/16". Blank -> null, junk -> NaN. */
export function parseLen(text: string | null | undefined): number | null {
  let s = String(text ?? '').trim().replace(/["”]/g, '');
  if (!s) return null;
  let ft = 0;
  let m = s.match(/^(-?\d+(?:\.\d+)?)\s*['’]\s*-?\s*(.*)$/);
  if (m) {
    ft = Number(m[1]);
    s = (m[2] ?? '').trim();
    if (!s) return ft * 12;
  }
  // A whole number needs a space or dash before its fraction, so "15/16" stays a fraction.
  m = s.match(/^(?:(\d+(?:\.\d+)?)(?:[\s-]+|$))?(?:(\d+)\/(\d+))?$/);
  if (!m || (m[1] == null && m[2] == null) || (m[3] != null && Number(m[3]) === 0)) return NaN;
  return ft * 12 + (m[1] ? Number(m[1]) : 0) + (m[2] ? Number(m[2]) / Number(m[3]) : 0);
}

/** Inches to the nearest 1/16, e.g. 35.21875 -> 35-1/4". */
export function fmt(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '?';
  const neg = v < 0;
  v = Math.abs(v);
  let w = Math.floor(v);
  let n = Math.round((v - w) * 16);
  if (n === 16) { w++; n = 0; }
  let d = 16;
  while (n && n % 2 === 0) { n /= 2; d /= 2; }
  return (neg ? '-' : '') + (n ? (w ? `${w}-${n}/${d}"` : `${n}/${d}"`) : `${w}"`);
}

const roundHalfEven = (v: number) => (v % 1 === 0.5 ? Math.floor(v) + (Math.floor(v) % 2) : Math.round(v)); // Python round()

/** Fewest evenly spread risers, always the first and last, with every span <= span (fab.py's rule). */
export function evenPosts(noses: [number, number][], span: number): number[] {
  const k = noses.length;
  const d = (a: number, b: number) => Math.hypot(noses[b]![0] - noses[a]![0], noses[b]![1] - noses[a]![1]);
  for (let n = 1; n < k; n++) {
    const idx = [...Array(n + 1)].map((_, i) => roundHalfEven((i * (k - 1)) / n));
    if (idx.every((a, i) => i === 0 || d(idx[i - 1]!, a) <= span)) return idx;
  }
  return [...Array(k).keys()];
}

export function settings(s: MeasureSettings): Settings {
  const n = (k: keyof MeasureSettings) => parseLen(String(s[k] ?? '')) ?? NaN;
  return {
    H: n('H'), lo: n('lo'), hi: n('hi'), span: n('span'), back: n('back'), tail: n('tail'), railH: n('railH'),
    plate: n('plate'), bracket: !!s.bracket, stack: parseLen(s.stack) || 0, trim: parseLen(s.trim) || 0,
  };
}

/** Nose i sits rise_i above nose i-1 and run_i past it; timber 1's rise is from the landing and its run is unused. */
export function computeFlight(f: Pick<MeasureFlight, 'steps'>, S: Settings): FlightResult {
  const steps = f.steps.map((s) => ({ rise: parseLen(s.rise), run: parseLen(s.run), post: s.post }));
  const missing = steps.some((s, i) => !((s.rise ?? NaN) > 0) || (i > 0 && !((s.run ?? NaN) > 0)));
  if (missing || steps.length < 2) return { missing: true };
  let x = 0;
  let y = 0;
  const noses = steps.map((s, i): [number, number] => {
    if (i) { x += s.run!; y += s.rise!; }
    return [x, y];
  });
  const [x0, y0] = noses[0]!;
  const [x1, y1] = noses[noses.length - 1]!;
  const m = (y1 - y0) / (x1 - x0);
  const ang = Math.atan(m);
  const c = Math.cos(ang);
  const railAt = (px: number) => y0 + S.H + m * (px - x0); // top of rail, plumb
  const manual = steps.some((s) => s.post === true);
  const idx = manual ? steps.flatMap((s, i) => (s.post === true ? [i] : [])) : evenPosts(noses, S.span);
  const endX = x1 + S.back + S.tail;
  const posts = idx.map((i): Post => {
    const px = noses[i]![0] + S.back;
    const top = railAt(px) - noses[i]![1]; // timber top to top of rail
    const under = top - S.railH / c; // timber top to underside of rail
    return { riser: i + 1, px, along: (px - x0) / c, top, under, tube: under - S.plate - (S.bracket ? S.stack : 0) };
  });
  return {
    noses, deg: (ang * 180) / Math.PI, manual,
    heights: noses.map(([nx, ny]) => railAt(nx) - ny),
    posts,
    spans: posts.slice(1).map((p, i) => (p.px - posts[i]!.px) / c),
    rail: Math.hypot(endX - x0, railAt(endX) - (y0 + S.H)),
    railEnd: [endX, railAt(endX)],
    sumRise: y1 - y0,
    sumRun: x1 - x0,
  };
}
