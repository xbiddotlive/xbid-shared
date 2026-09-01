import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DEFAULT_MARKET_CONFIG,
  INITIAL_FEE_SPLIT,
  INITIAL_MARKET_STATE,
  cost,
  decimalToString,
  dominance,
  prices,
  quoteBuy,
  quoteFlip,
  quoteSell,
  reserveBuffer,
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

function stateSummary(state: typeof INITIAL_MARKET_STATE) {
  return {
    ...state,
    cost: decimalToString(cost(state)),
    reserveBuffer: decimalToString(reserveBuffer(state)),
    prices: prices(state),
    dominance: dominance(state),
  }
}

const buyA100 = quoteBuy({
  state: INITIAL_MARKET_STATE,
  side: 'A',
  grossInputUnits: 100_000_000n,
})

const buyA10k = quoteBuy({
  state: INITIAL_MARKET_STATE,
  side: 'A',
  grossInputUnits: 10_000_000_000n,
})

const buyB5k = quoteBuy({
  state: buyA10k.stateAfter,
  side: 'B',
  grossInputUnits: 5_000_000_000n,
})

const sellAQuarter = quoteSell({
  state: buyB5k.stateAfter,
  side: 'A',
  tokenInputWei: buyB5k.stateAfter.qAWei / 4n,
})

const flipAHalf = quoteFlip({
  state: buyA10k.stateAfter,
  sourceSide: 'A',
  sourceTokenInputWei: buyA10k.tokenOutputWei / 2n,
})

const vectors = {
  schemaVersion: 1,
  productBaseline: 'v1.4 + product overrides through 2026-08-31',
  units: {
    settlementToken: 'base units, 6 decimals',
    sideToken: 'wei, 18 decimals',
    pricesAndDominance: 'decimal strings',
  },
  config: DEFAULT_MARKET_CONFIG,
  initialFeeSplit: INITIAL_FEE_SPLIT,
  scenarios: [
    {
      id: 'INITIAL_STATE',
      result: stateSummary(INITIAL_MARKET_STATE),
    },
    {
      id: 'BUY_A_100_GROSS',
      quote: buyA100,
    },
    {
      id: 'BUY_A_10000_GROSS',
      quote: buyA10k,
    },
    {
      id: 'BUY_B_5000_AFTER_BUY_A_10000',
      quote: buyB5k,
    },
    {
      id: 'SELL_A_QUARTER_AFTER_TWO_BUYS',
      quote: sellAQuarter,
    },
    {
      id: 'ATOMIC_FLIP_HALF_A_AFTER_BUY_A_10000',
      quote: flipAHalf,
    },
  ],
}

const currentDirectory = dirname(fileURLToPath(import.meta.url))
const outputPath = resolve(currentDirectory, '../test-vectors/v1.4.json')
await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, `${JSON.stringify(jsonSafe(vectors), null, 2)}\n`, 'utf8')

process.stdout.write(`Wrote ${outputPath}\n`)
