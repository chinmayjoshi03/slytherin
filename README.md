# Slytherin DEX

> **The Stripe for DEX swaps.**  
> No frontend. No custody. Just an API.

[![Algorand](https://img.shields.io/badge/Algorand-Testnet-blue)](https://testnet.algoexplorer.io/application/758764386)
[![App ID](https://img.shields.io/badge/App%20ID-758764386-green)](https://testnet.algoexplorer.io/application/758764386)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

---

## What We Built

A fully on-chain AMM DEX on Algorand — with zero retail UI.

Instead of a swap interface, we built the **infrastructure layer** that *powers* swap interfaces. Any fintech app, neobank, UPI wallet, or trading platform can offer token swaps with a single API call. No DeFi knowledge required. No wallet integration. No frontend to maintain.

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

→ See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full system diagram and data-flow walkthrough.

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

→ Full reference: [docs/CONTRACTS.md](docs/CONTRACTS.md)

---

## Quick Start

```bash
git clone https://github.com/YOUR_ORG/slytherin.git
cd slytherin
npm install
cp .env.example .env
# Set DEPLOYER_MNEMONIC in .env

npm run deploy   # Deploy contract to testnet / localnet
npm run dev      # Start API server
```

API: `http://localhost:3000/api/v1`  
Dev UI: `http://localhost:3000/ui`

→ Full guide: [SETUP.md](SETUP.md)

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

### Webhooks — react to every trade

```bash
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

→ Full reference: [docs/API.md](docs/API.md)

---

## SDK

```bash
npm install slytherin-dex-sdk
```

```typescript
import { SlytherinDexClient } from 'slytherin-dex-sdk'

const dex = new SlytherinDexClient({ baseUrl: 'http://localhost:3000' })

const quote = await dex.getQuote('algo_to_b', 1_000_000, 50)
const { transactions } = await dex.executeSwap('YOUR_ADDRESS', 'algo_to_b', 1_000_000, 50)
// sign locally, then:
const result = await dex.submitSwap(signedTxns)
```

→ Full SDK docs: [slytherin-dex-sdk/README.md](slytherin-dex-sdk/README.md)

---

## Deployment

| | |
|---|---|
| Network | Algorand Testnet |
| App ID | `758764386` |
| Pool pair | ALGO / TestUSDC (TUSDC) |
| LP token | SLYDEX-LP (SDLP) |
| Fee | 0.3% (30 bps) |

Verify on explorer:
- [AlgoExplorer](https://testnet.algoexplorer.io/application/758764386)
- [Lora](https://lora.algokit.io/testnet/application/758764386)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Smart contract | Algorand TypeScript (PuyaTS) → TEAL |
| Contract tooling | AlgoKit, Puya compiler, ARC-4, ARC-56 |
| API server | Node.js + TypeScript + Express |
| Chain client | algosdk |
| Real-time | WebSocket (ws) |
| Auth | Wallet signature challenge + JWT |

---

## Documentation

| Document | Description |
|---|---|
| [SETUP.md](SETUP.md) | Local setup guide (testnet & localnet) |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, data flows, security |
| [docs/CONTRACTS.md](docs/CONTRACTS.md) | Smart contract methods, math, error codes |
| [docs/API.md](docs/API.md) | Full REST + WebSocket API reference |
| [slytherin-dex-sdk/README.md](slytherin-dex-sdk/README.md) | TypeScript SDK reference |

---

## The Market Opportunity

India's fintech ecosystem — UPI wallets, neobanks, trading platforms — wants to offer swap features. None of them want to build a DeFi frontend. They want to make an API call.

We built the API.

---

*Built for the Algorand Hackathon Series 3.*
