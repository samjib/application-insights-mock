import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

/**
 * GET /api/profiles/{instrumentationKey}/appId
 *
 * Cross-component correlation ID lookup used by server-side Application Insights
 * SDKs (.NET, Java, Node.js v1) to resolve an instrumentation key to an appId.
 * The appId is then stamped into outgoing Request-Context headers so downstream
 * components can stitch dependency chains together.
 *
 * Strategy: echo the instrumentation key back as the appId. It is already a UUID,
 * is deterministic, and requires no server-side lookup table.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ instrumentationKey: string }> },
) {
  const { instrumentationKey } = await params;

  return new NextResponse(instrumentationKey, {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
