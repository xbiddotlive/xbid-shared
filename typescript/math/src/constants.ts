import type { FeeSplit, MarketConfig, MarketState } from './types.js'

export const BPS_DENOMINATOR = 10_000n
export const TRADING_FEE_BPS = 100n
export const MAX_SIDE_QUANTITY_WEI = 30_000_000n * 10n ** 18n

export const INITIAL_FEE_SPLIT: FeeSplit = Object.freeze({
  protocolBps: 7_000n,
  creatorBps: 2_000n,
  referrerBps: 1_000n,
})

export const MARKET_V1_CONFIG: MarketConfig = Object.freeze({
  b: '270000',
  settlementDecimals: 6,
  sideTokenDecimals: 18,
  maximumSideQuantityWei: MAX_SIDE_QUANTITY_WEI,
  tradingFeeBps: TRADING_FEE_BPS,
  bpsDenominator: BPS_DENOMINATOR,
  minimumBuyGrossUnits: 1_000_000n,
  minimumSellGrossUnits: 1_000_000n,
  minimumFlipGrossUnits: 50_000_000n,
  defaultSlippageBps: 300n,
  maximumSlippageBps: 2_000n,
  quoteExpirySeconds: 30,
})

export const MARKET_V2_CONFIG: MarketConfig = Object.freeze({
  ...MARKET_V1_CONFIG,
  b: '150000',
})

/** Version 3 preserves V2 economics and fixes the onchain buy inverse domain. */
export const MARKET_V3_CONFIG: MarketConfig = Object.freeze({
  ...MARKET_V2_CONFIG,
})

export const MARKET_CONFIG_BY_VERSION: Readonly<Record<number, MarketConfig>> =
  Object.freeze({
    1: MARKET_V1_CONFIG,
    2: MARKET_V2_CONFIG,
    3: MARKET_V3_CONFIG,
  })

/** Version 1 remains the default for callers that do not supply a version. */
export const DEFAULT_MARKET_CONFIG = MARKET_V1_CONFIG

export function marketConfigForVersion(marketVersion: number): MarketConfig {
  const config = MARKET_CONFIG_BY_VERSION[marketVersion]
  if (!config) throw new RangeError(`unsupported market version: ${marketVersion}`)
  return config
}

export const INITIAL_MARKET_STATE: MarketState = Object.freeze({
  qAWei: 0n,
  qBWei: 0n,
  reserveUnits: 0n,
})
