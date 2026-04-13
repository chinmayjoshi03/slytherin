# 🐍 Slytherin DEX — Frontendless Decentralized Exchange

A **headless, API-first Decentralized Exchange (DEX)** built on Algorand, designed exclusively for **programmatic interaction** — no UI required.

Fintech developers, trading bots, and B2B integrations can execute swaps, manage liquidity, and query market data entirely through **REST APIs**, **WebSocket streams**, and **CLI tooling**.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  API Consumers                       │
│   Trading Bots  │  Fintech Apps  │  CLI Tool         │
└────────┬────────┴───────┬────────┴──────┬────────────┘
         │                │               │
         ▼                ▼               ▼
┌─────────────────────────────────────────────────────┐
│              Express.js API Layer (:3000)            │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│  │ REST API │ │WebSocket │ │  Wallet  │             │
│  │/api/v1/* │ │   /ws    │ │  Auth    │             │
│  └──────────┘ └──────────┘ └──────────┘            │
│  ┌──────────────────────────────────────┐           │
│  │  Rate Limiter  │  Webhook Engine     │           │
│  └──────────────────────────────────────┘           │
└─────────────────────┬───────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────┐
│               Algorand Blockchain                    │
│  ┌─────────────────────────────────────────────┐    │
│  │     AmmDex Smart Contract (ARC-4)           │    │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐    │    │
│  │  │ Constant │ │ LP Token │ │ Liquidity│    │    │
│  │  │ Product  │ │  (ASA)   │ │   Pool   │    │    │
│  │  │   AMM    │ │          │ │  State   │    │    │
│  │  └──────────┘ └──────────┘ └──────────┘    │    │
│  └─────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Smart Contract | Algorand TypeScript (`puya-ts`) — ARC-4 compliant |
| API Server | Express.js + TypeScript |
| WebSocket | `ws` library |
| CLI | `commander` |
| SDK | `algosdk v3` |
| Auth | Wallet signing + JWT |
| Compilation | `algokit compile ts` |

---

## Quick Start

### Prerequisites

- **Node.js** ≥ 22
- **AlgoKit** (`pipx install algokit`)
- **Docker** (for AlgoKit localnet)

### 1. Start Local Sandbox

```bash
algokit localnet start
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Compile Smart Contracts

```bash
npm run build
```

### 4. Deploy Contract & Bootstrap Pool

```bash
# Copy environment template
cp .env.example .env

# Deploy (ensure localnet is running)
npm run deploy
```

After deployment, update `.env` with the output `APP_ID`, `ASSET_B_ID`, and `LP_TOKEN_ID`.

### 5. Start API Server

```bash
npm run api
```

The API will be available at `http://localhost:3000`.

---

## API Reference

### Base URL: `http://localhost:3000/api/v1`

### Health & Auth

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/health/auth/challenge?address=ADDR` | GET | Get signing challenge |
| `/health/auth/verify` | POST | Verify signature, get JWT |

### Swap

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/swap/quote?direction=algo_to_asset&amountIn=1000000` | GET | Get swap quote |
| `/swap/execute` | POST | Build unsigned swap txns |
| `/swap/submit` | POST | Submit signed txns |

#### Quote Example

```bash
curl "http://localhost:3000/api/v1/swap/quote?direction=algo_to_asset&amountIn=1000000"
```

```json
{
  "assetIn": "ALGO",
  "assetOut": "TUSDC",
  "amountIn": "1000000",
  "amountOut": "498504",
  "priceImpact": 0.0998,
  "fee": "300",
  "exchangeRate": 0.498504
}
```

#### Execute Swap (Build Unsigned Txns)

```bash
curl -X POST http://localhost:3000/api/v1/swap/execute \
  -H "Content-Type: application/json" \
  -d '{
    "sender": "YOUR_ALGO_ADDRESS",
    "direction": "algo_to_asset",
    "amountIn": "1000000",
    "slippageBps": 100
  }'
```

#### Submit Signed Txns

```bash
curl -X POST http://localhost:3000/api/v1/swap/submit \
  -H "Content-Type: application/json" \
  -d '{"signedTxns": ["base64_txn_1", "base64_txn_2"]}'
```

### Liquidity

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/liquidity/add` | POST | Build add-liquidity txns |
| `/liquidity/remove` | POST | Build remove-liquidity txns |
| `/liquidity/submit` | POST | Submit signed txns |
| `/liquidity/position/:address` | GET | Get LP position |

### Market Data

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/market/price` | GET | Current price |
| `/market/reserves` | GET | Pool reserves |
| `/market/pool` | GET | Full pool info + TVL |

### Webhooks

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/webhooks/register` | POST | Register webhook URL |
| `/webhooks/list` | GET | List webhooks |
| `/webhooks/:id` | DELETE | Remove webhook |

#### Webhook Event Format

```json
{
  "event_id": "uuid",
  "event_type": "swap_confirmed",
  "timestamp": "2026-04-12T08:00:00.000Z",
  "data": {
    "txn_id": "TXNHASH...",
    "confirmed_round": 12345
  },
  "signature": "hmac-sha256-hex"
}
```

---

## WebSocket

Connect to `ws://localhost:3000/ws` for real-time data.

```javascript
const ws = new WebSocket('ws://localhost:3000/ws')

ws.onopen = () => {
  ws.send(JSON.stringify({ subscribe: 'price' }))
}

ws.onmessage = (event) => {
  console.log(JSON.parse(event.data))
  // { type: "price_update", pair: "ALGO/TUSDC", priceAlgoInTusdc: 0.5, ... }
}
```

---

## CLI Usage

```bash
# Price check
npx ts-node cli/index.ts price

# Swap quote
npx ts-node cli/index.ts quote -d algo_to_asset -a 10

# Execute swap (builds unsigned txns)
npx ts-node cli/index.ts swap -d algo_to_asset -a 10 -s YOUR_ADDRESS

# Pool info
npx ts-node cli/index.ts pool

# LP position
npx ts-node cli/index.ts position -a YOUR_ADDRESS

# Webhook management
npx ts-node cli/index.ts webhook register -u https://myapp.com/hook
npx ts-node cli/index.ts webhook list
npx ts-node cli/index.ts webhook delete -i WEBHOOK_ID

# Health check
npx ts-node cli/index.ts health
```

---

## Non-Custodial Design

The API **never handles private keys**. The swap flow is:

1. **Client** calls `/swap/execute` → receives unsigned transactions
2. **Client** signs transactions locally with their wallet
3. **Client** calls `/swap/submit` with signed transactions
4. **Server** submits to Algorand network → returns confirmation

```
Client                    API                     Algorand
  │                        │                        │
  │── GET /swap/quote ────>│                        │
  │<── { amountOut } ──────│                        │
  │                        │                        │
  │── POST /swap/execute ─>│                        │
  │<── { unsigned txns } ──│                        │
  │                        │                        │
  │ [Signs locally]        │                        │
  │                        │                        │
  │── POST /swap/submit ──>│── sendRawTransaction ─>│
  │<── { txId, round } ────│<── confirmed ──────────│
```

---

## Smart Contract

Written in **Algorand TypeScript** (compiled via `puya-ts`), ARC-4 compliant.

### ABI Methods

| Method | Description |
|--------|-------------|
| `bootstrap(pay,asset,uint64)asset` | Initialize pool |
| `addLiquidity(pay,axfer)uint64` | Add liquidity |
| `removeLiquidity(axfer)void` | Remove liquidity |
| `swapAlgoForAsset(pay,uint64)uint64` | Swap ALGO → TUSDC |
| `swapAssetForAlgo(axfer,uint64)uint64` | Swap TUSDC → ALGO |
| `getPrice()uint64` | Get price (readonly) |
| `getReserveA()uint64` | Get ALGO reserve (readonly) |
| `getReserveB()uint64` | Get TUSDC reserve (readonly) |
| `getTotalLp()uint64` | Get total LP supply (readonly) |
| `getFeeBps()uint64` | Get fee in bps (readonly) |
| `setFee(uint64)void` | Update fee (governor only) |

### AMM Formula

**Constant Product**: `x * y = k`

```
amountOut = (amountIn × (10000 - feeBps) × reserveOut) / (reserveIn × 10000 + amountIn × (10000 - feeBps))
```

---

## Project Structure

```
slytherin/
├── smart_contracts/
│   ├── amm_dex/
│   │   ├── contract.algo.ts      # AMM smart contract
│   │   └── deploy-config.ts      # Deployment script
│   ├── artifacts/amm_dex/        # Compiled TEAL + typed client
│   └── index.ts                  # Deployer entrypoint
├── api/
│   ├── server.ts                 # Express server
│   ├── routes/                   # REST endpoints
│   ├── middleware/                # Auth + rate limiting
│   ├── services/                 # Algorand SDK + webhooks
│   └── ws/                       # WebSocket price feed
├── cli/
│   └── index.ts                  # CLI tool
├── .env.example
├── package.json
└── README.md
```

## License

MIT
