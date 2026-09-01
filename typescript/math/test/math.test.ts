import { describe, expect, it } from 'vitest'
import {
  DEFAULT_MARKET_CONFIG,
  INITIAL_MARKET_STATE,
  MAX_SIDE_QUANTITY_WEI,
  allocateFee,
  calculateTradingFee,
  cost,
  decimal,
  dominanceDecimal,
  maximumDifferenceWeiStrictlyBelowDominance,
  minimumDifferenceWeiForDominance,
  pricesDecimal,
  quoteBuy,
  quoteFlip,
  quoteSell,
  reserveBuffer,
  type FeeSplit,
  type MarketState,
} from '../src/index.js'

function stateAtDifference(differenceWei: bigint): MarketState {
  return differenceWei >= 0n
    ? { qAWei: differenceWei, qBWei: 0n, reserveUnits: 0n }
    : { qAWei: 0n, qBWei: -differenceWei, reserveUnits: 0n }
}

function expectSolvent(state: MarketState): void {
  expect(reserveBuffer(state).gte(decimal('-1e-60'))).toBe(true)
}

describe('LMSR foundations', () => {
  it('starts at zero cost and 1% / 1% / 98% prices', () => {
    const initialCost = cost(INITIAL_MARKET_STATE)
    const initialPrices = pricesDecimal(INITIAL_MARKET_STATE)
    const initialDominance = dominanceDecimal(INITIAL_MARKET_STATE)

    expect(initialCost.eq(0)).toBe(true)
    expect(initialPrices.sideA.eq('0.01')).toBe(true)
    expect(initialPrices.sideB.eq('0.01')).toBe(true)
    expect(initialPrices.neutral.eq('0.98')).toBe(true)
    expect(initialPrices.sideA.add(initialPrices.sideB).add(initialPrices.neutral).eq(1)).toBe(
      true,
    )
    expect(initialDominance.sideA.eq('0.5')).toBe(true)
    expect(initialDominance.sideB.eq('0.5')).toBe(true)
  })

  it('remains numerically stable at large quantities', () => {
    const state: MarketState = {
      qAWei: 30_000_000n * 10n ** 18n,
      qBWei: 24_000_000n * 10n ** 18n,
      reserveUnits: 100_000_000_000_000n,
    }
    const result = pricesDecimal(state)
    const sum = result.sideA.add(result.sideB).add(result.neutral)

    expect(sum.sub(1).abs().lt('1e-60')).toBe(true)
    expect(result.sideA.gt(result.sideB)).toBe(true)
    expect(result.sideB.gt(result.neutral)).toBe(true)
  })

  it('accepts the locked maximum quantity and rejects one wei above it', () => {
    const maximumState: MarketState = {
      qAWei: MAX_SIDE_QUANTITY_WEI,
      qBWei: MAX_SIDE_QUANTITY_WEI,
      reserveUnits: 30_000_000n * 1_000_000n,
    }
    expect(cost(maximumState).gt(0)).toBe(true)

    expect(() =>
      cost({ ...maximumState, qAWei: MAX_SIDE_QUANTITY_WEI + 1n }),
    ).toThrow(/Market Version limit/)
  })
})

describe('fees', () => {
  it('rounds the 1% fee upward in settlement base units', () => {
    expect(calculateTradingFee(1n, 100n)).toBe(1n)
    expect(calculateTradingFee(1_000_000n, 100n)).toBe(10_000n)
    expect(calculateTradingFee(1_000_001n, 100n)).toBe(10_001n)
  })

  it('supports a governed 80/10/10 split and gives dust to Protocol', () => {
    const split: FeeSplit = {
      protocolBps: 8_000n,
      creatorBps: 1_000n,
      referrerBps: 1_000n,
    }

    expect(allocateFee(101n, split, true)).toEqual({
      protocolUnits: 81n,
      creatorUnits: 10n,
      referrerUnits: 10n,
    })
    expect(allocateFee(101n, split, false)).toEqual({
      protocolUnits: 91n,
      creatorUnits: 10n,
      referrerUnits: 0n,
    })
  })
})

describe('Crown dominance thresholds', () => {
  it.each(['0.48', '0.52', '0.55'])(
    'rounds the minimum difference for %s dominance upward by exactly one wei',
    (target) => {
      const minimumDifferenceWei = minimumDifferenceWeiForDominance(target)

      expect(
        dominanceDecimal(stateAtDifference(minimumDifferenceWei)).sideA.gte(target),
      ).toBe(true)
      expect(
        dominanceDecimal(stateAtDifference(minimumDifferenceWei - 1n)).sideA.lt(target),
      ).toBe(true)
    },
  )

  it('rounds the strict below-45% reset boundary downward by exactly one wei', () => {
    const maximumDifferenceWei = maximumDifferenceWeiStrictlyBelowDominance('0.45')

    expect(
      dominanceDecimal(stateAtDifference(maximumDifferenceWei)).sideA.lt('0.45'),
    ).toBe(true)
    expect(
      dominanceDecimal(stateAtDifference(maximumDifferenceWei + 1n)).sideA.gte('0.45'),
    ).toBe(true)
  })
})

describe('quotes', () => {
  it('matches the locked v1.4 one-sided net-buy curve table', () => {
    const cases = [
      [100, 0.01037],
      [500, 0.01183],
      [1_000, 0.01366],
      [5_000, 0.02816],
      [10_000, 0.04600],
      [50_000, 0.17736],
      [70_000, 0.23609],
    ] as const

    for (const [netUsdc, expectedPrice] of cases) {
      const netUnits = BigInt(netUsdc) * 1_000_000n
      const grossUnits = (netUnits * 10_000n + 9_899n) / 9_900n
      const quote = quoteBuy({
        state: INITIAL_MARKET_STATE,
        side: 'A',
        grossInputUnits: grossUnits,
      })

      expect(quote.curveInputUnits).toBe(netUnits)
      expect(Number(quote.pricesAfter.sideA)).toBeCloseTo(expectedPrice, 5)
    }
  })

  it('quotes BUY using gross fee input and net Curve input', () => {
    const quote = quoteBuy({
      state: INITIAL_MARKET_STATE,
      side: 'A',
      grossInputUnits: 100_000_000n,
    })

    expect(quote.feeUnits).toBe(1_000_000n)
    expect(quote.curveInputUnits).toBe(99_000_000n)
    expect(quote.reserveDeltaUnits).toBe(99_000_000n)
    expect(quote.stateAfter.qAWei).toBe(quote.tokenOutputWei)
    expect(quote.stateAfter.qBWei).toBe(0n)
    expect(quote.minimumTokenOutputWei).toBe(
      (quote.tokenOutputWei * 9_700n) / 10_000n,
    )
    expect(Number(quote.pricesAfter.sideA)).toBeGreaterThan(0.01)
    expectSolvent(quote.stateAfter)
  })

  it('allows Sell All to clean a position below the normal 1 USDC minimum', () => {
    const buy = quoteBuy({
      state: INITIAL_MARKET_STATE,
      side: 'A',
      grossInputUnits: DEFAULT_MARKET_CONFIG.minimumBuyGrossUnits,
    })

    expect(() =>
      quoteSell({
        state: buy.stateAfter,
        side: 'A',
        tokenInputWei: buy.tokenOutputWei,
      }),
    ).toThrow(/below the configured minimum/)

    const sellAll = quoteSell({
      state: buy.stateAfter,
      side: 'A',
      tokenInputWei: buy.tokenOutputWei,
      sellAll: true,
      walletBalanceWei: buy.tokenOutputWei,
    })

    expect(sellAll.stateAfter.qAWei).toBe(0n)
    expect(sellAll.grossOutputUnits).toBeLessThan(1_000_000n)
    expectSolvent(sellAll.stateAfter)
  })

  it('rejects a Sell All whose fee consumes the complete gross output', () => {
    const buy = quoteBuy({
      state: INITIAL_MARKET_STATE,
      side: 'A',
      grossInputUnits: DEFAULT_MARKET_CONFIG.minimumBuyGrossUnits,
    })

    expect(() =>
      quoteSell({
        state: buy.stateAfter,
        side: 'A',
        tokenInputWei: 99_963_713_256_941n,
        sellAll: true,
        walletBalanceWei: 99_963_713_256_941n,
      }),
    ).toThrow(/net output rounds to zero/)
  })

  it('charges FLIP exactly once and decreases Reserve only by that fee', () => {
    const buy = quoteBuy({
      state: INITIAL_MARKET_STATE,
      side: 'A',
      grossInputUnits: 10_000_000_000n,
    })
    const flip = quoteFlip({
      state: buy.stateAfter,
      sourceSide: 'A',
      sourceTokenInputWei: buy.tokenOutputWei / 2n,
    })

    expect(flip.destinationCurveInputUnits).toBe(
      flip.sourceGrossOutputUnits - flip.feeUnits,
    )
    expect(flip.reserveDeltaUnits).toBe(-flip.feeUnits)
    expect(flip.feeUnits).toBe(
      calculateTradingFee(
        flip.sourceGrossOutputUnits,
        DEFAULT_MARKET_CONFIG.tradingFeeBps,
      ),
    )
    expect(flip.stateAfter.qAWei).toBe(buy.stateAfter.qAWei - flip.sourceTokenInputWei)
    expect(flip.stateAfter.qBWei).toBe(flip.destinationTokenOutputWei)
    expectSolvent(flip.stateAfter)
  })

  it('preserves Reserve solvency through a mixed deterministic sequence', () => {
    const buyA = quoteBuy({
      state: INITIAL_MARKET_STATE,
      side: 'A',
      grossInputUnits: 20_000_000_000n,
    })
    expectSolvent(buyA.stateAfter)

    const buyB = quoteBuy({
      state: buyA.stateAfter,
      side: 'B',
      grossInputUnits: 12_000_000_000n,
    })
    expectSolvent(buyB.stateAfter)

    const flip = quoteFlip({
      state: buyB.stateAfter,
      sourceSide: 'A',
      sourceTokenInputWei: buyB.stateAfter.qAWei / 4n,
    })
    expectSolvent(flip.stateAfter)

    const sell = quoteSell({
      state: flip.stateAfter,
      side: 'B',
      tokenInputWei: flip.stateAfter.qBWei / 5n,
    })
    expectSolvent(sell.stateAfter)
  })

  it('rejects slippage above 20%', () => {
    expect(() =>
      quoteBuy({
        state: INITIAL_MARKET_STATE,
        side: 'A',
        grossInputUnits: 100_000_000n,
        slippageBps: 2_001n,
      }),
    ).toThrow(/slippage/)
  })
})
