import { handleTrack, handleHealthCheck, handleOptions } from '@/lib/track-handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = handleTrack;
export const GET = handleHealthCheck;
export const OPTIONS = handleOptions;
