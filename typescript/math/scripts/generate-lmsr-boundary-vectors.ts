import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  Decimal,
  MAX_SIDE_QUANTITY_WEI,
  cost,
  decimal,
  logPartition,
  pricesDecimal,
  type MarketState,
} from '../src/index.js'

const WAD = decimal('1e18')

function toWad(value: InstanceType<typeof Decimal>): string {
  return value.mul(WAD).toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN).toFixed(0)
}

function summarize(id: string, qAWei: bigint, qBWei: bigint) {
  const state: MarketState = { qAWei, qBWei, reserveUnits: 0n }
  const statePrices = pricesDecimal(state)
  return {
    id,
    qAWei: qAWei.toString(),
    qBWei: qBWei.toString(),
    expectedLogPartitionWad: toWad(logPartition(state)),
    expectedCostWad: toWad(cost(state)),
    expectedPriceAWad: toWad(statePrices.sideA),
    expectedPriceBWad: toWad(statePrices.sideB),
    expectedNeutralPriceWad: toWad(statePrices.neutral),
  }
}

const vectors = {
  schemaVersion: 1,
  marketVersion: 1,
  generatedBy: 'decimal.js with 80-digit precision and ROUND_HALF_EVEN',
  constants: {
    wad: '1000000000000000000',
    bWad: '270000000000000000000000',
    maxSideQuantityWei: MAX_SIDE_QUANTITY_WEI.toString(),
    maxRatioWad: '111111111111111111111',
    ln98Wad: '4584967478670571920',
    canonicalLn100Wad: '4605170185988091368',
    soladyInitialLogPartitionWad: '4605170185988091367',
    soladyExpUnderflowAtOrBelowWad: '-41446531673892822313',
    normalizedExpInputRangeWad: ['-111111111111111111111', '0'],
    normalizedSumRangeWad: ['1000000000000000000', '3000000000000000000'],
  },
  validStates: [
    summarize('ORIGIN', 0n, 0n),
    summarize('SUB_WAD_PLATEAU', 425n, 0n),
    summarize('MAX_SKEW_A', MAX_SIDE_QUANTITY_WEI, 0n),
    summarize('MAX_BALANCED', MAX_SIDE_QUANTITY_WEI, MAX_SIDE_QUANTITY_WEI),
  ],
  invalidStates: [
    {
      id: 'A_ONE_WEI_ABOVE_MAX',
      qAWei: (MAX_SIDE_QUANTITY_WEI + 1n).toString(),
      qBWei: '0',
      expectedError: 'QuantityOutOfRange',
    },
    {
      id: 'B_ONE_WEI_ABOVE_MAX',
      qAWei: '0',
      qBWei: (MAX_SIDE_QUANTITY_WEI + 1n).toString(),
      expectedError: 'QuantityOutOfRange',
    },
  ],
}

const currentDirectory = dirname(fileURLToPath(import.meta.url))
const outputPath = resolve(currentDirectory, '../test-vectors/lmsr-boundaries.v1.json')
await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, `${JSON.stringify(vectors, null, 2)}\n`, 'utf8')
process.stdout.write(`Wrote ${outputPath}\n`)
