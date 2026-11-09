import {NextRequest, NextResponse} from 'next/server';

export async function POST(request: NextRequest) {
  const base = (process.env.ROOMRENT_API_URL || process.env.NEXT_PUBLIC_ROOMRENT_API_URL || 'http://127.0.0.1:5000').replace(/\/$/, '');
  try {
    const response = await fetch(`${base}/api/support/tickets`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: await request.text(),
      cache: 'no-store',
      signal: AbortSignal.timeout(25000),
    });
    return new NextResponse(await response.text(), {
      status: response.status,
      headers: {'Content-Type': 'application/json'},
    });
  } catch {
    return NextResponse.json({error: {message: 'Support server is unavailable. Please try again shortly.'}}, {status: 503});
  }
}
