import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Decimal, decimal, logPartition, pricesDecimal, cost, type MarketState } from '../src/index.js'

const WAD = decimal('1e18')

function toWad(value: InstanceType<typeof Decimal>): string {
  return value.mul(WAD).toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN).toFixed(0)
}

const expInputs = ['-40', '-20', '-5', '-1', '0']
const lnInputWads = ['1', '10000000000000000', '1000000000000000000', '98000000000000000000', '100000000000000000000']

const states: Array<{ id: string; state: MarketState }> = [
  {
    id: 'INITIAL',
    state: { qAWei: 0n, qBWei: 0n, reserveUnits: 0n },
  },
  {
    id: 'BUY_A_100',
    state: { qAWei: 9_724_569_143_406_335_335_127n, qBWei: 0n, reserveUnits: 0n },
  },
  {
    id: 'BUY_A_10000',
    state: { qAWei: 419_828_990_066_228_440_540_674n, qBWei: 0n, reserveUnits: 0n },
  },
  {
    id: 'MIXED_AFTER_TWO_BUYS',
    state: {
      qAWei: 419_828_990_066_228_440_540_674n,
      qBWei: 289_266_855_331_671_009_612_044n,
      reserveUnits: 0n,
    },
  },
  {
    id: 'BALANCED_30M',
    state: {
      qAWei: 30_000_000n * 10n ** 18n,
      qBWei: 30_000_000n * 10n ** 18n,
      reserveUnits: 0n,
    },
  },
  {
    id: 'SKEWED_30M',
    state: {
      qAWei: 30_000_000n * 10n ** 18n,
      qBWei: 0n,
      reserveUnits: 0n,
    },
  },
]

const vectors = {
  schemaVersion: 1,
  generatedBy: 'decimal.js with 80-digit precision and ROUND_HALF_EVEN',
  units: 'signed WAD unless a field says otherwise',
  fixedPointDomain: {
    expInputWad: '[-40e18, 0]',
    lnInputWad: '[1, 100e18]',
    note: 'XBID log-sum-exp normalizes every exponential input to a non-positive value.',
  },
  primitives: {
    exp: expInputs.map((input) => ({
      inputWad: toWad(decimal(input)),
      expectedWad: toWad(decimal(input).exp()),
    })),
    ln: lnInputWads.map((inputWad) => ({
      inputWad,
      expectedWad: toWad(decimal(inputWad).div(WAD).ln()),
    })),
  },
  lmsr: states.map(({ id, state }) => {
    const statePrices = pricesDecimal(state)
    return {
      id,
      qAWad: state.qAWei.toString(),
      qBWad: state.qBWei.toString(),
      expectedLogPartitionWad: toWad(logPartition(state)),
      expectedCostWad: toWad(cost(state)),
      expectedPriceAWad: toWad(statePrices.sideA),
      expectedPriceBWad: toWad(statePrices.sideB),
      expectedNeutralPriceWad: toWad(statePrices.neutral),
    }
  }),
}

const currentDirectory = dirname(fileURLToPath(import.meta.url))
const outputPath = resolve(currentDirectory, '../test-vectors/fixed-point-benchmark.v1.json')
await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, `${JSON.stringify(vectors, null, 2)}\n`, 'utf8')
process.stdout.write(`Wrote ${outputPath}\n`)
