import type { FeeSplit, MarketConfig, MarketState } from './types.js'

export const BPS_DENOMINATOR = 10_000n
export const TRADING_FEE_BPS = 100n
export const MAX_SIDE_QUANTITY_WEI = 30_000_000n * 10n ** 18n

export const INITIAL_FEE_SPLIT: FeeSplit = Object.freeze({
  protocolBps: 7_000n,
  creatorBps: 2_000n,
  referrerBps: 1_000n,
})

export const DEFAULT_MARKET_CONFIG: MarketConfig = Object.freeze({
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

export const INITIAL_MARKET_STATE: MarketState = Object.freeze({
  qAWei: 0n,
  qBWei: 0n,
  reserveUnits: 0n,
})
