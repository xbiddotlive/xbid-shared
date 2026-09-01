export type Side = 'A' | 'B'

export interface MarketConfig {
  readonly b: string
  readonly settlementDecimals: number
  readonly sideTokenDecimals: number
  readonly maximumSideQuantityWei: bigint
  readonly tradingFeeBps: bigint
  readonly bpsDenominator: bigint
  readonly minimumBuyGrossUnits: bigint
  readonly minimumSellGrossUnits: bigint
  readonly minimumFlipGrossUnits: bigint
  readonly defaultSlippageBps: bigint
  readonly maximumSlippageBps: bigint
  readonly quoteExpirySeconds: number
}

export interface MarketState {
  readonly qAWei: bigint
  readonly qBWei: bigint
  readonly reserveUnits: bigint
}

export interface Prices {
  readonly sideA: string
  readonly sideB: string
  readonly neutral: string
}

export interface Dominance {
  readonly sideA: string
  readonly sideB: string
}

export interface FeeSplit {
  readonly protocolBps: bigint
  readonly creatorBps: bigint
  readonly referrerBps: bigint
}

export interface FeeAllocation {
  readonly protocolUnits: bigint
  readonly creatorUnits: bigint
  readonly referrerUnits: bigint
}

export interface BuyQuoteParams {
  readonly state: MarketState
  readonly side: Side
  readonly grossInputUnits: bigint
  readonly slippageBps?: bigint
  readonly feeSplit?: FeeSplit
  readonly hasReferrer?: boolean
  readonly config?: MarketConfig
}

export interface SellQuoteParams {
  readonly state: MarketState
  readonly side: Side
  readonly tokenInputWei: bigint
  readonly sellAll?: boolean
  readonly walletBalanceWei?: bigint
  readonly slippageBps?: bigint
  readonly feeSplit?: FeeSplit
  readonly hasReferrer?: boolean
  readonly config?: MarketConfig
}

export interface FlipQuoteParams {
  readonly state: MarketState
  readonly sourceSide: Side
  readonly sourceTokenInputWei: bigint
  readonly slippageBps?: bigint
  readonly feeSplit?: FeeSplit
  readonly hasReferrer?: boolean
  readonly config?: MarketConfig
}

export interface QuoteCommon {
  readonly stateBefore: MarketState
  readonly stateAfter: MarketState
  readonly pricesBefore: Prices
  readonly pricesAfter: Prices
  readonly dominanceBefore: Dominance
  readonly dominanceAfter: Dominance
  readonly feeUnits: bigint
  readonly feeAllocation: FeeAllocation
  readonly reserveDeltaUnits: bigint
  readonly reserveBufferBefore: string
  readonly reserveBufferAfter: string
  readonly quoteExpirySeconds: number
}

export interface BuyQuote extends QuoteCommon {
  readonly kind: 'BUY'
  readonly side: Side
  readonly grossInputUnits: bigint
  readonly curveInputUnits: bigint
  readonly tokenOutputWei: bigint
  readonly minimumTokenOutputWei: bigint
  readonly marginalPriceChangeBps: number
  readonly averageExecutionPrice: string
}

export interface SellQuote extends QuoteCommon {
  readonly kind: 'SELL'
  readonly side: Side
  readonly tokenInputWei: bigint
  readonly grossOutputUnits: bigint
  readonly netOutputUnits: bigint
  readonly minimumNetOutputUnits: bigint
  readonly marginalPriceChangeBps: number
  readonly averageExecutionPrice: string
  readonly sellAll: boolean
}

export interface FlipQuote extends QuoteCommon {
  readonly kind: 'FLIP'
  readonly sourceSide: Side
  readonly destinationSide: Side
  readonly sourceTokenInputWei: bigint
  readonly sourceGrossOutputUnits: bigint
  readonly destinationCurveInputUnits: bigint
  readonly destinationTokenOutputWei: bigint
  readonly minimumDestinationTokenOutputWei: bigint
  readonly destinationMarginalPriceChangeBps: number
  readonly sourceAverageExecutionPrice: string
  readonly destinationAverageExecutionPrice: string
}
