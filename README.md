# Slytherin DEX

> **The Stripe for DEX swaps.**  
> No frontend. No custody. Just an API.

---

## What We Built

A fully on-chain AMM DEX on Algorand — with zero retail UI.

Instead of a swap interface, we built the infrastructure layer that *powers* swap interfaces. Any fintech app, neobank, UPI wallet, or trading platform can offer token swaps with a single API call. No DeFi knowledge required. No wallet integration. No frontend to maintain.

```
Your App  ──►  POST /swap/execute  ──►  Algorand Testnet  ──►  Confirmed in 3.5s
```

---

## Why Algorand

| Property | Value |
|---|---|
| Finality | ~3.5 seconds |
| Transaction fee | ~0.001 ALGO (< $0.001) |
| Smart contract language | Algorand TypeScript (PuyaTS) |
| Deployed on | Testnet — App ID `758764386` |

Algorand's finality and fee structure are the only reason this is viable at production scale. On any other chain, the latency and gas costs make an API-first DEX impractical.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Your Application                      │
│         (UPI wallet / neobank / trading app)            │
└──────────────────────┬──────────────────────────────────┘
                       │  REST / WebSocket
┌──────────────────────▼──────────────────────────────────┐
│                   Slytherin API                          │
│                                                          │
│  POST /swap/execute   →  returns unsigned txn group      │
│  POST /swap/submit    →  broadcasts signed txns          │
│  GET  /market/price   →  live pool price                 │
│  WS   /ws             →  real-time trade stream          │
│  POST /webhooks       →  push events to your endpoint    │
└──────────────────────┬──────────────────────────────────┘
                       │  algosdk
┌──────────────────────▼──────────────────────────────────┐
│              AmmDex Smart Contract                       │
│         Algorand TypeScript (PuyaTS) → TEAL             │
│                                                          │
│  Constant-product AMM  (x · y = k)                      │
│  ALGO ⇄ TestUSDC (TUSDC)                                │
│  0.3% swap fee  ·  LP token: SDLP                       │
│  Slippage enforced on-chain                              │
└─────────────────────────────────────────────────────────┘
```

---

## The Non-Custodial Flow

We never see your private key. Ever.

```
1.  GET  /swap/quote          →  get expected output + slippage
2.  POST /swap/execute        →  receive unsigned transaction group
3.  [client signs locally]    →  wallet signs on user's device
4.  POST /swap/submit         →  broadcast signed group
5.  ✓   txId + confirmed round returned
```

The API builds the transaction. The user signs it. The chain settles it. That's the entire trust model.

---

## Slippage Protection

Enforced at two layers — neither can be bypassed independently.

**Off-chain (quote layer)**
```
GET /swap/quote?direction=algo_to_asset&amountIn=1000000&slippageBps=50
```
Returns `minOutput` calculated from current reserves with your slippage tolerance applied.

**On-chain (contract layer)**
```typescript
// AmmDex contract — swapAlgoForAsset()
assert(amountOut >= minOutput, 'SLIPPAGE_EXCEEDED')
```
The contract rejects any transaction where the actual output falls below `minOutput`. Front-running and sandwich attacks fail at the AVM level.

---

## Smart Contract

Written in **Algorand TypeScript (PuyaTS)**, compiled to TEAL by the Puya compiler.

```typescript
// Constant-product swap formula — mirrors Uniswap v2
private _computeOutput(amountIn: uint64, reserveIn: uint64, reserveOut: uint64): uint64 {
  const feeFactor: uint64 = SCALE - this.feeBps.value          // 10000 - 30 = 9970
  const amountInWithFee: uint64 = amountIn * feeFactor
  const numerator: uint64 = amountInWithFee * reserveOut
  const denominator: uint64 = reserveIn * SCALE + amountInWithFee
  return numerator / denominator
}
```

**On-chain methods:**

| Method | Description |
|---|---|
| `bootstrap(seed, assetB, feeBps)` | Initialize pool, create LP token |
| `addLiquidity(payAlgo, xferB)` | Deposit ALGO + TUSDC, receive SDLP |
| `removeLiquidity(lpXfer)` | Burn SDLP, receive proportional assets |
| `swapAlgoForAsset(pay, minOutput)` | ALGO → TUSDC with slippage guard |
| `swapAssetForAlgo(axfer, minOutput)` | TUSDC → ALGO with slippage guard |
| `getPrice()` | Read-only spot price |
| `setFee(newFeeBps)` | Governor-only fee update |

---

## API Reference

### Auth (wallet signature — no passwords)

```bash
# 1. Get a challenge
curl "http://localhost:3000/api/v1/health/auth/challenge?address=YOUR_ALGO_ADDRESS"

# 2. Sign the challenge with your wallet, then verify
curl -X POST "http://localhost:3000/api/v1/health/auth/verify" \
  -H "Content-Type: application/json" \
  -d '{"address":"YOUR_ALGO_ADDRESS","signature":"BASE64_SIGNATURE"}'

# Returns a JWT — use it in all mutating calls
```

### Market

```bash
curl "http://localhost:3000/api/v1/market/price"
curl "http://localhost:3000/api/v1/market/pool"
curl "http://localhost:3000/api/v1/market/reserves"
```

### Swap

```bash
# Quote first
curl "http://localhost:3000/api/v1/swap/quote?direction=algo_to_asset&amountIn=1000000&slippageBps=50"

# Execute — returns unsigned txn group
curl -X POST "http://localhost:3000/api/v1/swap/execute" \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"sender":"YOUR_ADDRESS","direction":"algo_to_asset","amountIn":"1000000","slippageBps":50}'

# Submit after signing
curl -X POST "http://localhost:3000/api/v1/swap/submit" \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"signedTxns":["BASE64_SIGNED_TXN_1","BASE64_SIGNED_TXN_2"]}'
```

### Liquidity

```bash
curl -X POST "http://localhost:3000/api/v1/liquidity/add" \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"sender":"YOUR_ADDRESS","amountAlgo":"1000000","amountB":"500000"}'

curl "http://localhost:3000/api/v1/liquidity/position/YOUR_ADDRESS"
```

### Webhooks — react to every trade

```bash
# Register your endpoint
curl -X POST "http://localhost:3000/api/v1/webhooks/register" \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-app.example/webhook",
    "events": ["swap_confirmed", "liquidity_changed", "price_update"]
  }'
```

Your server receives a POST for every matching event — no polling, no indexer queries.

### WebSocket — live price stream

```javascript
const ws = new WebSocket('ws://localhost:3000/ws')
ws.onmessage = (e) => console.log(JSON.parse(e.data))
// { type: "price_update", price: 0.482, reserveA: 10000000, reserveB: 4820000 }
```

---

## Run Locally

```bash
npm install
cp .env.example .env
# Set DEPLOYER_MNEMONIC and network config in .env

npm run deploy   # Deploy contract to localnet / testnet
npm run dev      # Start API server
```

API: `http://localhost:3000/api/v1`  
Dev UI: `http://localhost:3000/ui`

---

## Deployment

| | |
|---|---|
| Network | Algorand Testnet |
| App ID | `758764386` |
| Pool pair | ALGO / TestUSDC (TUSDC) |
| LP token | SLYDEX-LP (SDLP) |
| Fee | 0.3% (30 bps) |

Verify on explorer: `https://testnet.algoexplorer.io/application/758764386`

---

## Tech Stack

| Layer | Technology |
|---|---|
| Smart contract | Algorand TypeScript (PuyaTS) → TEAL |
| Contract tooling | AlgoKit, Puya compiler, ARC-4 |
| API server | Node.js + TypeScript + Express |
| Chain client | algosdk |
| Real-time | WebSocket (ws) |
| Auth | Wallet signature challenge + JWT |

---

## The Market Opportunity

India's fintech ecosystem — UPI wallets, neobanks, trading platforms — wants to offer swap features. None of them want to build a DeFi frontend. They want to make an API call.

We built the API.

---

*Built for the Algorand Hackathon Series 3.*
