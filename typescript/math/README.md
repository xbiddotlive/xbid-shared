# @xbid/math

XBID 的 TypeScript 数学参考实现。它是前端报价、后端校验、Indexer 审计和 Solidity 测试向量的共同基准，不负责签名或发送链上交易。

## 已实现

- 稳定 `log-sum-exp` LMSR 成本函数；
- Side A / Side B / Neutral 实时价格；
- Dominance；
- BUY Gross/Fee/Net/Token Output；
- SELL Gross/Fee/Net；
- 原子 FLIP，按 Source SELL Gross 只收一次 Fee；
- 1% Fee 向上取整；
- 70/20/10 初始分配及动态 BPS 分配；
- 无 Referrer 时 Referrer Share 归 Protocol；
- 3% 默认 Slippage 和 20% 最大 Slippage；
- 1 USDC BUY、1 USDC SELL、50 USDC FLIP 门槛；
- Sell All 尾仓清理、Review 余额精确匹配与零 Net Output 拒绝；
- Crown 48% / 52% / 55% / 严格低于45%的有符号整数阈值；
- Reserve Buffer 和固定测试向量。
- Market Version 1 每侧 `30,000,000` Token 的 Quantity 上限。

## 单位

所有公开 Quote 接口使用整数 base units：

```text
Settlement Token：6 decimals
Side Token：18 decimals
Fee Split：BPS，分母 10,000
```

不要向 Quote API 传 JavaScript 浮点金额。

## 命令

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm vectors
pnpm vectors:fixed-point
pnpm vectors:lmsr-boundaries
pnpm thresholds
pnpm analyze
pnpm analyze:fixed-b
pnpm build
```

完整验证：

```bash
pnpm verify
```

## 示例

```ts
import { INITIAL_MARKET_STATE, quoteBuy } from '@xbid/math'

const quote = quoteBuy({
  state: INITIAL_MARKET_STATE,
  side: 'A',
  grossInputUnits: 100_000_000n, // 100 USDC
})

console.log({
  feeUnits: quote.feeUnits,
  curveInputUnits: quote.curveInputUnits,
  tokenOutputWei: quote.tokenOutputWei,
  minimumTokenOutputWei: quote.minimumTokenOutputWei,
})
```

## 重要边界

- TypeScript 模型使用 `decimal.js` 80 位精度；
- Settlement Token 和 Side Token 边界使用 `bigint`；
- Solidity 必须复现相同的舍入方向和测试向量；
- TypeScript 结果不能代替链上最终 Quote；
- 钱包确认前必须用相同参数调用目标 MarketVault 的 `preview*` 与 `simulateContract`；
- Solidity `ln/exp` 库确定后，必须对全部测试向量做差异测试；
- `marginalPriceChangeBps` 是交易前后边际价格变化，不等同于平均成交价偏离，UI 命名必须保持准确。

经济参数敏感性分析输出：

```text
analysis/economic-parameters.v1.4.json
analysis/fixed-b-decision.v1.json
test-vectors/crown-thresholds.v1.4.json
test-vectors/fixed-point-benchmark.v1.json
test-vectors/lmsr-boundaries.v1.json
```

第二个文件记录 Testnet 暂定 `b = 270,000` 及其与历史 `b = 300,000`
基线的对比；它不代表主网参数已经最终锁定。
