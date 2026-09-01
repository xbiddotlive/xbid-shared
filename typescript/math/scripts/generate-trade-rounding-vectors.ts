import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DEFAULT_MARKET_CONFIG,
  INITIAL_MARKET_STATE,
  calculateTradingFee,
  quoteBuy,
  quoteFlip,
  quoteSell,
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

const minimumBuy = quoteBuy({
  state: INITIAL_MARKET_STATE,
  side: 'A',
  grossInputUnits: DEFAULT_MARKET_CONFIG.minimumBuyGrossUnits,
})
const nonDivisibleBuy = quoteBuy({
  state: INITIAL_MARKET_STATE,
  side: 'B',
  grossInputUnits: 1_000_001n,
})
const sellAll = quoteSell({
  state: minimumBuy.stateAfter,
  side: 'A',
  tokenInputWei: minimumBuy.tokenOutputWei,
  sellAll: true,
  walletBalanceWei: minimumBuy.tokenOutputWei,
})
const flipSourceBuy = quoteBuy({
  state: INITIAL_MARKET_STATE,
  side: 'A',
  grossInputUnits: 10_000_000_000n,
})
const atomicFlip = quoteFlip({
  state: flipSourceBuy.stateAfter,
  sourceSide: 'A',
  sourceTokenInputWei: flipSourceBuy.tokenOutputWei / 2n,
})

const vectors = {
  schemaVersion: 1,
  marketVersion: 1,
  settlementDecimals: 6,
  sideTokenDecimals: 18,
  integerRules: {
    requiredReserve: 'ceil(costWad / 1e12)',
    tradingFee: 'ceil(grossUnits * 100 / 10000)',
    buyTokenOutput: 'floor(canonical quantity delta to Side Token wei)',
    sellGrossOutput: 'floor(releasedCostWad / 1e12)',
    flipReserveDelta: '-feeUnits',
    solidityInverseGuard: 'retry with one fewer Settlement base unit only when fixed-point output exceeds WAD budget',
  },
  feeCeilExamples: [1n, 1_000_000n, 1_000_001n].map((grossUnits) => ({
    grossUnits,
    feeUnits: calculateTradingFee(grossUnits, DEFAULT_MARKET_CONFIG.tradingFeeBps),
  })),
  scenarios: [
    { id: 'MINIMUM_BUY_A', quote: minimumBuy },
    { id: 'NON_DIVISIBLE_FEE_BUY_B', quote: nonDivisibleBuy },
    { id: 'SELL_ALL_AFTER_MINIMUM_BUY', quote: sellAll },
    { id: 'ATOMIC_FLIP_HALF_POSITION', quote: atomicFlip },
  ],
}

const currentDirectory = dirname(fileURLToPath(import.meta.url))
const outputPath = resolve(currentDirectory, '../test-vectors/trade-rounding.v1.json')
await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, `${JSON.stringify(jsonSafe(vectors), null, 2)}\n`, 'utf8')
process.stdout.write(`Wrote ${outputPath}\n`)
