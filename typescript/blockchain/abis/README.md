# XBID ABI Snapshots

`MarketVault.v1.json` and `SideToken.v1.json` are generated from commit-compatible Solidity artifacts in `xbidlive/xbid-contracts` with:

```bash
forge inspect MarketVault abi --json
forge inspect SideToken abi --json
```

Rules:

- Treat the `v1` files as immutable after Market Version 1 deployment.
- Before deployment they may change only together with Solidity tests, protocol docs and a regenerated diff.
- Frontend and Indexer select ABI by the immutable `marketVersion` stored in the Append-only Registry.
- Application code must never call `initialize`; Clone creation and initialization belong to the future Factory.
- `preview*` and transaction simulation remain the executable quote authority.
