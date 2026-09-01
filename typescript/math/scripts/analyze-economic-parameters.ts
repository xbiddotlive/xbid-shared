import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Decimal as DecimalType } from 'decimal.js'
import {
  DEFAULT_MARKET_CONFIG,
  INITIAL_FEE_SPLIT,
  INITIAL_MARKET_STATE,
  Decimal,
  allocateFee,
  calculateTradingFee,
  cost,
  decimal,
  decimalToString,
  decimalToUnitsFloor,
  dominance,
  pow10,
  prices,
  quoteBuy,
  quoteSell,
  reserveBuffer,
  type MarketConfig,
  type MarketState,
} from '../src/index.js'

function jsonSafe(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString()
  if (Array.isArray(value)) return value.map(jsonSafe)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, jsonSafe(nested)]),
    )
  }
  return value
}

function configWithB(b: number): MarketConfig {
  return { ...DEFAULT_MARKET_CONFIG, b: b.toString() }
}

function settlementUnits(usdc: number, config = DEFAULT_MARKET_CONFIG): bigint {
  return decimalToUnitsFloor(decimal(usdc), config.settlementDecimals)
}

function decimalToUnitsCeil(value: DecimalType, decimals: number): bigint {
  if (value.isNegative()) throw new RangeError('cannot convert negative value')
  return BigInt(
    value
      .mul(pow10(decimals).toString())
      .toDecimalPlaces(0, Decimal.ROUND_CEIL)
      .toFixed(0),
  )
}

function grossForCurveInput(targetCurveUnits: bigint, config: MarketConfig): bigint {
  const netBps = config.bpsDenominator - config.tradingFeeBps
  let candidate =
    (targetCurveUnits * config.bpsDenominator + netBps - 1n) / netBps

  for (let offset = -4n; offset <= 4n; offset += 1n) {
    const gross = candidate + offset
    if (gross <= 0n) continue
    const fee = calculateTradingFee(
      gross,
      config.tradingFeeBps,
      config.bpsDenominator,
    )
    if (gross - fee === targetCurveUnits) return gross
  }

  while (
    candidate -
      calculateTradingFee(candidate, config.tradingFeeBps, config.bpsDenominator) <
    targetCurveUnits
  ) {
    candidate += 1n
  }
  return candidate
}

function oneSidedNetBuy(netUsdc: number, config: MarketConfig) {
  const targetCurveUnits = settlementUnits(netUsdc, config)
  const grossUnits = grossForCurveInput(targetCurveUnits, config)
  const quote = quoteBuy({
    state: INITIAL_MARKET_STATE,
    side: 'A',
    grossInputUnits: grossUnits,
    config,
  })

  return {
    netCurveUsdc: netUsdc,
    grossInputUnits: grossUnits,
    feeUnits: quote.feeUnits,
    tokenOutputWei: quote.tokenOutputWei,
    sideAPrice: quote.pricesAfter.sideA,
    sideBPrice: quote.pricesAfter.sideB,
    neutralPrice: quote.pricesAfter.neutral,
    sideADominance: quote.dominanceAfter.sideA,
    marginalPriceChangeBps: quote.marginalPriceChangeBps,
    averageExecutionPrice: quote.averageExecutionPrice,
  }
}

function balancedStateAtReserve(reserveUsdc: number, config: MarketConfig): MarketState {
  const b = decimal(config.b)
  const targetCost = decimal(reserveUsdc)
  const targetPartition = decimal(100).mul(targetCost.div(b).exp())
  const sideWeight = targetPartition.sub(98).div(2)
  const sideQuantity = b.mul(sideWeight.ln())
  const sideQuantityWei = decimalToUnitsFloor(sideQuantity, config.sideTokenDecimals)

  return {
    qAWei: sideQuantityWei,
    qBWei: sideQuantityWei,
    reserveUnits: settlementUnits(reserveUsdc, config),
  }
}

function stateAtReserveAndDominance(
  reserveUsdc: number,
  sideADominance: number,
  config: MarketConfig,
): MarketState {
  const b = decimal(config.b)
  const targetCost = decimal(reserveUsdc)
  const targetPartition = decimal(100).mul(targetCost.div(b).exp())
  const dominanceA = decimal(sideADominance)
  const weightRatio = dominanceA.div(decimal(1).sub(dominanceA))
  const sideBWeight = targetPartition.sub(98).div(weightRatio.add(1))
  const sideAWeight = sideBWeight.mul(weightRatio)

  return {
    qAWei: decimalToUnitsFloor(b.mul(sideAWeight.ln()), config.sideTokenDecimals),
    qBWei: decimalToUnitsFloor(b.mul(sideBWeight.ln()), config.sideTokenDecimals),
    reserveUnits: settlementUnits(reserveUsdc, config),
  }
}

function swapSides(state: MarketState): MarketState {
  return {
    qAWei: state.qBWei,
    qBWei: state.qAWei,
    reserveUnits: state.reserveUnits,
  }
}

function capitalToDominance(
  state: MarketState,
  targetDominance: number,
  config: MarketConfig,
) {
  const b = decimal(config.b)
  const qB = decimal(state.qBWei.toString()).div(pow10(config.sideTokenDecimals).toString())
  const target = decimal(targetDominance)
  const requiredDifference = b.mul(target.div(decimal(1).sub(target)).ln())
  const targetQA = qB.add(requiredDifference)
  const targetQAWei = decimalToUnitsCeil(targetQA, config.sideTokenDecimals)
  const targetState: MarketState = {
    qAWei: targetQAWei,
    qBWei: state.qBWei,
    reserveUnits: state.reserveUnits,
  }
  const requiredCurveInput = cost(targetState, config).sub(cost(state, config))
  const requiredCurveInputUnits = decimalToUnitsCeil(
    requiredCurveInput,
    config.settlementDecimals,
  )
  const requiredGrossUnits = grossForCurveInput(requiredCurveInputUnits, config)

  return {
    targetDominance,
    curveInputUnits: requiredCurveInputUnits,
    grossInputUnits: requiredGrossUnits,
    tradingFeeUnits:
      requiredGrossUnits - requiredCurveInputUnits,
    targetState: {
      ...targetState,
      reserveUnits: state.reserveUnits + requiredCurveInputUnits,
    },
    achievedDominance: dominance(
      { ...targetState, reserveUnits: state.reserveUnits + requiredCurveInputUnits },
      config,
    ).sideA,
  }
}

function netCurveInputForMarginalPriceChange(
  targetBps: number,
  config: MarketConfig,
): bigint {
  let low = config.minimumBuyGrossUnits
  let high = settlementUnits(200_000, config)

  while (low < high) {
    const mid = (low + high) / 2n
    const gross = grossForCurveInput(mid, config)
    const quote = quoteBuy({
      state: INITIAL_MARKET_STATE,
      side: 'A',
      grossInputUnits: gross,
      config,
    })
    if (quote.marginalPriceChangeBps >= targetBps) high = mid
    else low = mid + 1n
  }
  return low
}

function roundTrip(grossBuyUsdc: number, config: MarketConfig) {
  const buy = quoteBuy({
    state: INITIAL_MARKET_STATE,
    side: 'A',
    grossInputUnits: settlementUnits(grossBuyUsdc, config),
    config,
  })
  const sell = quoteSell({
    state: buy.stateAfter,
    side: 'A',
    tokenInputWei: buy.tokenOutputWei,
    sellAll: true,
    walletBalanceWei: buy.tokenOutputWei,
    config,
  })
  const spent = settlementUnits(grossBuyUsdc, config)
  const loss = spent - sell.netOutputUnits

  return {
    grossBuyUsdc,
    buyFeeUnits: buy.feeUnits,
    sellGrossUnits: sell.grossOutputUnits,
    sellFeeUnits: sell.feeUnits,
    finalReceivedUnits: sell.netOutputUnits,
    totalLossUnits: loss,
    lossBps: Number((loss * 10_000n) / spent),
    reserveRemainderUnits: sell.stateAfter.reserveUnits,
  }
}

function volumeRequiredForReserve(reserveUsdc: number, sellToBuyRatio: number) {
  const ratio = decimal(sellToBuyRatio)
  const buyVolume = decimal(reserveUsdc).div(decimal('0.99').sub(ratio))
  const sellVolume = buyVolume.mul(ratio)
  return {
    sellToBuyRatio,
    grossBuyVolume: decimalToString(buyVolume),
    grossSellVolume: decimalToString(sellVolume),
    totalGrossVolume: decimalToString(buyVolume.add(sellVolume)),
  }
}

function feeRevenue(totalVolumeUsdc: number, hasReferrer: boolean) {
  const volumeUnits = settlementUnits(totalVolumeUsdc)
  const feeUnits = calculateTradingFee(
    volumeUnits,
    DEFAULT_MARKET_CONFIG.tradingFeeBps,
    DEFAULT_MARKET_CONFIG.bpsDenominator,
  )
  return {
    totalVolumeUsdc,
    hasReferrer,
    totalFeeUnits: feeUnits,
    allocation: allocateFee(feeUnits, INITIAL_FEE_SPLIT, hasReferrer),
  }
}

const bValues = [100_000, 200_000, 270_000, 300_000, 400_000, 500_000]
const netBuyAmounts = [100, 500, 1_000, 5_000, 10_000, 50_000, 70_000]
const lockedConfig = DEFAULT_MARKET_CONFIG
const balanced70k = balancedStateAtReserve(70_000, lockedConfig)
const balanced100k = balancedStateAtReserve(100_000, lockedConfig)
const challenger48At70k = stateAtReserveAndDominance(70_000, 0.48, lockedConfig)
const challenger48At100k = stateAtReserveAndDominance(100_000, 0.48, lockedConfig)

const report = {
  schemaVersion: 1,
  productBaseline: 'v1.4 + product overrides through 2026-08-31',
  generatedForDate: '2026-09-01',
  units: {
    settlement: 'base units, 6 decimals unless a field ends in Usdc',
    sideToken: 'wei, 18 decimals',
    percentages: 'decimal ratios or BPS as named',
  },
  testnetParameters: lockedConfig,
  bSensitivity: bValues.map((b) => ({
    b,
    oneSidedNetBuys: netBuyAmounts.map((amount) => oneSidedNetBuy(amount, configWithB(b))),
  })),
  testnetCurve: netBuyAmounts.map((amount) => oneSidedNetBuy(amount, lockedConfig)),
  balancedReserveStates: [
    {
      reserveUsdc: 70_000,
      state: balanced70k,
      cost: decimalToString(cost(balanced70k, lockedConfig)),
      reserveBuffer: decimalToString(reserveBuffer(balanced70k, lockedConfig)),
      prices: prices(balanced70k, lockedConfig),
      dominance: dominance(balanced70k, lockedConfig),
    },
    {
      reserveUsdc: 100_000,
      state: balanced100k,
      cost: decimalToString(cost(balanced100k, lockedConfig)),
      reserveBuffer: decimalToString(reserveBuffer(balanced100k, lockedConfig)),
      prices: prices(balanced100k, lockedConfig),
      dominance: dominance(balanced100k, lockedConfig),
    },
  ],
  dominanceCapital: {
    fromInitial: [0.52, 0.55].map((target) =>
      capitalToDominance(INITIAL_MARKET_STATE, target, lockedConfig),
    ),
    fromBalanced70k: [0.52, 0.55].map((target) =>
      capitalToDominance(balanced70k, target, lockedConfig),
    ),
    fromBalanced100k: [0.52, 0.55].map((target) =>
      capitalToDominance(balanced100k, target, lockedConfig),
    ),
    crownChallengeAt70k: {
      challengerStart: {
        state: challenger48At70k,
        dominance: dominance(challenger48At70k, lockedConfig),
      },
      challenger48To52: capitalToDominance(challenger48At70k, 0.52, lockedConfig),
      incumbent52To55: capitalToDominance(
        swapSides(challenger48At70k),
        0.55,
        lockedConfig,
      ),
    },
    crownChallengeAt100k: {
      challengerStart: {
        state: challenger48At100k,
        dominance: dominance(challenger48At100k, lockedConfig),
      },
      challenger48To52: capitalToDominance(challenger48At100k, 0.52, lockedConfig),
      incumbent52To55: capitalToDominance(
        swapSides(challenger48At100k),
        0.55,
        lockedConfig,
      ),
    },
  },
  initialOneSidedPriceImpactThresholds: [1_000, 3_000].map((targetBps) => {
    const netUnits = netCurveInputForMarginalPriceChange(targetBps, lockedConfig)
    return {
      targetBps,
      netCurveInputUnits: netUnits,
      grossInputUnits: grossForCurveInput(netUnits, lockedConfig),
    }
  }),
  minimumTradeEconomics: {
    buy: {
      grossUnits: lockedConfig.minimumBuyGrossUnits,
      feeUnits: calculateTradingFee(
        lockedConfig.minimumBuyGrossUnits,
        lockedConfig.tradingFeeBps,
      ),
    },
    sell: {
      grossUnits: lockedConfig.minimumSellGrossUnits,
      feeUnits: calculateTradingFee(
        lockedConfig.minimumSellGrossUnits,
        lockedConfig.tradingFeeBps,
      ),
    },
    flip: {
      sourceGrossUnits: lockedConfig.minimumFlipGrossUnits,
      feeUnits: calculateTradingFee(
        lockedConfig.minimumFlipGrossUnits,
        lockedConfig.tradingFeeBps,
      ),
    },
  },
  immediateRoundTrips: [1, 100, 1_000, 10_000].map((amount) =>
    roundTrip(amount, lockedConfig),
  ),
  reserve70kVolumeScenarios: [0, 0.25, 0.5, 0.7, 0.8].map((ratio) =>
    volumeRequiredForReserve(70_000, ratio),
  ),
  feeRevenueScenarios: [200_000, 400_000].flatMap((volume) => [
    feeRevenue(volume, true),
    feeRevenue(volume, false),
  ]),
}

const currentDirectory = dirname(fileURLToPath(import.meta.url))
const outputPath = resolve(currentDirectory, '../analysis/economic-parameters.v1.4.json')
await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, `${JSON.stringify(jsonSafe(report), null, 2)}\n`, 'utf8')

process.stdout.write(`Wrote ${outputPath}\n`)
