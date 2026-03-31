import { NextRequest, NextResponse } from 'next/server';
import { telemetryStore } from '@/lib/telemetry-store';

export const dynamic = 'force-dynamic';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get('type');

  const items = type ? telemetryStore.getByType(type) : telemetryStore.getAll();

  return NextResponse.json({ count: items.length, items }, { headers: CORS_HEADERS });
}

export async function DELETE() {
  telemetryStore.clear();
  return NextResponse.json({ status: 'cleared' }, { headers: CORS_HEADERS });
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
