import { EventEmitter } from 'node:events';
import { ColumnDef, Envelope, TelemetryItem, buildSummary, resolveType } from './types';

const DEFAULT_CAPACITY = 10_000;
const MIN_CAPACITY = 100;
const MAX_CAPACITY = 1_000_000;

function parseCapacity(): number {
  const raw = process.env.MAX_ITEMS;
  if (!raw) return DEFAULT_CAPACITY;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_CAPACITY;
  return Math.min(MAX_CAPACITY, Math.max(MIN_CAPACITY, Math.floor(n)));
}

const BD_FIELDS = [
  'duration',
  'responseCode',
  'success',
  'url',
  'name',
  'resultCode',
  'type',
  'target',
  'data',
  'message',
  'severityLevel',
] as const;

export interface Batch {
  items: TelemetryItem[];
  newColumns: ColumnDef[];
}

class TelemetryStore {
  private readonly capacity: number;
  private readonly buffer: (TelemetryItem | undefined)[];
  private writeIdx = 0;
  private size = 0;
  private nextId = 1;
  private readonly columnsByKey = new Map<string, ColumnDef>();

  readonly emitter = new EventEmitter();
  dropMetrics: boolean;

  constructor() {
    this.capacity = parseCapacity();
    this.buffer = new Array(this.capacity);
    this.emitter.setMaxListeners(200);
    // Accept both new and legacy env var name
    const raw = process.env.DROP_METRICS_DEFAULT ?? process.env.NEXT_PUBLIC_DROP_METRICS_DEFAULT;
    this.dropMetrics = raw !== 'false';
  }

  private discoverColumnsForItem(item: TelemetryItem): ColumnDef[] {
    const fresh: ColumnDef[] = [];
    const seen = this.columnsByKey;

    const tryAdd = (key: string, label: string, category: ColumnDef['category']) => {
      if (seen.has(key)) return;
      const col: ColumnDef = { key, label, category };
      seen.set(key, col);
      fresh.push(col);
    };

    const bd = item.envelope.data?.baseData as unknown as Record<string, unknown> | undefined;
    if (bd) {
      for (const f of BD_FIELDS) {
        if (f in bd && bd[f] !== undefined) {
          tryAdd(`baseData.${f}`, f, 'baseData');
        }
      }
      const props = bd.properties as Record<string, string> | undefined;
      if (props) {
        for (const k of Object.keys(props)) tryAdd(`properties.${k}`, k, 'properties');
      }
      const ms = bd.measurements as Record<string, number> | undefined;
      if (ms) {
        for (const k of Object.keys(ms)) tryAdd(`measurements.${k}`, k, 'measurements');
      }
    }

    const tags = item.envelope.tags;
    if (tags) {
      for (const k of Object.keys(tags)) {
        tryAdd(`tags.${k}`, k.replace(/^ai\./, ''), 'tags');
      }
    }

    return fresh;
  }

  private push(envelope: Envelope): TelemetryItem | null {
    const type = resolveType(envelope);
    if (this.dropMetrics && type === 'Metric') return null;

    const item: TelemetryItem = {
      id: this.nextId++,
      timestamp: envelope.time || new Date().toISOString(),
      type,
      envelope,
      summary: buildSummary(type, envelope),
    };

    this.buffer[this.writeIdx] = item;
    this.writeIdx = (this.writeIdx + 1) % this.capacity;
    if (this.size < this.capacity) this.size++;

    return item;
  }

  add(envelope: Envelope): TelemetryItem | null {
    const item = this.push(envelope);
    if (!item) return null;
    const newColumns = this.discoverColumnsForItem(item);
    this.emitter.emit('batch', { items: [item], newColumns } satisfies Batch);
    return item;
  }

  addMany(envelopes: Envelope[]): TelemetryItem[] {
    const items: TelemetryItem[] = [];
    const newColumns: ColumnDef[] = [];
    for (const env of envelopes) {
      const item = this.push(env);
      if (!item) continue;
      items.push(item);
      const fresh = this.discoverColumnsForItem(item);
      if (fresh.length) newColumns.push(...fresh);
    }
    if (items.length) {
      this.emitter.emit('batch', { items, newColumns } satisfies Batch);
    }
    return items;
  }

  getAll(): TelemetryItem[] {
    if (this.size === 0) return [];
    if (this.size < this.capacity) {
      return this.buffer.slice(0, this.size) as TelemetryItem[];
    }
    // Full buffer: read from writeIdx (oldest) through wrap
    const out = new Array<TelemetryItem>(this.capacity);
    for (let i = 0; i < this.capacity; i++) {
      out[i] = this.buffer[(this.writeIdx + i) % this.capacity]!;
    }
    return out;
  }

  getByType(type: string): TelemetryItem[] {
    return this.getAll().filter((i) => i.type === type);
  }

  getColumns(): ColumnDef[] {
    return Array.from(this.columnsByKey.values());
  }

  clear(): void {
    this.buffer.fill(undefined);
    this.writeIdx = 0;
    this.size = 0;
    this.columnsByKey.clear();
    this.emitter.emit('clear');
  }

  get count(): number {
    return this.size;
  }

  get max(): number {
    return this.capacity;
  }
}

// Singleton — survives HMR in dev via globalThis
const globalForStore = globalThis as unknown as { __telemetryStore?: TelemetryStore };

export const telemetryStore: TelemetryStore =
  globalForStore.__telemetryStore ?? (globalForStore.__telemetryStore = new TelemetryStore());
