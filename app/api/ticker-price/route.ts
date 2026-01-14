import { NextRequest, NextResponse } from 'next/server';
import { getTickerConfig, type TickerConfig } from '@/config/tickers';

/**
 * Ticker price data returned by this API
 */
export interface TickerPriceData {
  symbol: string;
  name: string;
  currentPrice: number;
  priceChange24h: number;
  priceChangePercentage24h: number;
  /** Array of prices for 7-day sparkline chart */
  sparkline7d: number[];
  lastUpdated: string;
  /** Token icon URL */
  image?: string;
  /** Whether this is a stock or crypto */
  type: 'crypto' | 'stock';
}

// Server-side cache to minimize API calls
interface CacheEntry {
  data: TickerPriceData;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 1000; // 1 minute cache
const STALE_TTL_MS = 5 * 60 * 1000; // Serve stale data up to 5 minutes

// Track rate limit state per provider
let coinGeckoRateLimitedUntil = 0;
let massiveRateLimitedUntil = 0;
const RATE_LIMIT_BACKOFF_MS = 60 * 1000; // 1 minute backoff on rate limit

// Support multiple API keys for higher rate limits
const MASSIVE_API_KEYS = [
  process.env.MASSIVE_API_KEY,
  process.env.MASSIVE_API_KEY_2,
].filter(Boolean) as string[];

// Track which key to use (round-robin)
let currentKeyIndex = 0;

function getMassiveApiKey(): string | null {
  if (MASSIVE_API_KEYS.length === 0) return null;
  return MASSIVE_API_KEYS[currentKeyIndex % MASSIVE_API_KEYS.length];
}

function rotateApiKey(): void {
  if (MASSIVE_API_KEYS.length > 1) {
    currentKeyIndex = (currentKeyIndex + 1) % MASSIVE_API_KEYS.length;
  }
}

/**
 * Fetch crypto price data from CoinGecko
 */
async function fetchCryptoPrice(symbol: string, coinGeckoId: string): Promise<TickerPriceData> {
  const response = await fetch(
    `https://api.coingecko.com/api/v3/coins/${coinGeckoId}?localization=false&tickers=false&community_data=false&developer_data=false&sparkline=true`,
    {
      headers: {
        Accept: 'application/json',
      },
      next: { revalidate: 60 },
    }
  );

  if (response.status === 429) {
    coinGeckoRateLimitedUntil = Date.now() + RATE_LIMIT_BACKOFF_MS;
    throw new Error('RATE_LIMITED');
  }

  if (!response.ok) {
    throw new Error(`CoinGecko API error: ${response.status}`);
  }

  const data = await response.json();

  return {
    symbol,
    name: data.name,
    currentPrice: data.market_data?.current_price?.usd ?? 0,
    priceChange24h: data.market_data?.price_change_24h ?? 0,
    priceChangePercentage24h: data.market_data?.price_change_percentage_24h ?? 0,
    sparkline7d: data.market_data?.sparkline_7d?.price ?? [],
    lastUpdated: data.market_data?.last_updated ?? new Date().toISOString(),
    image: data.image?.small,
    type: 'crypto',
  };
}

/**
 * Fetch stock price data from Massive API (formerly Polygon)
 */
async function fetchStockPrice(symbol: string, config: TickerConfig): Promise<TickerPriceData> {
  const apiKey = getMassiveApiKey();
  if (!apiKey) {
    throw new Error('Massive API key not configured');
  }

  const baseUrl = 'https://api.massive.com';

  // Get the most recent trading day (skip weekends)
  const getLastTradingDay = (date: Date): string => {
    const day = date.getDay();
    if (day === 0) date.setDate(date.getDate() - 2); // Sunday -> Friday
    else if (day === 6) date.setDate(date.getDate() - 1); // Saturday -> Friday
    return date.toISOString().split('T')[0];
  };

  // Try to get daily summary for most recent trading day
  const today = new Date();
  let currentDate = getLastTradingDay(new Date(today));
  let previousDate = getLastTradingDay(new Date(today.getTime() - 24 * 60 * 60 * 1000));

  // Fetch daily ticker summary for current price
  // Try up to 5 previous trading days to find valid data
  let dailyData: { status: string; close?: number; open?: number; afterHours?: number } | null = null;
  let currentApiKey = apiKey;

  for (let attempts = 0; attempts < 5; attempts++) {
    const dailyResponse = await fetch(
      `${baseUrl}/v1/open-close/${config.id}/${currentDate}?adjusted=true&apiKey=${currentApiKey}`,
      {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      }
    );

    if (dailyResponse.status === 429) {
      // Try rotating to next API key before giving up
      if (MASSIVE_API_KEYS.length > 1) {
        rotateApiKey();
        const newKey = getMassiveApiKey();
        if (newKey && newKey !== currentApiKey) {
          currentApiKey = newKey;
          continue; // Retry with new key
        }
      }
      massiveRateLimitedUntil = Date.now() + RATE_LIMIT_BACKOFF_MS;
      throw new Error('RATE_LIMITED');
    }

    if (dailyResponse.ok) {
      const data = await dailyResponse.json();
      if (data.status === 'OK') {
        dailyData = data;
        break;
      }
    }

    // Try previous trading day
    const prevDay = new Date(currentDate);
    prevDay.setDate(prevDay.getDate() - 1);
    currentDate = getLastTradingDay(prevDay);

    const prevPrevDay = new Date(previousDate);
    prevPrevDay.setDate(prevPrevDay.getDate() - 1);
    previousDate = getLastTradingDay(prevPrevDay);
  }

  if (!dailyData || dailyData.status !== 'OK') {
    throw new Error('No data available for this stock');
  }

  // Fetch previous day for price change calculation
  const prevDailyResponse = await fetch(
    `${baseUrl}/v1/open-close/${config.id}/${previousDate}?adjusted=true&apiKey=${currentApiKey}`,
    {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    }
  );

  let previousClose = dailyData.open ?? dailyData.close ?? 0; // Fallback to open price
  if (prevDailyResponse.ok) {
    const prevDailyData = await prevDailyResponse.json();
    if (prevDailyData.status === 'OK' && prevDailyData.close) {
      previousClose = prevDailyData.close;
    }
  }

  // Calculate price change
  const currentPrice = dailyData.afterHours ?? dailyData.close ?? 0;
  const priceChange = previousClose > 0 ? currentPrice - previousClose : 0;
  const priceChangePercent = previousClose > 0 ? (priceChange / previousClose) * 100 : 0;

  // Fetch 30-day sparkline data
  const thirtyDaysAgo = new Date(currentDate);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const fromDate = thirtyDaysAgo.toISOString().split('T')[0];

  const aggsResponse = await fetch(
    `${baseUrl}/v2/aggs/ticker/${config.id}/range/1/day/${fromDate}/${currentDate}?adjusted=true&sort=asc&apiKey=${currentApiKey}`,
    {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    }
  );

  let sparkline7d: number[] = [];
  if (aggsResponse.ok) {
    const aggsData = await aggsResponse.json();
    if ((aggsData.status === 'OK' || aggsData.status === 'DELAYED') && aggsData.results) {
      sparkline7d = aggsData.results.map((bar: { c: number }) => bar.c);
    }
  }

  // Fetch ticker details for name and branding
  let name = config.name || symbol;
  let image: string | undefined;

  try {
    const tickerResponse = await fetch(
      `${baseUrl}/v3/reference/tickers/${config.id}?apiKey=${currentApiKey}`,
      {
        headers: { Accept: 'application/json' },
        next: { revalidate: 3600 }, // Cache ticker info for 1 hour
      }
    );

    if (tickerResponse.ok) {
      const tickerData = await tickerResponse.json();
      if (tickerData.status === 'OK' && tickerData.results) {
        name = tickerData.results.name || name;
        // Add API key to branding URL
        if (tickerData.results.branding?.icon_url) {
          image = `${tickerData.results.branding.icon_url}?apiKey=${currentApiKey}`;
        }
      }
    }
  } catch {
    // Ignore errors fetching ticker details, use fallback name
  }

  return {
    symbol,
    name,
    currentPrice,
    priceChange24h: priceChange,
    priceChangePercentage24h: priceChangePercent,
    sparkline7d,
    lastUpdated: new Date().toISOString(),
    image,
    type: 'stock',
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol')?.toUpperCase();

  if (!symbol) {
    return NextResponse.json({ error: 'Symbol parameter required' }, { status: 400 });
  }

  const config = getTickerConfig(symbol);
  if (!config) {
    return NextResponse.json({ error: 'Unsupported ticker symbol' }, { status: 404 });
  }

  const tickerType = config.type;
  const now = Date.now();

  // Check fresh cache first
  const cached = cache.get(symbol);
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return NextResponse.json(cached.data, {
      headers: {
        'Cache-Control': 'public, max-age=60',
        'X-Cache': 'HIT',
      },
    });
  }

  // Check if we're rate limited for this provider
  const rateLimitedUntil = tickerType === 'crypto' ? coinGeckoRateLimitedUntil : massiveRateLimitedUntil;
  if (now < rateLimitedUntil) {
    // Return stale cache if available
    if (cached && now - cached.timestamp < STALE_TTL_MS) {
      return NextResponse.json(
        { ...cached.data, stale: true },
        {
          headers: {
            'Cache-Control': 'public, max-age=30',
            'X-Cache': 'STALE',
          },
        }
      );
    }

    // No cache available, return 429
    const retryAfter = Math.ceil((rateLimitedUntil - now) / 1000);
    return NextResponse.json(
      { error: 'Rate limited, please try again later' },
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfter),
        },
      }
    );
  }

  try {
    let priceData: TickerPriceData;

    if (tickerType === 'crypto') {
      priceData = await fetchCryptoPrice(symbol, config.id);
    } else {
      priceData = await fetchStockPrice(symbol, config);
    }

    // Update cache
    cache.set(symbol, { data: priceData, timestamp: now });

    return NextResponse.json(priceData, {
      headers: {
        'Cache-Control': 'public, max-age=60',
        'X-Cache': 'MISS',
      },
    });
  } catch (error) {
    console.error(`[ticker-price] Error fetching ${symbol}:`, error);

    // Handle rate limiting
    if (error instanceof Error && error.message === 'RATE_LIMITED') {
      if (cached) {
        return NextResponse.json(
          { ...cached.data, stale: true },
          {
            headers: {
              'Cache-Control': 'public, max-age=30',
              'X-Cache': 'STALE',
            },
          }
        );
      }

      return NextResponse.json(
        { error: 'Rate limited, please try again later' },
        {
          status: 429,
          headers: {
            'Retry-After': '60',
          },
        }
      );
    }

    // Return stale cache on error if available
    if (cached) {
      return NextResponse.json(
        { ...cached.data, stale: true },
        {
          headers: {
            'Cache-Control': 'public, max-age=30',
            'X-Cache': 'STALE',
          },
        }
      );
    }

    return NextResponse.json(
      { error: 'Failed to fetch price data' },
      { status: 502 }
    );
  }
}
