export interface Listener {
  (...args: unknown[]): void;
  listener?: (...args: unknown[]) => void;
}

export function EventEmitter(this: unknown) {
  (this as { _events?: Record<string, Listener[]> })._events = {};
}

EventEmitter.listenerCount = function (emitter: { _events?: Record<string, Listener[]> }, type: string): number {
  return emitter._events?.[type]?.length ?? 0;
};

EventEmitter.prototype.on = function (this: { _events: Record<string, Listener[]> }, type: string, listener: Listener) {
  this._events ??= {};
  (this._events[type] ??= []).push(listener);
  return this;
};

EventEmitter.prototype.addListener = EventEmitter.prototype.on;

EventEmitter.prototype.once = function (this: { on: (t: string, l: Listener) => void; removeListener: (t: string, l: Listener) => void }, type: string, listener: Listener) {
  const g: Listener = (...args: unknown[]) => {
    this.removeListener(type, g);
    listener.apply(this, args);
  };
  g.listener = listener;
  return this.on(type, g);
};

EventEmitter.prototype.removeListener = function (this: { _events: Record<string, Listener[]> }, type: string, listener: Listener) {
  this._events ??= {};
  const list = this._events[type];
  if (!list) return this;
  const idx = list.findIndex((l) => l === listener || l.listener === listener);
  if (idx !== -1) list.splice(idx, 1);
  return this;
};

EventEmitter.prototype.off = EventEmitter.prototype.removeListener;

EventEmitter.prototype.removeAllListeners = function (this: { _events: Record<string, Listener[]> }, type?: string) {
  this._events ??= {};
  if (type) {
    delete this._events[type];
  } else {
    this._events = {};
  }
  return this;
};

EventEmitter.prototype.emit = function (this: { _events: Record<string, Listener[]> }, type: string, ...args: unknown[]) {
  this._events ??= {};
  const list = this._events[type];
  if (!list || list.length === 0) return false;
  const copy = [...list];
  for (const fn of copy) {
    fn.apply(this, args);
  }
  return true;
};

EventEmitter.prototype.listeners = function (this: { _events: Record<string, Listener[]> }, type: string): Listener[] {
  this._events ??= {};
  return this._events[type] ? [...this._events[type]] : [];
};

EventEmitter.prototype.listenerCount = function (this: { _events: Record<string, Listener[]> }, type: string): number {
  this._events ??= {};
  return this._events[type]?.length ?? 0;
};

export default EventEmitter;
