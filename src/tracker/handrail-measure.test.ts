import { parseLen, fmt, computeFlight, settings, DEFAULT_SETTINGS } from './measure';
import { mergeEdits } from './merge';
import type { MeasureDoc } from './types';

const S = settings({ ...DEFAULT_SETTINGS, plate: '0', trim: '' });

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
    expect(parseLen('1/0')).toBeNaN();
  });

  it('prints sixteenths', () => {
    expect(fmt(35.21875)).toBe('35-1/4"');
    expect(fmt(2.75)).toBe('2-3/4"');
    expect(fmt(0.5)).toBe('1/2"');
    expect(fmt(11.99)).toBe('12"');
  });

  it('lays out the Cottage top flight like the quote (fab.py)', () => {
    const steps = [{ rise: '5-5/8', run: '', post: null, note: '' },
      ...Array.from({ length: 11 }, () => ({ rise: '5-5/8', run: '19-7/8', post: null, note: '' }))];
    const r = computeFlight({ steps }, S);
    if (r.missing) throw new Error('missing');
    expect(r.posts.map((p) => p.riser)).toEqual([1, 4, 7, 9, 12]); // half-to-even rounding, as fab.py
    expect(r.rail).toBeCloseTo(232.93, 2);
    expect(r.posts[0]!.along).toBeCloseTo(2.86, 2); // setback counted once
    expect(r.posts[0]!.under).toBeCloseTo(35.219, 3);
    expect(r.heights.every((h) => h >= 34 && h <= 38)).toBe(true);
  });

  it('takes posts set by hand', () => {
    const steps = Array.from({ length: 4 }, (_, i) => ({ rise: '6', run: i ? '12' : '', post: i === 0 || i === 2 ? true : null, note: '' }));
    const r = computeFlight({ steps }, S);
    expect(!r.missing && r.posts.map((p) => p.riser)).toEqual([1, 3]);
  });

  it('waits for missing or unreadable measurements', () => {
    const blank = { post: null, note: '' };
    expect(computeFlight({ steps: [{ rise: '5', run: '', ...blank }, { rise: '', run: '20', ...blank }] }, S).missing).toBe(true);
    expect(computeFlight({ steps: [{ rise: '5', run: '', ...blank }, { rise: '5 5/ 8', run: '20', ...blank }] }, S).missing).toBe(true);
  });

  it('merges offline edits to different fields of one measure job', () => {
    const base: MeasureDoc = { _id: 'measure:1', type: 'measure', name: 'Cottage', site: '', date: '2026-11-25', jobId: '',
      width: '', inset: '', notes: '', settings: DEFAULT_SETTINGS, flights: [], createdAt: '2026-11-25T00:00:00Z', updatedAt: 'a' };
    const phone = { ...base, width: '48', updatedAt: 'b' };
    const laptop = { ...base, jobId: 'job:9', updatedAt: 'c' };
    expect(mergeEdits(base, phone, laptop)).toMatchObject({ width: '48', jobId: 'job:9' });
  });
});
