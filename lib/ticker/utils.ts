/**
 * Ticker Symbol Utilities
 * Detects and extracts ticker symbols (e.g., $WLD, $wld, $BTC) from message text
 */

// Regex to match ticker symbols: $ followed by 1-5 letters (case-insensitive)
// Does not match: $100 (numbers only)
const TICKER_REGEX = /\$([A-Za-z]{1,5})\b/g;

export interface TickerMatch {
  /** Symbol without $ prefix, normalized to uppercase (e.g., "WLD") */
  symbol: string;
  /** Full match including $ (e.g., "$WLD" or "$wld") */
  fullMatch: string;
  /** Position in text */
  index: number;
}

/**
 * Extract all ticker symbols from text
 * Returns unique tickers (deduped by symbol, normalized to uppercase)
 */
export function extractTickers(text: string): TickerMatch[] {
  const matches: TickerMatch[] = [];
  let match;

  // Reset regex state
  TICKER_REGEX.lastIndex = 0;

  while ((match = TICKER_REGEX.exec(text)) !== null) {
    matches.push({
      symbol: match[1].toUpperCase(), // Normalize to uppercase
      fullMatch: match[0],
      index: match.index,
    });
  }

  // Deduplicate by symbol (keep first occurrence)
  const seen = new Set<string>();
  return matches.filter((m) => {
    if (seen.has(m.symbol)) return false;
    seen.add(m.symbol);
    return true;
  });
}

/**
 * Check if text contains any ticker symbols
 */
export function hasTickers(text: string): boolean {
  TICKER_REGEX.lastIndex = 0;
  return TICKER_REGEX.test(text);
}

/**
 * Get the first ticker symbol from text, if any
 */
export function getFirstTicker(text: string): TickerMatch | null {
  const tickers = extractTickers(text);
  return tickers.length > 0 ? tickers[0] : null;
}
