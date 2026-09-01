import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Decimal as DecimalType } from 'decimal.js'
import { decimal, decimalToString } from '../src/index.js'

const INITIAL_SIDE_PRICE = decimal('0.01')
const BASELINE_B = decimal('300000')
const CANDIDATE_B = decimal('270000')
const TRADING_FEE_RATE = decimal('0.01')
const TARGET_NET_INPUT = decimal('70000')
const TARGET_PRICE = decimal('0.30')

function priceAtNetInput(netCurveInput: DecimalType, b: DecimalType): DecimalType {
  return decimal(1).sub(
    decimal(1)
      .sub(INITIAL_SIDE_PRICE)
      .mul(netCurveInput.div(b).neg().exp()),
  )
}

function netInputToPrice(targetPrice: DecimalType, b: DecimalType): DecimalType {
  if (targetPrice.lte(INITIAL_SIDE_PRICE) || targetPrice.gte(1)) {
    throw new RangeError('target price must satisfy initialPrice < targetPrice < 1')
  }

  return b.mul(
    decimal(1)
      .sub(INITIAL_SIDE_PRICE)
      .div(decimal(1).sub(targetPrice))
      .ln(),
  )
}

function grossForNetCurveInput(netCurveInput: DecimalType): DecimalType {
  return netCurveInput.div(decimal(1).sub(TRADING_FEE_RATE))
}

function balancedSidePrice(reserve: DecimalType, b: DecimalType): DecimalType {
  return decimal('0.5').sub(decimal('0.49').mul(reserve.div(b).neg().exp()))
}

function dominanceTransition(
  reserve: DecimalType,
  startDominance: DecimalType,
  targetDominance: DecimalType,
  b: DecimalType,
) {
  const startingPartition = decimal(100).mul(reserve.div(b).exp())
  const totalSideWeight = startingPartition.sub(98)
  const fixedOpposingWeight = totalSideWeight.mul(decimal(1).sub(startDominance))
  const targetLeadingWeight = fixedOpposingWeight.mul(
    targetDominance.div(decimal(1).sub(targetDominance)),
  )
  const targetPartition = targetLeadingWeight.add(fixedOpposingWeight).add(98)
  const netCurveInput = b.mul(targetPartition.div(startingPartition).ln())

  return {
    netCurveInputUsdc: decimalToString(netCurveInput),
    grossInputUsdc: decimalToString(grossForNetCurveInput(netCurveInput)),
  }
}

function jsonSafe(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(jsonSafe)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, jsonSafe(nested)]),
    )
  }
  return value
}

const maximumBForTarget = TARGET_NET_INPUT.div(
  decimal(1)
    .sub(INITIAL_SIDE_PRICE)
    .div(decimal(1).sub(TARGET_PRICE))
    .ln(),
)

const candidatePriceAt70k = priceAtNetInput(TARGET_NET_INPUT, CANDIDATE_B)
if (candidatePriceAt70k.lte(INITIAL_SIDE_PRICE)) {
  throw new Error('candidate price must increase after positive net input')
}

const netCurveInputs = [
  100,
  500,
  1_000,
  5_000,
  10_000,
  20_000,
  50_000,
  70_000,
  100_000,
]
const targetPrices = [
  '0.02',
  '0.03',
  '0.05',
  '0.10',
  '0.20',
  '0.30',
  '0.40',
  '0.50',
  '0.70',
  '0.80',
  '0.90',
  '0.95',
]

const report = {
  schemaVersion: 1,
  status: 'testnet candidate; awaiting mainnet lock',
  model: 'standard fixed-b three-outcome LMSR',
  rationale:
    '270,000 is the provisional Testnet fixed-b selection. It preserves the standard LMSR and prioritizes balanced price feedback over the earlier 70K / 0.30 target.',
  parameters: {
    initialSidePrice: decimalToString(INITIAL_SIDE_PRICE),
    baselineB: decimalToString(BASELINE_B),
    selectedB: decimalToString(CANDIDATE_B),
    tradingFeeRate: decimalToString(TRADING_FEE_RATE),
    maximumBFor70kAt030: decimalToString(maximumBForTarget),
  },
  priceByNetCurveInput: netCurveInputs.map((amount) => ({
    netCurveInputUsdc: amount,
    grossInputUsdc: decimalToString(grossForNetCurveInput(decimal(amount))),
    baselineB300kPrice: decimalToString(priceAtNetInput(decimal(amount), BASELINE_B)),
    selectedB270kPrice: decimalToString(priceAtNetInput(decimal(amount), CANDIDATE_B)),
  })),
  capitalByTargetPrice: targetPrices.map((target) => {
    const targetPrice = decimal(target)
    const candidateNet = netInputToPrice(targetPrice, CANDIDATE_B)
    return {
      targetPrice: target,
      candidateNetUsdc: decimalToString(candidateNet),
      candidateGrossUsdc: decimalToString(grossForNetCurveInput(candidateNet)),
      baselineB300kNetUsdc: decimalToString(netInputToPrice(targetPrice, BASELINE_B)),
    }
  }),
  crownAt70kReserve: {
    baselineB300k: {
      balancedSidePrice: decimalToString(balancedSidePrice(TARGET_NET_INPUT, BASELINE_B)),
      challenger48To52: dominanceTransition(
        TARGET_NET_INPUT,
        decimal('0.48'),
        decimal('0.52'),
        BASELINE_B,
      ),
      incumbent52To55: dominanceTransition(
        TARGET_NET_INPUT,
        decimal('0.52'),
        decimal('0.55'),
        BASELINE_B,
      ),
    },
    selectedB270k: {
      balancedSidePrice: decimalToString(balancedSidePrice(TARGET_NET_INPUT, CANDIDATE_B)),
      challenger48To52: dominanceTransition(
        TARGET_NET_INPUT,
        decimal('0.48'),
        decimal('0.52'),
        CANDIDATE_B,
      ),
      incumbent52To55: dominanceTransition(
        TARGET_NET_INPUT,
        decimal('0.52'),
        decimal('0.55'),
        CANDIDATE_B,
      ),
    },
  },
  properties: {
    oneFixedBForEveryContest: true,
    usesExistingCostFunction: true,
    supportsExistingBuySellAndAtomicFlipMath: true,
    requiresNewCostFunction: false,
    marginalPriceSlope:
      'dP/dNetInput = (1 - P) / b; the absolute slope decreases as price rises.',
  },
}

const currentDirectory = dirname(fileURLToPath(import.meta.url))
const outputPath = resolve(currentDirectory, '../analysis/fixed-b-decision.v1.json')
await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, `${JSON.stringify(jsonSafe(report), null, 2)}\n`, 'utf8')

process.stdout.write(`Wrote ${outputPath}\n`)
