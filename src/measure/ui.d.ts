import type { JobDoc, MeasureDoc } from '../tracker/types';

export interface MeasureStore {
  save(id: string, change: (current: MeasureDoc | undefined) => MeasureDoc | undefined): Promise<void>;
  remove(id: string): Promise<void>;
  onSyncStatus(listener: (status: string) => void): void;
  refresh(): void; // read the database again and call update()
}
export function start(store: MeasureStore): void;
export function update(docs: MeasureDoc[], jobs: JobDoc[]): void;
