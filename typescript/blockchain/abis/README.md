# XBID ABI Snapshots

`MarketVault.v1.json`, `SideToken.v1.json`, `FeeVault.v1.json`, `RiskController.v1.json`, `MarketRegistry.v1.json`, and `XBIDFactory.v1.json` are generated from commit-compatible Solidity artifacts in `xbidlive/xbid-contracts` with:

```bash
forge inspect MarketVault abi --json
forge inspect SideToken abi --json
forge inspect FeeVault abi --json
forge inspect RiskController abi --json
forge inspect MarketRegistry abi --json
forge inspect XBIDFactory abi --json
```

Rules:

- Treat the `v1` files as immutable after Market Version 1 deployment.
- Before deployment they may change only together with Solidity tests, protocol docs and a regenerated diff.
- Frontend and Indexer select ABI by the immutable `marketVersion` stored in the Append-only Registry.
- Fee claims and fee events select `FeeVault.v1.json` by immutable `feeVaultVersion`.
- Risk banners and transaction gating read `RiskController.v1.json` by immutable `riskControllerVersion` and the controller address bound to each Market Version.
- Version and Contest discovery use the non-upgradeable `MarketRegistry.v1.json`; its records are append-only.
- Contest creation and deterministic address prediction use `XBIDFactory.v1.json`. The Factory proxy may upgrade, so clients must also track its implementation upgrade events and supported ABI version.
- Application code must never call MarketVault or SideToken `initialize`; Clone creation and initialization belong exclusively to the Factory.
- `preview*` and transaction simulation remain the executable quote authority.
