import { Decimal as DecimalJs } from 'decimal.js'

export const Decimal = DecimalJs.clone({
  precision: 80,
  rounding: DecimalJs.ROUND_HALF_EVEN,
  toExpNeg: -100,
  toExpPos: 100,
})

export type DecimalValue = DecimalJs.Value

export function decimal(value: DecimalValue): DecimalJs {
  return new Decimal(value)
}

export function decimalToString(value: DecimalJs, significantDigits = 40): string {
  if (value.isZero()) return '0'
  return value.toSignificantDigits(significantDigits).toString()
}

export function pow10(decimals: number): bigint {
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new RangeError('decimals must be a non-negative integer')
  }
  return 10n ** BigInt(decimals)
}

export function unitsToDecimal(units: bigint, decimals: number): DecimalJs {
  return decimal(units.toString()).div(pow10(decimals).toString())
}

export function decimalToUnitsFloor(value: DecimalJs, decimals: number): bigint {
  if (value.isNegative()) {
    throw new RangeError('cannot convert a negative value to unsigned units')
  }

  return BigInt(
    value
      .mul(pow10(decimals).toString())
      .toDecimalPlaces(0, DecimalJs.ROUND_FLOOR)
      .toFixed(0),
  )
}

export function decimalToUnitsCeil(value: DecimalJs, decimals: number): bigint {
  if (value.isNegative()) {
    throw new RangeError('cannot convert a negative value to unsigned units')
  }

  return BigInt(
    value
      .mul(pow10(decimals).toString())
      .toDecimalPlaces(0, DecimalJs.ROUND_CEIL)
      .toFixed(0),
  )
}
