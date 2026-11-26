import { afterEach, expect, test, vi } from 'vitest';
import { alertUnhandled } from './unhandled';

const alert = vi.fn();
vi.stubGlobal('alert', alert);
vi.spyOn(console, 'warn').mockImplementation(() => {});
afterEach(() => alert.mockClear());

const reject = (reason: unknown) => alertUnhandled({ reason } as PromiseRejectionEvent);

test('network failures do not alert', () => {
  reject(new TypeError('NetworkError when attempting to fetch resource.'));
  reject(new TypeError('Failed to fetch'));
  reject(new TypeError('Load failed'));
  expect(alert).not.toHaveBeenCalled();
});

test('other failures still alert', () => {
  reject(new TypeError("can't access property 'rate', settings is undefined"));
  reject(new Error('Failed to fetch')); // not a fetch TypeError
  reject('quota exceeded');
  expect(alert).toHaveBeenCalledTimes(3);
  expect(alert).toHaveBeenLastCalledWith(expect.stringContaining('quota exceeded'));
});
