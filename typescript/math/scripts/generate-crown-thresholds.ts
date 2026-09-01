import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DEFAULT_MARKET_CONFIG,
  dominanceDifferenceExact,
  maximumDifferenceWeiStrictlyBelowDominance,
  minimumDifferenceWeiForDominance,
} from '../src/index.js'

const report = {
  schemaVersion: 1,
  status: 'generated from the canonical high-precision TypeScript model',
  b: DEFAULT_MARKET_CONFIG.b,
  sideTokenDecimals: DEFAULT_MARKET_CONFIG.sideTokenDecimals,
  formula: 'qSide - qOther = b * ln(dominance / (1 - dominance))',
  thresholds: {
    challengeOpen48: {
      comparison: 'qChallenger - qCrown >= minimumDifferenceWei',
      exactDifferenceTokens: dominanceDifferenceExact('0.48'),
      minimumDifferenceWei: minimumDifferenceWeiForDominance('0.48').toString(),
    },
    takeover52: {
      comparison: 'qChallenger - qCrown >= minimumDifferenceWei',
      exactDifferenceTokens: dominanceDifferenceExact('0.52'),
      minimumDifferenceWei: minimumDifferenceWeiForDominance('0.52').toString(),
    },
    defense55: {
      comparison: 'qCrown - qChallenger >= minimumDifferenceWei',
      exactDifferenceTokens: dominanceDifferenceExact('0.55'),
      minimumDifferenceWei: minimumDifferenceWeiForDominance('0.55').toString(),
    },
    resetStrictlyBelow45: {
      comparison: 'qChallenger - qCrown <= maximumDifferenceWei',
      exactDifferenceTokens: dominanceDifferenceExact('0.45'),
      maximumDifferenceWei:
        maximumDifferenceWeiStrictlyBelowDominance('0.45').toString(),
    },
  },
}

const currentDirectory = dirname(fileURLToPath(import.meta.url))
const outputPath = resolve(currentDirectory, '../test-vectors/crown-thresholds.v1.4.json')
await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

process.stdout.write(`Wrote ${outputPath}\n`)
