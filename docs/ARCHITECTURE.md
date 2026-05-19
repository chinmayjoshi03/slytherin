# Architecture

> Slytherin DEX — API-first, non-custodial automated market maker on Algorand.

---

## System Overview

```
┌───────────────────────────────────────────────────────────────────┐
│                         Client Layer                              │
│                                                                   │
│   Any App (UPI wallet / neobank / trading platform)              │
│   slytherin-dex-sdk  ·  Direct REST  ·  WebSocket               │
└─────────────────────────────┬─────────────────────────────────────┘
                              │
                   REST  /  WebSocket
                              │
┌─────────────────────────────▼─────────────────────────────────────┐
│                        API Server                                 │
│                  Node.js + TypeScript + Express                   │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │  Swap Routes │  │ Market Routes│  │  Liquidity Routes    │   │
│  │  /swap/quote │  │ /market/price│  │  /liquidity/add      │   │
│  │  /swap/exec  │  │ /market/pool │  │  /liquidity/position │   │
│  │  /swap/submit│  │ /market/res  │  └──────────────────────┘   │
│  └──────────────┘  └──────────────┘                              │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ Auth (JWT)   │  │  Webhooks    │  │  WebSocket           │   │
│  │  Challenge + │  │  /register   │  │  /ws price stream    │   │
│  │  Verify      │  │  Fire events │  │  Real-time trades    │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                   AlgorandService (singleton)               │ │
│  │   algosdk · AmmDexClient (typed ARC-4 client)              │ │
│  │   Builds unsigned txn groups · Submits signed txns         │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────┬─────────────────────────────────────┘
                              │
                           algosdk
                              │
┌─────────────────────────────▼─────────────────────────────────────┐
│                  Algorand Blockchain (Testnet)                    │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                    AmmDex Smart Contract                    │ │
│  │          Algorand TypeScript (PuyaTS) → TEAL               │ │
│  │                  App ID: 758764386                          │ │
│  │                                                             │ │
│  │  bootstrap()     addLiquidity()    removeLiquidity()        │ │
│  │  swapAlgoForAsset()               swapAssetForAlgo()        │ │
│  │  getPrice()      getReserves()    setFee()                  │ │
│  │                                                             │ │
│  │  Global State:                                              │ │
│  │    asset_b (ASA)  ·  lp_token (ASA)  ·  governor (acct)   │ │
│  │    fee_bps (u64)  ·  reserve_a (u64) ·  reserve_b (u64)   │ │
│  │    total_lp (u64)                                           │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ALGO (native)  ⇄  TestUSDC / TUSDC (ASA)                       │
│  LP token: SLYDEX-LP / SDLP (minted by contract)               │
└───────────────────────────────────────────────────────────────────┘
```

---

## Design Principles

### 1. Non-Custodial by Design

The API server **never holds private keys** for end-users. The swap flow is:

```
1. GET  /swap/quote        →  server computes expected output
2. POST /swap/execute      →  server builds unsigned transaction group
3. [client signs locally]  →  wallet signs on user's device
4. POST /swap/submit       →  server broadcasts signed transactions
5. ✓   tx_id + confirmed round returned
```

The server can see a transaction it built, but cannot sign it for someone else.

### 2. Constant-Product AMM (x · y = k)

Mirrors the Uniswap v2 model. The invariant `reserveA × reserveB = k` is preserved after every swap. Swap output is computed as:

```
dy = (dx × feeFactor × reserveOut) / (reserveIn × SCALE + dx × feeFactor)
```

Where `feeFactor = SCALE - feeBps` (e.g. 10000 - 30 = 9970 for 0.3% fee).

### 3. Dual-Layer Slippage Protection

- **Off-chain quote layer**: `GET /swap/quote` returns `minOutput` based on current reserves and caller's `slippageBps`.
- **On-chain contract layer**: `swapAlgoForAsset()` and `swapAssetForAlgo()` both assert `amountOut >= minOutput`. The AVM rejects the transaction if this check fails — not the API, not the client — the **blockchain**.

This makes sandwich attacks and front-running fail at the consensus level.

---

## Codebase Map

```
slytherin/
├── smart_contracts/
│   ├── amm_dex/
│   │   ├── contract.algo.ts      # AmmDex contract (PuyaTS)
│   │   └── deploy-config.ts      # Bootstrap + liquidity seeding script
│   └── artifacts/
│       └── amm_dex/
│           ├── AmmDexClient.ts   # Auto-generated typed ARC-4 client
│           └── AmmDex.arc56.json # ARC-56 app spec
│
├── api/
│   ├── server.ts                 # Express app + HTTP server setup
│   ├── routes/
│   │   ├── swap.ts               # /swap/quote · /execute · /submit
│   │   ├── liquidity.ts          # /liquidity/add · /position/:addr
│   │   ├── market.ts             # /market/price · /pool · /reserves
│   │   ├── webhook.ts            # /webhooks/register · /list · /delete
│   │   └── health.ts             # /health · /auth/challenge · /auth/verify
│   ├── services/
│   │   ├── algorand.ts           # AlgorandService — algosdk wrapper
│   │   └── webhook.ts            # WebhookService — event registry + delivery
│   ├── middleware/
│   │   ├── auth.ts               # JWT verification middleware
│   │   └── rateLimiter.ts        # Per-route rate limits (express-rate-limit)
│   └── ws/
│       └── priceStream.ts        # WebSocket server — live price broadcast
│
├── slytherin-dex-sdk/
│   ├── src/
│   │   ├── client.ts             # SlytherinDexClient class
│   │   ├── types.ts              # All request/response TypeScript types
│   │   └── index.ts              # Public exports
│   └── demo/                     # Standalone Vite demo app
│
├── scripts/
│   ├── deploy.ts                 # npm run deploy entry point
│   └── webhook-receiver.ts       # Local webhook test server
│
├── cli/
│   └── index.ts                  # Interactive CLI (commander)
│
├── ui/                           # Served at /ui
│   ├── index.html
│   ├── style.css
│   └── app.js
│
├── SETUP.md                      # Local setup guide
├── docs/
│   ├── ARCHITECTURE.md           # This file
│   ├── CONTRACTS.md              # Smart contract reference
│   └── API.md                    # REST + WebSocket API reference
└── README.md                     # Project overview
```

---

## Data Flow: Swap

```
Client                    API Server                   Algorand
  │                           │                           │
  │─── GET /swap/quote ───────►│                           │
  │                           │── getApplicationByID ─────►│
  │                           │◄── global state ───────────│
  │                           │   (reserveA, reserveB, feeBps)
  │◄── { amountOut, minOutput }│                           │
  │                           │                           │
  │─── POST /swap/execute ────►│                           │
  │   (sender, direction, ...)│── suggestParams ──────────►│
  │                           │◄── sp ─────────────────────│
  │                           │   (builds txn group)       │
  │◄── { transactions[] } ────│                           │
  │                           │                           │
  │   [sign locally]          │                           │
  │                           │                           │
  │─── POST /swap/submit ─────►│                           │
  │   (signedTxns[])          │── sendRawTransaction ─────►│
  │                           │◄── txId ───────────────────│
  │                           │── waitForConfirmation ─────►│
  │                           │◄── confirmedRound ──────────│
  │◄── { txId, confirmedRound}│                           │
  │                           │── fireWebhookEvent ────────►│ (HTTP POST to registered URLs)
```

---

## Security Considerations

| Concern | Mitigation |
|---------|-----------|
| Private key exposure | Server never touches user keys |
| Slippage / front-running | On-chain `minOutput` assertion in AVM |
| API abuse | Rate limiting (express-rate-limit) per route |
| Unauth writes | JWT required on all mutating endpoints |
| Webhook spoofing | HMAC-SHA256 signature on each delivery |
| CSP | Helmet middleware with restrictive policy |

---

## Deployment

| Environment | AlgoNode endpoint | App ID |
|-------------|-------------------|--------|
| Testnet | `testnet-api.algonode.cloud` | `758764386` |
| LocalNet | `localhost:4001` | auto-assigned by AlgoKit |

See [SETUP.md](../SETUP.md) for deployment instructions.
