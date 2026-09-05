import { NextRequest, NextResponse } from 'next/server';
import { telemetryStore } from '@/lib/telemetry-store';

export const dynamic = 'force-dynamic';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function clampInt(raw: string | null, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (raw === null) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const type = params.get('type');
  const all = type ? telemetryStore.getByType(type) : telemetryStore.getAll();

  const limit = clampInt(params.get('limit'), 0, 0, telemetryStore.max);
  const rawOffset = params.get('offset');
  const offset = clampInt(rawOffset, 0, 0, all.length);

  // `?limit=N` on its own returns the N most recent items — the dashboard wants
  // the tail of the buffer, not its head. Paging back through history is done by
  // passing an explicit offset.
  let items = all;
  if (limit > 0) {
    items = rawOffset === null ? all.slice(-limit) : all.slice(offset, offset + limit);
  } else if (rawOffset !== null) {
    items = all.slice(offset);
  }

  return NextResponse.json(
    {
      total: all.length,
      count: items.length,
      offset,
      capacity: telemetryStore.max,
      columns: telemetryStore.getColumns(),
      items,
    },
    { headers: CORS_HEADERS },
  );
}

export async function DELETE() {
  telemetryStore.clear();
  return NextResponse.json({ status: 'cleared' }, { headers: CORS_HEADERS });
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
