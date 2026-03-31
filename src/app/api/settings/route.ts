import { NextRequest, NextResponse } from 'next/server';
import { telemetryStore } from '@/lib/telemetry-store';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ dropMetrics: telemetryStore.dropMetrics });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  if (typeof body.dropMetrics === 'boolean') {
    telemetryStore.dropMetrics = body.dropMetrics;
  }
  return NextResponse.json({ dropMetrics: telemetryStore.dropMetrics });
}
