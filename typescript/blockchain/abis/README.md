# XBID ABI Snapshots

`MarketVault.v1.json`, `MarketVault.v2.json`, `SideToken.v1.json`, `FeeVault.v1.json`, `RiskController.v1.json`, `MarketRegistry.v1.json`, and `XBIDFactory.v1.json` are generated from commit-compatible Solidity artifacts in `xbidlive/xbid-contracts` with:

```bash
forge inspect MarketVault abi --json
forge inspect MarketVaultV2 abi --json
forge inspect SideToken abi --json
forge inspect FeeVault abi --json
forge inspect RiskController abi --json
forge inspect MarketRegistry abi --json
forge inspect XBIDFactory abi --json
```

Rules:

- Treat every deployed version snapshot as immutable. V1 remains available for historical Contest interaction; V2 adds `b = 150,000` without replacing it. `MarketVault.v3.json` is locked from contracts commit `50f40328c2c68346cab999f9b334dea02d63057a`, deployed on Robinhood Testnet at `0xe0aB88f7Ed432Cc93c975E09A8BFa305d6fA4abc`. V3 preserves the V2 ABI and economics (`abiVersion = 2`); its registration/default activation remains subject to Safe governance.
- Before a new version is deployed its snapshot may change only together with Solidity tests, protocol docs and a regenerated diff.
- Frontend and Indexer select ABI by the immutable `marketVersion` stored in the Append-only Registry.
- Fee claims and fee events select `FeeVault.v1.json` by immutable `feeVaultVersion`.
- Risk banners and transaction gating read `RiskController.v1.json` by immutable `riskControllerVersion` and the controller address bound to each Market Version.
- Version and Contest discovery use the non-upgradeable `MarketRegistry.v1.json`; its records are append-only.
- Contest creation and deterministic address prediction use `XBIDFactory.v1.json`. The Factory proxy may upgrade, so clients must also track its implementation upgrade events and supported ABI version.
- Application code must never call MarketVault or SideToken `initialize`; Clone creation and initialization belong exclusively to the Factory.
- `preview*` and transaction simulation remain the executable quote authority.
