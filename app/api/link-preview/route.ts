import { NextRequest, NextResponse } from 'next/server';

interface LinkMetadata {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  domain: string;
}

// Extract Open Graph and meta tags from HTML
function extractMetadata(html: string, url: string): LinkMetadata {
  const domain = new URL(url).hostname.replace(/^www\./, '');

  // Helper to extract content from meta tags
  const getMetaContent = (property: string): string | undefined => {
    // Try og: prefix first
    const ogMatch = html.match(
      new RegExp(`<meta[^>]*property=["']og:${property}["'][^>]*content=["']([^"']*)["']`, 'i')
    ) || html.match(
      new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*property=["']og:${property}["']`, 'i')
    );
    if (ogMatch) return ogMatch[1];

    // Try twitter: prefix
    const twitterMatch = html.match(
      new RegExp(`<meta[^>]*name=["']twitter:${property}["'][^>]*content=["']([^"']*)["']`, 'i')
    ) || html.match(
      new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*name=["']twitter:${property}["']`, 'i')
    );
    if (twitterMatch) return twitterMatch[1];

    // Try standard meta name
    const metaMatch = html.match(
      new RegExp(`<meta[^>]*name=["']${property}["'][^>]*content=["']([^"']*)["']`, 'i')
    ) || html.match(
      new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*name=["']${property}["']`, 'i')
    );
    if (metaMatch) return metaMatch[1];

    return undefined;
  };

  // Extract title
  let title = getMetaContent('title');
  if (!title) {
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    title = titleMatch?.[1]?.trim();
  }

  // Extract description
  const description = getMetaContent('description');

  // Extract image
  let image = getMetaContent('image');
  if (image && !image.startsWith('http')) {
    // Handle relative URLs
    try {
      image = new URL(image, url).href;
    } catch {
      image = undefined;
    }
  }

  return {
    url,
    title: title ? decodeHTMLEntities(title) : undefined,
    description: description ? decodeHTMLEntities(description) : undefined,
    image,
    domain,
  };
}

// Decode HTML entities
function decodeHTMLEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)))
    .replace(/&#x([a-fA-F0-9]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');

  if (!url) {
    return NextResponse.json(
      { error: 'URL parameter is required' },
      { status: 400 }
    );
  }

  // Validate URL
  try {
    new URL(url);
  } catch {
    return NextResponse.json(
      { error: 'Invalid URL' },
      { status: 400 }
    );
  }

  try {
    // Fetch the URL with a timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; WorldChat/1.0; +https://world.org)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      redirect: 'follow',
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch URL: ${response.status}` },
        { status: 502 }
      );
    }

    const contentType = response.headers.get('content-type') || '';

    // For non-HTML content, return basic metadata
    if (!contentType.includes('text/html')) {
      const domain = new URL(url).hostname.replace(/^www\./, '');
      return NextResponse.json({
        url,
        domain,
        title: domain,
      } satisfies LinkMetadata);
    }

    const html = await response.text();
    const metadata = extractMetadata(html, url);

    return NextResponse.json(metadata, {
      headers: {
        'Cache-Control': 'public, max-age=3600, s-maxage=86400',
      },
    });
  } catch (error) {
    console.error('Link preview error:', error);

    // Return basic metadata on error
    const domain = new URL(url).hostname.replace(/^www\./, '');
    return NextResponse.json({
      url,
      domain,
    } satisfies LinkMetadata);
  }
}
