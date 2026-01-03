import { NextRequest, NextResponse } from 'next/server';

const TRUSTED_CDN = 'chat-assets.toolsforhumanity.com';

/**
 * Proxy for XMTP image attachments
 * Fetches images server-side to avoid CORS issues with the CDN
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');

  console.log('[image-proxy] Request received, url:', url?.slice(0, 100));

  if (!url) {
    console.log('[image-proxy] Missing url parameter');
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  // Validate URL is from trusted CDN
  try {
    const parsed = new URL(url);
    console.log('[image-proxy] Parsed hostname:', parsed.hostname);
    if (parsed.hostname !== TRUSTED_CDN) {
      console.log('[image-proxy] Untrusted hostname:', parsed.hostname);
      return NextResponse.json({ error: 'Untrusted source' }, { status: 403 });
    }
  } catch (e) {
    console.log('[image-proxy] Failed to parse URL:', e);
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  try {
    console.log('[image-proxy] Fetching from CDN...');
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'WorldChat/1.0',
      },
    });

    console.log('[image-proxy] CDN response status:', response.status);

    if (!response.ok) {
      console.log('[image-proxy] CDN error:', response.status, response.statusText);
      return NextResponse.json(
        { error: `Upstream error: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'application/octet-stream';

    console.log('[image-proxy] Success! Size:', data.byteLength, 'Type:', contentType);

    return new NextResponse(data, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    console.error('[image-proxy] Fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch image' }, { status: 500 });
  }
}
