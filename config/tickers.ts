/**
 * Ticker Symbol Configuration
 * Maps ticker symbols to price data sources (CoinGecko for crypto, Finnhub for stocks)
 */

export type TickerType = 'crypto' | 'stock';

export interface TickerConfig {
  type: TickerType;
  /** CoinGecko ID for crypto, stock symbol for stocks */
  id: string;
  /** Display name (optional, fetched from API if not provided) */
  name?: string;
}

/**
 * Unified ticker configuration
 */
export const TICKERS: Record<string, TickerConfig> = {
  // ===== CRYPTO (CoinGecko) =====

  // World ecosystem
  WLD: { type: 'crypto', id: 'worldcoin-wld' },

  // Major cryptocurrencies
  BTC: { type: 'crypto', id: 'bitcoin' },
  ETH: { type: 'crypto', id: 'ethereum' },
  SOL: { type: 'crypto', id: 'solana' },
  XRP: { type: 'crypto', id: 'ripple' },
  ADA: { type: 'crypto', id: 'cardano' },
  DOGE: { type: 'crypto', id: 'dogecoin' },
  DOT: { type: 'crypto', id: 'polkadot' },
  AVAX: { type: 'crypto', id: 'avalanche-2' },
  MATIC: { type: 'crypto', id: 'matic-network' },
  LINK: { type: 'crypto', id: 'chainlink' },
  LTC: { type: 'crypto', id: 'litecoin' },
  BCH: { type: 'crypto', id: 'bitcoin-cash' },
  ATOM: { type: 'crypto', id: 'cosmos' },
  NEAR: { type: 'crypto', id: 'near' },
  APT: { type: 'crypto', id: 'aptos' },
  ARB: { type: 'crypto', id: 'arbitrum' },
  OP: { type: 'crypto', id: 'optimism' },

  // Stablecoins
  USDC: { type: 'crypto', id: 'usd-coin' },
  USDT: { type: 'crypto', id: 'tether' },
  DAI: { type: 'crypto', id: 'dai' },
  BUSD: { type: 'crypto', id: 'binance-usd' },

  // DeFi tokens
  UNI: { type: 'crypto', id: 'uniswap' },
  AAVE: { type: 'crypto', id: 'aave' },
  MKR: { type: 'crypto', id: 'maker' },
  CRV: { type: 'crypto', id: 'curve-dao-token' },
  COMP: { type: 'crypto', id: 'compound-governance-token' },
  SNX: { type: 'crypto', id: 'havven' },
  SUSHI: { type: 'crypto', id: 'sushi' },
  YFI: { type: 'crypto', id: 'yearn-finance' },

  // Layer 2 / Scaling
  STRK: { type: 'crypto', id: 'starknet' },
  IMX: { type: 'crypto', id: 'immutable-x' },
  LRC: { type: 'crypto', id: 'loopring' },

  // Meme coins
  SHIB: { type: 'crypto', id: 'shiba-inu' },
  PEPE: { type: 'crypto', id: 'pepe' },
  FLOKI: { type: 'crypto', id: 'floki' },
  BONK: { type: 'crypto', id: 'bonk' },
  WIF: { type: 'crypto', id: 'dogwifhat' },

  // Exchange tokens
  BNB: { type: 'crypto', id: 'binancecoin' },
  FTT: { type: 'crypto', id: 'ftx-token' },
  CRO: { type: 'crypto', id: 'crypto-com-chain' },

  // Other popular tokens
  TON: { type: 'crypto', id: 'the-open-network' },
  TRX: { type: 'crypto', id: 'tron' },
  HBAR: { type: 'crypto', id: 'hedera-hashgraph' },
  FIL: { type: 'crypto', id: 'filecoin' },
  ICP: { type: 'crypto', id: 'internet-computer' },
  VET: { type: 'crypto', id: 'vechain' },
  ALGO: { type: 'crypto', id: 'algorand' },
  XLM: { type: 'crypto', id: 'stellar' },
  EOS: { type: 'crypto', id: 'eos' },
  SAND: { type: 'crypto', id: 'the-sandbox' },
  MANA: { type: 'crypto', id: 'decentraland' },
  AXS: { type: 'crypto', id: 'axie-infinity' },
  APE: { type: 'crypto', id: 'apecoin' },
  GRT: { type: 'crypto', id: 'the-graph' },
  FTM: { type: 'crypto', id: 'fantom' },
  THETA: { type: 'crypto', id: 'theta-token' },
  XMR: { type: 'crypto', id: 'monero' },
  ETC: { type: 'crypto', id: 'ethereum-classic' },
  XTZ: { type: 'crypto', id: 'tezos' },
  NEO: { type: 'crypto', id: 'neo' },
  EGLD: { type: 'crypto', id: 'elrond-erd-2' },
  FLOW: { type: 'crypto', id: 'flow' },
  KAVA: { type: 'crypto', id: 'kava' },
  RUNE: { type: 'crypto', id: 'thorchain' },
  ZEC: { type: 'crypto', id: 'zcash' },
  DASH: { type: 'crypto', id: 'dash' },
  ENJ: { type: 'crypto', id: 'enjincoin' },
  CHZ: { type: 'crypto', id: 'chiliz' },
  BAT: { type: 'crypto', id: 'basic-attention-token' },
  ZIL: { type: 'crypto', id: 'zilliqa' },
  ENS: { type: 'crypto', id: 'ethereum-name-service' },
  GALA: { type: 'crypto', id: 'gala' },
  RENDER: { type: 'crypto', id: 'render-token' },
  INJ: { type: 'crypto', id: 'injective-protocol' },
  SUI: { type: 'crypto', id: 'sui' },
  SEI: { type: 'crypto', id: 'sei-network' },
  TIA: { type: 'crypto', id: 'celestia' },
  JUP: { type: 'crypto', id: 'jupiter-exchange-solana' },
  PYTH: { type: 'crypto', id: 'pyth-network' },

  // ===== STOCKS (Finnhub) =====

  // Popular tech stocks
  AAPL: { type: 'stock', id: 'AAPL', name: 'Apple' },
  GOOGL: { type: 'stock', id: 'GOOGL', name: 'Alphabet' },
  GOOG: { type: 'stock', id: 'GOOG', name: 'Alphabet' },
  MSFT: { type: 'stock', id: 'MSFT', name: 'Microsoft' },
  AMZN: { type: 'stock', id: 'AMZN', name: 'Amazon' },
  META: { type: 'stock', id: 'META', name: 'Meta' },
  NVDA: { type: 'stock', id: 'NVDA', name: 'NVIDIA' },
  TSLA: { type: 'stock', id: 'TSLA', name: 'Tesla' },
  AMD: { type: 'stock', id: 'AMD', name: 'AMD' },
  INTC: { type: 'stock', id: 'INTC', name: 'Intel' },
  CRM: { type: 'stock', id: 'CRM', name: 'Salesforce' },
  ORCL: { type: 'stock', id: 'ORCL', name: 'Oracle' },
  NFLX: { type: 'stock', id: 'NFLX', name: 'Netflix' },
  ADBE: { type: 'stock', id: 'ADBE', name: 'Adobe' },

  // Fintech / Finance
  HOOD: { type: 'stock', id: 'HOOD', name: 'Robinhood' },
  SQ: { type: 'stock', id: 'SQ', name: 'Block' },
  PYPL: { type: 'stock', id: 'PYPL', name: 'PayPal' },
  V: { type: 'stock', id: 'V', name: 'Visa' },
  MA: { type: 'stock', id: 'MA', name: 'Mastercard' },
  JPM: { type: 'stock', id: 'JPM', name: 'JPMorgan' },
  GS: { type: 'stock', id: 'GS', name: 'Goldman Sachs' },
  MS: { type: 'stock', id: 'MS', name: 'Morgan Stanley' },
  BAC: { type: 'stock', id: 'BAC', name: 'Bank of America' },
  WFC: { type: 'stock', id: 'WFC', name: 'Wells Fargo' },
  C: { type: 'stock', id: 'C', name: 'Citigroup' },
  COIN: { type: 'stock', id: 'COIN', name: 'Coinbase' },

  // ETFs
  VOO: { type: 'stock', id: 'VOO', name: 'Vanguard S&P 500' },
  SPY: { type: 'stock', id: 'SPY', name: 'SPDR S&P 500' },
  QQQ: { type: 'stock', id: 'QQQ', name: 'Invesco QQQ' },
  VTI: { type: 'stock', id: 'VTI', name: 'Vanguard Total Stock' },
  IWM: { type: 'stock', id: 'IWM', name: 'iShares Russell 2000' },
  DIA: { type: 'stock', id: 'DIA', name: 'SPDR Dow Jones' },
  ARKK: { type: 'stock', id: 'ARKK', name: 'ARK Innovation' },

  // Other popular stocks
  DIS: { type: 'stock', id: 'DIS', name: 'Disney' },
  NKE: { type: 'stock', id: 'NKE', name: 'Nike' },
  SBUX: { type: 'stock', id: 'SBUX', name: 'Starbucks' },
  MCD: { type: 'stock', id: 'MCD', name: 'McDonald\'s' },
  WMT: { type: 'stock', id: 'WMT', name: 'Walmart' },
  TGT: { type: 'stock', id: 'TGT', name: 'Target' },
  COST: { type: 'stock', id: 'COST', name: 'Costco' },
  HD: { type: 'stock', id: 'HD', name: 'Home Depot' },
  LOW: { type: 'stock', id: 'LOW', name: 'Lowe\'s' },
  PG: { type: 'stock', id: 'PG', name: 'Procter & Gamble' },
  KO: { type: 'stock', id: 'KO', name: 'Coca-Cola' },
  PEP: { type: 'stock', id: 'PEP', name: 'PepsiCo' },
  JNJ: { type: 'stock', id: 'JNJ', name: 'Johnson & Johnson' },
  PFE: { type: 'stock', id: 'PFE', name: 'Pfizer' },
  MRNA: { type: 'stock', id: 'MRNA', name: 'Moderna' },
  UNH: { type: 'stock', id: 'UNH', name: 'UnitedHealth' },
  XOM: { type: 'stock', id: 'XOM', name: 'Exxon Mobil' },
  CVX: { type: 'stock', id: 'CVX', name: 'Chevron' },
  BA: { type: 'stock', id: 'BA', name: 'Boeing' },
  CAT: { type: 'stock', id: 'CAT', name: 'Caterpillar' },
  GM: { type: 'stock', id: 'GM', name: 'General Motors' },
  F: { type: 'stock', id: 'F', name: 'Ford' },
  UBER: { type: 'stock', id: 'UBER', name: 'Uber' },
  LYFT: { type: 'stock', id: 'LYFT', name: 'Lyft' },
  ABNB: { type: 'stock', id: 'ABNB', name: 'Airbnb' },
  SNAP: { type: 'stock', id: 'SNAP', name: 'Snap' },
  PINS: { type: 'stock', id: 'PINS', name: 'Pinterest' },
  SPOT: { type: 'stock', id: 'SPOT', name: 'Spotify' },
  RBLX: { type: 'stock', id: 'RBLX', name: 'Roblox' },
  U: { type: 'stock', id: 'U', name: 'Unity' },
  PLTR: { type: 'stock', id: 'PLTR', name: 'Palantir' },
  SNOW: { type: 'stock', id: 'SNOW', name: 'Snowflake' },
  ZM: { type: 'stock', id: 'ZM', name: 'Zoom' },
  SHOP: { type: 'stock', id: 'SHOP', name: 'Shopify' },
  ROKU: { type: 'stock', id: 'ROKU', name: 'Roku' },
  TWLO: { type: 'stock', id: 'TWLO', name: 'Twilio' },
  NET: { type: 'stock', id: 'NET', name: 'Cloudflare' },
  DDOG: { type: 'stock', id: 'DDOG', name: 'Datadog' },
  MDB: { type: 'stock', id: 'MDB', name: 'MongoDB' },
  CRWD: { type: 'stock', id: 'CRWD', name: 'CrowdStrike' },
  ZS: { type: 'stock', id: 'ZS', name: 'Zscaler' },
  PANW: { type: 'stock', id: 'PANW', name: 'Palo Alto' },
  NOW: { type: 'stock', id: 'NOW', name: 'ServiceNow' },
  WDAY: { type: 'stock', id: 'WDAY', name: 'Workday' },
  TEAM: { type: 'stock', id: 'TEAM', name: 'Atlassian' },
  DOCU: { type: 'stock', id: 'DOCU', name: 'DocuSign' },
  AI: { type: 'stock', id: 'AI', name: 'C3.ai' },
  PATH: { type: 'stock', id: 'PATH', name: 'UiPath' },
  SMCI: { type: 'stock', id: 'SMCI', name: 'Super Micro' },
  ARM: { type: 'stock', id: 'ARM', name: 'ARM Holdings' },
};

// Legacy compatibility - map to CoinGecko IDs only
export const TICKER_TO_COINGECKO: Record<string, string> = Object.fromEntries(
  Object.entries(TICKERS)
    .filter(([_, config]) => config.type === 'crypto')
    .map(([symbol, config]) => [symbol, config.id])
);

/**
 * Get ticker configuration
 */
export function getTickerConfig(symbol: string): TickerConfig | null {
  return TICKERS[symbol.toUpperCase()] ?? null;
}

/**
 * Get CoinGecko ID for a ticker symbol (crypto only)
 * @returns CoinGecko ID or null if not a crypto ticker
 */
export function getCoinGeckoId(symbol: string): string | null {
  const config = TICKERS[symbol.toUpperCase()];
  return config?.type === 'crypto' ? config.id : null;
}

/**
 * Check if a ticker symbol is supported
 */
export function isSupportedTicker(symbol: string): boolean {
  return symbol.toUpperCase() in TICKERS;
}

/**
 * Get ticker type (crypto or stock)
 */
export function getTickerType(symbol: string): TickerType | null {
  return TICKERS[symbol.toUpperCase()]?.type ?? null;
}

/**
 * Get list of all supported ticker symbols
 */
export function getSupportedTickers(): string[] {
  return Object.keys(TICKERS);
}
