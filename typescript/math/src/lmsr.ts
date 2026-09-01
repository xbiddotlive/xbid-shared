import type { Decimal as DecimalJs } from 'decimal.js'
import {
  Decimal,
  decimal,
  decimalToString,
  decimalToUnitsCeil,
  unitsToDecimal,
} from './decimal.js'
import { DEFAULT_MARKET_CONFIG } from './constants.js'
import type { Dominance, MarketConfig, MarketState, Prices, Side } from './types.js'

const LOG_98 = decimal(98).ln()
const LOG_100 = decimal(100).ln()

function maxDecimal(values: readonly DecimalJs[]): DecimalJs {
  const [first, ...rest] = values
  if (first === undefined) throw new Error('at least one value is required')
  return rest.reduce((current, value) => (value.gt(current) ? value : current), first)
}

export function logSumExp(values: readonly DecimalJs[]): DecimalJs {
  const maximum = maxDecimal(values)
  const normalized = values.reduce(
    (sum, value) => sum.add(value.sub(maximum).exp()),
    decimal(0),
  )
  return maximum.add(normalized.ln())
}

export function stateQuantities(
  state: MarketState,
  config: MarketConfig = DEFAULT_MARKET_CONFIG,
): { qA: DecimalJs; qB: DecimalJs } {
  if (state.qAWei < 0n || state.qBWei < 0n || state.reserveUnits < 0n) {
    throw new RangeError('market state values cannot be negative')
  }
  if (
    state.qAWei > config.maximumSideQuantityWei ||
    state.qBWei > config.maximumSideQuantityWei
  ) {
    throw new RangeError('side quantity exceeds the Market Version limit')
  }

  return {
    qA: unitsToDecimal(state.qAWei, config.sideTokenDecimals),
    qB: unitsToDecimal(state.qBWei, config.sideTokenDecimals),
  }
}

export function logPartition(
  state: MarketState,
  config: MarketConfig = DEFAULT_MARKET_CONFIG,
): DecimalJs {
  const { qA, qB } = stateQuantities(state, config)
  const b = decimal(config.b)
  return logSumExp([qA.div(b), qB.div(b), LOG_98])
}

export function cost(
  state: MarketState,
  config: MarketConfig = DEFAULT_MARKET_CONFIG,
): DecimalJs {
  const partition = logPartition(state, config)
  if (state.qAWei === 0n && state.qBWei === 0n) return decimal(0)
  return decimal(config.b).mul(partition.sub(LOG_100))
}

export function requiredReserveUnits(
  state: MarketState,
  config: MarketConfig = DEFAULT_MARKET_CONFIG,
): bigint {
  return decimalToUnitsCeil(cost(state, config), config.settlementDecimals)
}

export function reserveBuffer(
  state: MarketState,
  config: MarketConfig = DEFAULT_MARKET_CONFIG,
): DecimalJs {
  return unitsToDecimal(state.reserveUnits, config.settlementDecimals).sub(cost(state, config))
}

export function pricesDecimal(
  state: MarketState,
  config: MarketConfig = DEFAULT_MARKET_CONFIG,
): { sideA: DecimalJs; sideB: DecimalJs; neutral: DecimalJs } {
  stateQuantities(state, config)
  if (state.qAWei === 0n && state.qBWei === 0n) {
    return {
      sideA: decimal('0.01'),
      sideB: decimal('0.01'),
      neutral: decimal('0.98'),
    }
  }

  const { qA, qB } = stateQuantities(state, config)
  const b = decimal(config.b)
  const logZ = logSumExp([qA.div(b), qB.div(b), LOG_98])

  return {
    sideA: qA.div(b).sub(logZ).exp(),
    sideB: qB.div(b).sub(logZ).exp(),
    neutral: LOG_98.sub(logZ).exp(),
  }
}

export function prices(
  state: MarketState,
  config: MarketConfig = DEFAULT_MARKET_CONFIG,
): Prices {
  const result = pricesDecimal(state, config)
  return {
    sideA: decimalToString(result.sideA),
    sideB: decimalToString(result.sideB),
    neutral: decimalToString(result.neutral),
  }
}

export function dominanceDecimal(
  state: MarketState,
  config: MarketConfig = DEFAULT_MARKET_CONFIG,
): { sideA: DecimalJs; sideB: DecimalJs } {
  const result = pricesDecimal(state, config)
  const total = result.sideA.add(result.sideB)
  return {
    sideA: result.sideA.div(total),
    sideB: result.sideB.div(total),
  }
}

export function dominance(
  state: MarketState,
  config: MarketConfig = DEFAULT_MARKET_CONFIG,
): Dominance {
  const result = dominanceDecimal(state, config)
  return {
    sideA: decimalToString(result.sideA),
    sideB: decimalToString(result.sideB),
  }
}

export function quantityForSide(
  state: MarketState,
  side: Side,
  config: MarketConfig = DEFAULT_MARKET_CONFIG,
): DecimalJs {
  const quantities = stateQuantities(state, config)
  return side === 'A' ? quantities.qA : quantities.qB
}

export function solveBuyQuantity(
  state: MarketState,
  side: Side,
  curveInput: DecimalJs,
  config: MarketConfig = DEFAULT_MARKET_CONFIG,
): DecimalJs {
  if (curveInput.isNegative()) throw new RangeError('curve input cannot be negative')
  if (curveInput.isZero()) return quantityForSide(state, side, config)

  const b = decimal(config.b)
  const logZ = logPartition(state, config)
  const currentQuantity = quantityForSide(state, side, config)
  const currentWeight = currentQuantity.div(b).exp()
  const partition = logZ.exp()
  const growth = curveInput.div(b).exp().sub(1)
  const nextWeight = currentWeight.add(partition.mul(growth))

  return b.mul(nextWeight.ln())
}

export function relativePriceChangeBps(before: DecimalJs, after: DecimalJs): number {
  if (before.lte(0)) throw new RangeError('price before trade must be positive')
  return after
    .sub(before)
    .abs()
    .div(before)
    .mul(10_000)
    .toDecimalPlaces(0, Decimal.ROUND_FLOOR)
    .toNumber()
}
