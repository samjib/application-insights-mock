import { EventEmitter } from 'node:events';
import { Envelope, TelemetryItem, resolveType, buildSummary } from './types';

const MAX_ITEMS = 10_000;

class TelemetryStore {
  private items: TelemetryItem[] = [];
  private nextId = 1;
  readonly emitter = new EventEmitter();
  dropMetrics: boolean;

  constructor() {
    // Allow many SSE listeners
    this.emitter.setMaxListeners(100);
    // Default from env — active immediately, no UI required
    this.dropMetrics = process.env.NEXT_PUBLIC_DROP_METRICS_DEFAULT !== 'false';
  }

  add(envelope: Envelope): TelemetryItem | null {
    const type = resolveType(envelope);

    if (this.dropMetrics && type === 'Metric') {
      return null;
    }

    const item: TelemetryItem = {
      id: this.nextId++,
      timestamp: envelope.time || new Date().toISOString(),
      type,
      envelope,
      summary: buildSummary(type, envelope),
    };

    this.items.push(item);

    // Trim oldest items if over capacity
    if (this.items.length > MAX_ITEMS) {
      this.items = this.items.slice(this.items.length - MAX_ITEMS);
    }

    this.emitter.emit('item', item);
    return item;
  }

  addMany(envelopes: Envelope[]): TelemetryItem[] {
    return envelopes.map((e) => this.add(e)).filter((item): item is TelemetryItem => item !== null);
  }

  getAll(): TelemetryItem[] {
    return this.items;
  }

  getByType(type: string): TelemetryItem[] {
    return this.items.filter((i) => i.type === type);
  }

  clear(): void {
    this.items = [];
    this.emitter.emit('clear');
  }

  get count(): number {
    return this.items.length;
  }
}

// Singleton — survives HMR in dev via globalThis
const globalForStore = globalThis as unknown as { __telemetryStore?: TelemetryStore };

export const telemetryStore: TelemetryStore =
  globalForStore.__telemetryStore ?? (globalForStore.__telemetryStore = new TelemetryStore());
