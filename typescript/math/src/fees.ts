import { BPS_DENOMINATOR, INITIAL_FEE_SPLIT } from './constants.js'
import type { FeeAllocation, FeeSplit } from './types.js'

export function mulDivFloor(value: bigint, multiplier: bigint, denominator: bigint): bigint {
  if (value < 0n || multiplier < 0n || denominator <= 0n) {
    throw new RangeError('mulDivFloor expects unsigned values and a positive denominator')
  }
  return (value * multiplier) / denominator
}

export function mulDivCeil(value: bigint, multiplier: bigint, denominator: bigint): bigint {
  if (value < 0n || multiplier < 0n || denominator <= 0n) {
    throw new RangeError('mulDivCeil expects unsigned values and a positive denominator')
  }
  if (value === 0n || multiplier === 0n) return 0n
  return (value * multiplier + denominator - 1n) / denominator
}

export function calculateTradingFee(
  grossUnits: bigint,
  feeBps: bigint,
  denominator = BPS_DENOMINATOR,
): bigint {
  return mulDivCeil(grossUnits, feeBps, denominator)
}

export function validateFeeSplit(
  split: FeeSplit,
  denominator = BPS_DENOMINATOR,
): void {
  if (split.protocolBps < 0n || split.creatorBps < 0n || split.referrerBps < 0n) {
    throw new RangeError('fee split values cannot be negative')
  }

  if (split.protocolBps + split.creatorBps + split.referrerBps !== denominator) {
    throw new RangeError('fee split must sum to the BPS denominator')
  }
}

export function allocateFee(
  feeUnits: bigint,
  split: FeeSplit = INITIAL_FEE_SPLIT,
  hasReferrer = true,
  denominator = BPS_DENOMINATOR,
): FeeAllocation {
  if (feeUnits < 0n) throw new RangeError('fee cannot be negative')
  validateFeeSplit(split, denominator)

  const creatorUnits = mulDivFloor(feeUnits, split.creatorBps, denominator)
  const referrerUnits = hasReferrer
    ? mulDivFloor(feeUnits, split.referrerBps, denominator)
    : 0n
  const protocolUnits = feeUnits - creatorUnits - referrerUnits

  return { protocolUnits, creatorUnits, referrerUnits }
}
