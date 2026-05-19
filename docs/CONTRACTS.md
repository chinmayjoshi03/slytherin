# Smart Contract Reference

> `AmmDex` — Constant-Product AMM deployed on Algorand Testnet  
> App ID: **758764386** · Written in Algorand TypeScript (PuyaTS) · Compiled to TEAL by Puya

---

## Source

[`smart_contracts/amm_dex/contract.algo.ts`](../smart_contracts/amm_dex/contract.algo.ts)

---

## Overview

`AmmDex` implements a standard constant-product AMM (x · y = k), pairing **ALGO** (native currency) against any **Algorand Standard Asset (ASA)**. In the testnet deployment, the paired asset is **TestUSDC (TUSDC)**.

### Key constants

| Name | Value | Purpose |
|------|-------|---------|
| `SCALE` | `10_000` | Fixed-point scale for fee math |
| `MIN_LIQUIDITY` | `1_000` | Locked permanently on first deposit (prevents zero-LP attacks) |

### Global state keys

| Key | Type | Description |
|-----|------|-------------|
| `asset_b` | `Asset` | The paired ASA (TestUSDC) |
| `lp_token` | `Asset` | LP token ASA created by the contract |
| `governor` | `Account` | Only account that can call `setFee` |
| `fee_bps` | `uint64` | Swap fee in basis points (default 30 = 0.3%) |
| `reserve_a` | `uint64` | ALGO held in pool (microALGOs) |
| `reserve_b` | `uint64` | Asset B held in pool (base units) |
| `total_lp` | `uint64` | Total LP tokens in circulation |

---

## ABI Methods

### `bootstrap(seed, assetB, feeBps) → Asset`

Initialises the pool for the first and only time.

**Requires:**
- A payment transaction (`seed`) of at least 300,000 microALGO to the application address, to cover MBR for creating the LP token ASA and opting into `assetB`.
- The pool must not already be bootstrapped (`lp_token` state must be absent).

**Actions:**
1. Validates inputs.
2. Creates the `SLYDEX-LP` (`SDLP`) ASA via inner transaction.
3. Opts the contract into `assetB` via inner transaction.
4. Sets `governor` to `Txn.sender`.

**Returns:** The created LP token `Asset`.

**Inner transactions:** 2 (asset create + asset opt-in) — pass `extraFee: 2000 µALGO`.

```typescript
bootstrap(
  seed:    gtxn.PaymentTxn,   // payment to app addr, amount >= 300_000 µALGO
  assetB:  Asset,             // ASA to pair with ALGO
  feeBps:  uint64             // fee in bps (e.g. 30 = 0.3%), must be < 10_000
): Asset
```

---

### `addLiquidity(payAlgo, xferB) → uint64`

Deposits ALGO + asset B into the pool and mints LP tokens to the sender.

**Formula:**
- **First deposit:** `LP = sqrt(amountA × amountB) − MIN_LIQUIDITY`
- **Subsequent:** `LP = min(amountA × totalLP / reserveA, amountB × totalLP / reserveB)`

**Requires:**
- `payAlgo`: payment to application address.
- `xferB`: asset transfer of `assetB` to application address.

**Returns:** Amount of LP tokens minted.

**Inner transactions:** 1 (send LP tokens to sender) — pass `extraFee: 1000 µALGO`.

```typescript
addLiquidity(
  payAlgo: gtxn.PaymentTxn,         // ALGO deposit
  xferB:   gtxn.AssetTransferTxn    // Token B deposit
): uint64
```

---

### `removeLiquidity(lpXfer) → void`

Burns LP tokens and returns proportional ALGO + asset B to the sender.

**Formula:**
```
outA = lpAmount × reserveA / totalLP
outB = lpAmount × reserveB / totalLP
```

**Requires:**
- `lpXfer`: asset transfer of the LP token to the application address.
- `lpAmount` must be > 0 and < `totalLP` (the permanently locked minimum cannot be removed).

**Inner transactions:** 3 (burn LP + send ALGO + send asset B) — pass `extraFee: 3000 µALGO`.

```typescript
removeLiquidity(
  lpXfer: gtxn.AssetTransferTxn    // LP token to burn
): void
```

---

### `swapAlgoForAsset(payAlgo, minOutput) → uint64`

Swaps ALGO for asset B.

**On-chain slippage guard:** Asserts `amountOut >= minOutput`. Reverts if not met.

**Inner transactions:** 1 (send asset B to sender) — pass `extraFee: 1000 µALGO`.

```typescript
swapAlgoForAsset(
  payAlgo:   gtxn.PaymentTxn,  // ALGO payment to app address
  minOutput: uint64            // minimum acceptable asset B out
): uint64
```

---

### `swapAssetForAlgo(xferB, minOutput) → uint64`

Swaps asset B for ALGO.

**On-chain slippage guard:** Asserts `amountOut >= minOutput`. Reverts if not met.

**Inner transactions:** 1 (send ALGO to sender) — pass `extraFee: 1000 µALGO`.

```typescript
swapAssetForAlgo(
  xferB:     gtxn.AssetTransferTxn,  // asset B transfer to app address
  minOutput: uint64                  // minimum acceptable ALGO out
): uint64
```

---

### `getPrice() → uint64` _(readonly)_

Returns the spot price of ALGO in asset B units, scaled by 1,000,000.

```
price = reserveB × 1_000_000 / reserveA
```

Example: if `reserveA = 10_000_000 µALGO` and `reserveB = 5_000_000 µTUSDC`, then `getPrice()` returns `500_000` (= 0.5 TUSDC per ALGO).

```typescript
getPrice(): uint64
```

---

### `getReserveA() → uint64` _(readonly)_

Current ALGO reserve (microALGOs).

---

### `getReserveB() → uint64` _(readonly)_

Current asset B reserve (base units).

---

### `getTotalLp() → uint64` _(readonly)_

Total LP tokens in circulation (including the permanently locked `MIN_LIQUIDITY`).

---

### `getFeeBps() → uint64` _(readonly)_

Current swap fee in basis points.

---

### `getReserves() → [uint64, uint64]` _(readonly)_

Returns `[reserveA, reserveB]` as a tuple. Convenience method.

---

### `swap(direction, amountIn, minAmountOut) → uint64` _(readonly)_

Read-only simulation of a swap. Does **not** mutate state, does **not** execute inner transactions. Useful for quotes.

| `direction` | Meaning |
|-------------|---------|
| `0` | ALGO → asset B |
| `1` | asset B → ALGO |

Returns expected `amountOut`. Asserts `amountOut >= minAmountOut`.

```typescript
swap(
  direction:    uint64,
  amountIn:     uint64,
  minAmountOut: uint64
): uint64
```

---

### `addLiquidityPreview(amountAlgo, amountAsset) → uint64` _(readonly)_

Simulates LP minting without executing. Returns expected LP tokens.

---

### `removeLiquidityPreview(lpAmount) → [uint64, uint64]` _(readonly)_

Simulates LP burn without executing. Returns `[expectedAlgo, expectedAssetB]`.

---

### `setFee(newFeeBps) → void`

Updates the swap fee. **Governor only.**

```typescript
setFee(newFeeBps: uint64): void    // must be < 10_000
```

---

## Core Math

### Swap output formula

```
feeFactor       = SCALE − feeBps          // e.g. 10000 − 30 = 9970
amountInWithFee = amountIn × feeFactor
numerator       = amountInWithFee × reserveOut
denominator     = reserveIn × SCALE + amountInWithFee
amountOut       = numerator / denominator
```

This is the standard Uniswap v2 formula with a fixed-point fee factor to avoid floating-point arithmetic in AVM.

### LP minting (first deposit)

```
lpToMint = sqrt(amountA × amountB) − MIN_LIQUIDITY
```

`MIN_LIQUIDITY` (1,000) is permanently locked in the contract, preventing a zero-LP-supply attack that could manipulate prices.

### LP minting (subsequent deposits)

```
lpFromA  = amountA × totalLP / reserveA
lpFromB  = amountB × totalLP / reserveB
lpToMint = min(lpFromA, lpFromB)
```

Taking the minimum ensures LPs cannot profit by depositing unbalanced amounts.

---

## Error Codes

| Code | Method | Meaning |
|------|--------|---------|
| `ALREADY_BOOTSTRAPPED` | `bootstrap` | Pool already initialised |
| `FEE_TOO_HIGH` | `bootstrap`, `setFee` | `feeBps >= 10_000` |
| `BAD_SEED_RECEIVER` | `bootstrap` | Seed payment not sent to app address |
| `SEED_TOO_LOW` | `bootstrap` | Seed < 300,000 µALGO |
| `NOT_BOOTSTRAPPED` | swap/liquidity methods | `bootstrap` was not called |
| `BAD_ALGO_RECEIVER` | `addLiquidity` | ALGO payment not sent to app address |
| `BAD_ASSET_RECEIVER` | `addLiquidity`, `swapAlgoForAsset` | Asset transfer not sent to app address |
| `WRONG_ASSET` | `addLiquidity`, `swapAssetForAlgo` | Wrong ASA sent |
| `INITIAL_LIQUIDITY_TOO_LOW` | `addLiquidity` | First deposit too small (sqrt < MIN_LIQUIDITY) |
| `ZERO_LP_MINT` | `addLiquidity` | Computed LP tokens = 0 |
| `WRONG_LP_TOKEN` | `removeLiquidity` | Wrong ASA sent as LP token |
| `BAD_LP_RECEIVER` | `removeLiquidity` | LP transfer not sent to app address |
| `ZERO_LP_BURN` | `removeLiquidity` | Attempted to burn 0 LP tokens |
| `INSUFFICIENT_LP` | `removeLiquidity` | Tried to burn ≥ `totalLP` |
| `ZERO_ALGO_OUT` | `removeLiquidity` | Computed ALGO output = 0 |
| `ZERO_ASSET_OUT` | `removeLiquidity` | Computed asset B output = 0 |
| `BAD_RECEIVER` | swap methods | Txn not sent to app address |
| `ZERO_INPUT` | swap methods | `amountIn` = 0 |
| `SLIPPAGE_EXCEEDED` | swap methods | `amountOut < minOutput` |
| `INSUFFICIENT_RESERVES` | swap methods | Output would exceed reserves |
| `NOT_GOVERNOR` | `setFee` | Caller is not the governor |
| `NO_RESERVES` | `getPrice` | `reserveA` = 0 |
| `NO_LP_SUPPLY` | `removeLiquidityPreview` | `totalLP` = 0 |

---

## Transaction Group Structure

### swapAlgoForAsset (3 transactions)

| Index | Type | Description |
|-------|------|-------------|
| 0 | `pay` | ALGO payment to app address (user-signed) |
| 1 | `appl` | `swapAlgoForAsset(pay=gtxn[0], minOutput=N)` call (user-signed) |
| — | `axfer` _(inner)_ | App sends asset B to user |

### swapAssetForAlgo (3 transactions)

| Index | Type | Description |
|-------|------|-------------|
| 0 | `axfer` | Asset B transfer to app address (user-signed) |
| 1 | `appl` | `swapAssetForAlgo(xferB=gtxn[0], minOutput=N)` call (user-signed) |
| — | `pay` _(inner)_ | App sends ALGO to user |

### addLiquidity (3 transactions)

| Index | Type | Description |
|-------|------|-------------|
| 0 | `pay` | ALGO payment to app address |
| 1 | `axfer` | Asset B transfer to app address |
| 2 | `appl` | `addLiquidity(payAlgo=gtxn[0], xferB=gtxn[1])` call |
| — | `axfer` _(inner)_ | App sends LP tokens to user |

---

## ARC Standards

- **ARC-4**: All public methods follow ARC-4 ABI encoding. The contract is compiled with `arc4.Contract` as the base class.
- **ARC-56**: An `AmmDex.arc56.json` app spec is auto-generated by `algokit generate client` at build time and stored in `smart_contracts/artifacts/amm_dex/`.
- **ARC-32**: Backwards-compatible app spec also generated.

The typed TypeScript client (`AmmDexClient.ts`) is auto-generated from the ARC-56 spec and used by `AlgorandService`.

---

## Explorer

View the deployed contract on Algorand Testnet:

- AlgoExplorer: `https://testnet.algoexplorer.io/application/758764386`
- Lora: `https://lora.algokit.io/testnet/application/758764386`
