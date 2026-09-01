import type { Decimal as DecimalJs } from 'decimal.js'
import { DEFAULT_MARKET_CONFIG, INITIAL_FEE_SPLIT } from './constants.js'
import {
  decimal,
  decimalToString,
  decimalToUnitsFloor,
  unitsToDecimal,
} from './decimal.js'
import { allocateFee, calculateTradingFee, mulDivFloor } from './fees.js'
import {
  cost,
  dominance,
  prices,
  pricesDecimal,
  quantityForSide,
  relativePriceChangeBps,
  reserveBuffer,
  solveBuyQuantity,
} from './lmsr.js'
import type {
  BuyQuote,
  BuyQuoteParams,
  FeeSplit,
  FlipQuote,
  FlipQuoteParams,
  MarketConfig,
  MarketState,
  SellQuote,
  SellQuoteParams,
  Side,
} from './types.js'

function configOrDefault(config: MarketConfig | undefined): MarketConfig {
  return config ?? DEFAULT_MARKET_CONFIG
}

function splitOrDefault(split: FeeSplit | undefined): FeeSplit {
  return split ?? INITIAL_FEE_SPLIT
}

function destinationSide(sourceSide: Side): Side {
  return sourceSide === 'A' ? 'B' : 'A'
}

function withSideQuantity(
  state: MarketState,
  side: Side,
  quantityWei: bigint,
  reserveUnits: bigint,
): MarketState {
  return side === 'A'
    ? { qAWei: quantityWei, qBWei: state.qBWei, reserveUnits }
    : { qAWei: state.qAWei, qBWei: quantityWei, reserveUnits }
}

function sideQuantityWei(state: MarketState, side: Side): bigint {
  return side === 'A' ? state.qAWei : state.qBWei
}

function sidePrice(state: MarketState, side: Side, config: MarketConfig): DecimalJs {
  const result = pricesDecimal(state, config)
  return side === 'A' ? result.sideA : result.sideB
}

function validateStateReserve(state: MarketState, config: MarketConfig): void {
  const buffer = reserveBuffer(state, config)
  const tolerance = decimal('1e-60')
  if (buffer.lt(tolerance.neg())) {
    throw new RangeError(`reserve is below LMSR cost by ${buffer.abs().toString()}`)
  }
}

function resolvedSlippageBps(
  requested: bigint | undefined,
  config: MarketConfig,
): bigint {
  const slippage = requested ?? config.defaultSlippageBps
  if (slippage < 0n || slippage > config.maximumSlippageBps) {
    throw new RangeError('slippage is outside the configured range')
  }
  return slippage
}

function minimumReceived(value: bigint, slippageBps: bigint, config: MarketConfig): bigint {
  return mulDivFloor(
    value,
    config.bpsDenominator - slippageBps,
    config.bpsDenominator,
  )
}

function averagePrice(settlementAmount: DecimalJs, tokenAmount: DecimalJs): string {
  if (tokenAmount.isZero()) return '0'
  return decimalToString(settlementAmount.div(tokenAmount))
}

function commonFields(
  stateBefore: MarketState,
  stateAfter: MarketState,
  feeUnits: bigint,
  feeSplit: FeeSplit,
  hasReferrer: boolean,
  config: MarketConfig,
) {
  return {
    stateBefore,
    stateAfter,
    pricesBefore: prices(stateBefore, config),
    pricesAfter: prices(stateAfter, config),
    dominanceBefore: dominance(stateBefore, config),
    dominanceAfter: dominance(stateAfter, config),
    feeUnits,
    feeAllocation: allocateFee(
      feeUnits,
      feeSplit,
      hasReferrer,
      config.bpsDenominator,
    ),
    reserveDeltaUnits: stateAfter.reserveUnits - stateBefore.reserveUnits,
    reserveBufferBefore: decimalToString(reserveBuffer(stateBefore, config)),
    reserveBufferAfter: decimalToString(reserveBuffer(stateAfter, config)),
    quoteExpirySeconds: config.quoteExpirySeconds,
  }
}

export function quoteBuy(params: BuyQuoteParams): BuyQuote {
  const config = configOrDefault(params.config)
  const split = splitOrDefault(params.feeSplit)
  const hasReferrer = params.hasReferrer ?? true
  const slippageBps = resolvedSlippageBps(params.slippageBps, config)
  validateStateReserve(params.state, config)

  if (params.grossInputUnits < config.minimumBuyGrossUnits) {
    throw new RangeError('BUY gross input is below the configured minimum')
  }

  const feeUnits = calculateTradingFee(
    params.grossInputUnits,
    config.tradingFeeBps,
    config.bpsDenominator,
  )
  const curveInputUnits = params.grossInputUnits - feeUnits
  if (curveInputUnits <= 0n) throw new RangeError('BUY curve input must be positive')

  const currentQuantity = quantityForSide(params.state, params.side, config)
  const nextQuantity = solveBuyQuantity(
    params.state,
    params.side,
    unitsToDecimal(curveInputUnits, config.settlementDecimals),
    config,
  )
  const tokenOutputWei = decimalToUnitsFloor(
    nextQuantity.sub(currentQuantity),
    config.sideTokenDecimals,
  )
  if (tokenOutputWei <= 0n) throw new RangeError('BUY token output rounds to zero')

  const stateAfter = withSideQuantity(
    params.state,
    params.side,
    sideQuantityWei(params.state, params.side) + tokenOutputWei,
    params.state.reserveUnits + curveInputUnits,
  )
  const tokenOutput = unitsToDecimal(tokenOutputWei, config.sideTokenDecimals)
  const beforePrice = sidePrice(params.state, params.side, config)
  const afterPrice = sidePrice(stateAfter, params.side, config)

  return {
    kind: 'BUY',
    side: params.side,
    grossInputUnits: params.grossInputUnits,
    curveInputUnits,
    tokenOutputWei,
    minimumTokenOutputWei: minimumReceived(tokenOutputWei, slippageBps, config),
    marginalPriceChangeBps: relativePriceChangeBps(beforePrice, afterPrice),
    averageExecutionPrice: averagePrice(
      unitsToDecimal(curveInputUnits, config.settlementDecimals),
      tokenOutput,
    ),
    ...commonFields(params.state, stateAfter, feeUnits, split, hasReferrer, config),
  }
}

export function quoteSell(params: SellQuoteParams): SellQuote {
  const config = configOrDefault(params.config)
  const split = splitOrDefault(params.feeSplit)
  const hasReferrer = params.hasReferrer ?? true
  const slippageBps = resolvedSlippageBps(params.slippageBps, config)
  const sellAll = params.sellAll ?? false
  validateStateReserve(params.state, config)

  const currentQuantityWei = sideQuantityWei(params.state, params.side)
  if (params.tokenInputWei <= 0n || params.tokenInputWei > currentQuantityWei) {
    throw new RangeError('SELL token input is outside the available supply')
  }
  if (
    sellAll &&
    (params.walletBalanceWei === undefined || params.tokenInputWei !== params.walletBalanceWei)
  ) {
    throw new RangeError('sellAll requires the complete seller wallet balance')
  }

  const stateAfterBurn = withSideQuantity(
    params.state,
    params.side,
    currentQuantityWei - params.tokenInputWei,
    params.state.reserveUnits,
  )
  const grossOutput = cost(params.state, config).sub(cost(stateAfterBurn, config))
  const grossOutputUnits = decimalToUnitsFloor(grossOutput, config.settlementDecimals)

  if (!sellAll && grossOutputUnits < config.minimumSellGrossUnits) {
    throw new RangeError('SELL gross output is below the configured minimum')
  }
  if (grossOutputUnits <= 0n) throw new RangeError('SELL gross output rounds to zero')
  if (grossOutputUnits > params.state.reserveUnits) {
    throw new RangeError('SELL gross output exceeds the Curve Reserve')
  }

  const feeUnits = calculateTradingFee(
    grossOutputUnits,
    config.tradingFeeBps,
    config.bpsDenominator,
  )
  const netOutputUnits = grossOutputUnits - feeUnits
  if (netOutputUnits <= 0n) {
    throw new RangeError('SELL net output rounds to zero')
  }
  const stateAfter = { ...stateAfterBurn, reserveUnits: params.state.reserveUnits - grossOutputUnits }
  const tokenInput = unitsToDecimal(params.tokenInputWei, config.sideTokenDecimals)
  const beforePrice = sidePrice(params.state, params.side, config)
  const afterPrice = sidePrice(stateAfter, params.side, config)

  return {
    kind: 'SELL',
    side: params.side,
    tokenInputWei: params.tokenInputWei,
    grossOutputUnits,
    netOutputUnits,
    minimumNetOutputUnits: minimumReceived(netOutputUnits, slippageBps, config),
    marginalPriceChangeBps: relativePriceChangeBps(beforePrice, afterPrice),
    averageExecutionPrice: averagePrice(
      unitsToDecimal(grossOutputUnits, config.settlementDecimals),
      tokenInput,
    ),
    sellAll,
    ...commonFields(params.state, stateAfter, feeUnits, split, hasReferrer, config),
  }
}

export function quoteFlip(params: FlipQuoteParams): FlipQuote {
  const config = configOrDefault(params.config)
  const split = splitOrDefault(params.feeSplit)
  const hasReferrer = params.hasReferrer ?? true
  const slippageBps = resolvedSlippageBps(params.slippageBps, config)
  const targetSide = destinationSide(params.sourceSide)
  validateStateReserve(params.state, config)

  const sourceQuantityWei = sideQuantityWei(params.state, params.sourceSide)
  if (params.sourceTokenInputWei <= 0n || params.sourceTokenInputWei > sourceQuantityWei) {
    throw new RangeError('FLIP source token input is outside the available supply')
  }

  const stateAfterSourceBurn = withSideQuantity(
    params.state,
    params.sourceSide,
    sourceQuantityWei - params.sourceTokenInputWei,
    params.state.reserveUnits,
  )
  const sourceGrossOutput = cost(params.state, config).sub(cost(stateAfterSourceBurn, config))
  const sourceGrossOutputUnits = decimalToUnitsFloor(
    sourceGrossOutput,
    config.settlementDecimals,
  )
  if (sourceGrossOutputUnits < config.minimumFlipGrossUnits) {
    throw new RangeError('FLIP source gross output is below the configured minimum')
  }

  const feeUnits = calculateTradingFee(
    sourceGrossOutputUnits,
    config.tradingFeeBps,
    config.bpsDenominator,
  )
  const destinationCurveInputUnits = sourceGrossOutputUnits - feeUnits
  const targetQuantity = quantityForSide(stateAfterSourceBurn, targetSide, config)
  const nextTargetQuantity = solveBuyQuantity(
    stateAfterSourceBurn,
    targetSide,
    unitsToDecimal(destinationCurveInputUnits, config.settlementDecimals),
    config,
  )
  const destinationTokenOutputWei = decimalToUnitsFloor(
    nextTargetQuantity.sub(targetQuantity),
    config.sideTokenDecimals,
  )
  if (destinationTokenOutputWei <= 0n) {
    throw new RangeError('FLIP destination token output rounds to zero')
  }

  const stateAfter = withSideQuantity(
    stateAfterSourceBurn,
    targetSide,
    sideQuantityWei(stateAfterSourceBurn, targetSide) + destinationTokenOutputWei,
    params.state.reserveUnits - feeUnits,
  )
  const sourceTokenInput = unitsToDecimal(
    params.sourceTokenInputWei,
    config.sideTokenDecimals,
  )
  const destinationTokenOutput = unitsToDecimal(
    destinationTokenOutputWei,
    config.sideTokenDecimals,
  )
  const targetBeforePrice = sidePrice(stateAfterSourceBurn, targetSide, config)
  const targetAfterPrice = sidePrice(stateAfter, targetSide, config)

  return {
    kind: 'FLIP',
    sourceSide: params.sourceSide,
    destinationSide: targetSide,
    sourceTokenInputWei: params.sourceTokenInputWei,
    sourceGrossOutputUnits,
    destinationCurveInputUnits,
    destinationTokenOutputWei,
    minimumDestinationTokenOutputWei: minimumReceived(
      destinationTokenOutputWei,
      slippageBps,
      config,
    ),
    destinationMarginalPriceChangeBps: relativePriceChangeBps(
      targetBeforePrice,
      targetAfterPrice,
    ),
    sourceAverageExecutionPrice: averagePrice(
      unitsToDecimal(sourceGrossOutputUnits, config.settlementDecimals),
      sourceTokenInput,
    ),
    destinationAverageExecutionPrice: averagePrice(
      unitsToDecimal(destinationCurveInputUnits, config.settlementDecimals),
      destinationTokenOutput,
    ),
    ...commonFields(params.state, stateAfter, feeUnits, split, hasReferrer, config),
  }
}

export function assertQuoteDeadline(currentTimestamp: number, deadline: number): void {
  if (!Number.isInteger(currentTimestamp) || !Number.isInteger(deadline)) {
    throw new RangeError('timestamps must be integers')
  }
  if (currentTimestamp > deadline) throw new RangeError('quote has expired')
}
