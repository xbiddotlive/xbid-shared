import { DEFAULT_MARKET_CONFIG } from './constants.js'
import { Decimal, decimal, pow10 } from './decimal.js'
import type { MarketConfig } from './types.js'

function exactDominanceDifference(
  targetDominance: string,
  config: MarketConfig,
) {
  const target = decimal(targetDominance)
  if (target.lte(0) || target.gte(1)) {
    throw new RangeError('target dominance must satisfy 0 < target < 1')
  }

  return decimal(config.b).mul(target.div(decimal(1).sub(target)).ln())
}

function signedUnitsCeil(value: ReturnType<typeof decimal>, decimals: number): bigint {
  return BigInt(
    value
      .mul(pow10(decimals).toString())
      .toDecimalPlaces(0, Decimal.ROUND_CEIL)
      .toFixed(0),
  )
}

export function dominanceDifferenceExact(
  targetDominance: string,
  config: MarketConfig = DEFAULT_MARKET_CONFIG,
): string {
  return exactDominanceDifference(targetDominance, config).toString()
}

/** Minimum integer qSide - qOther that guarantees dominance >= target. */
export function minimumDifferenceWeiForDominance(
  targetDominance: string,
  config: MarketConfig = DEFAULT_MARKET_CONFIG,
): bigint {
  return signedUnitsCeil(
    exactDominanceDifference(targetDominance, config),
    config.sideTokenDecimals,
  )
}

/** Largest integer qSide - qOther that guarantees dominance < target. */
export function maximumDifferenceWeiStrictlyBelowDominance(
  targetDominance: string,
  config: MarketConfig = DEFAULT_MARKET_CONFIG,
): bigint {
  return (
    signedUnitsCeil(
      exactDominanceDifference(targetDominance, config),
      config.sideTokenDecimals,
    ) - 1n
  )
}
