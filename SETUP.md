# Setup Guide

> Get Slytherin DEX running end-to-end on your machine in under 10 minutes.

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | ≥ 22 | [nodejs.org](https://nodejs.org) |
| npm | ≥ 9 | bundled with Node |
| AlgoKit CLI | latest | `brew install algorandfoundation/tap/algokit` |
| Docker Desktop | latest | Required for LocalNet |

Verify everything is installed:

```bash
node --version   # v22.x.x
npm --version    # 9.x.x or later
algokit --version
docker --version
```

---

## Option A — Testnet (Recommended for judges)

The contract is already deployed on Algorand Testnet at **App ID `758764386`**.  
You only need to run the API server.

### 1. Clone & install

```bash
git clone https://github.com/YOUR_ORG/slytherin.git
cd slytherin
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Open `.env` and fill in:

```dotenv
ALGORAND_NETWORK=testnet
ALGOD_SERVER=https://testnet-api.algonode.cloud
ALGOD_PORT=443
ALGOD_TOKEN=

INDEXER_SERVER=https://testnet-idx.algonode.cloud
INDEXER_PORT=443
INDEXER_TOKEN=

# Your testnet deployer wallet (needs ~5 ALGO for fees)
DEPLOYER_MNEMONIC=word1 word2 ... word25

# Auto-filled by `npm run deploy` — or set manually for testnet
APP_ID=758764386
ASSET_B_ID=758764390
LP_TOKEN_ID=758764391

JWT_SECRET=any-random-secret-for-local-dev
WEBHOOK_SECRET=any-random-webhook-secret
```

> **Tip:** Free testnet ALGO at [bank.testnet.algorand.network](https://bank.testnet.algorand.network).  
> Free AlgoNode API access (no token required) at [algonode.cloud](https://algonode.cloud).

### 3. Start the API server

```bash
npm run dev
```

Output:
```
🐍 Slytherin DEX API running at http://0.0.0.0:3000
   WebSocket at ws://0.0.0.0:3000/ws
   Docs: GET /api/v1
```

### 4. Verify

```bash
curl http://localhost:3000/api/v1
curl http://localhost:3000/api/v1/market/price
```

---

## Option B — LocalNet (Full stack)

Run everything locally including your own Algorand node.

### 1. Start LocalNet

```bash
algokit localnet start
```

This launches a local Algorand network via Docker. Takes ~30 seconds.

### 2. Clone & install

```bash
git clone https://github.com/YOUR_ORG/slytherin.git
cd slytherin
npm install
```

### 3. Configure for LocalNet

```bash
cp .env.example .env
```

Set these values in `.env`:

```dotenv
ALGORAND_NETWORK=localnet
ALGOD_SERVER=http://localhost
ALGOD_PORT=4001
ALGOD_TOKEN=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa

INDEXER_SERVER=http://localhost
INDEXER_PORT=8980
INDEXER_TOKEN=

DEPLOYER_MNEMONIC=   # leave blank — AlgoKit auto-provisions from localnet

JWT_SECRET=local-dev-secret
WEBHOOK_SECRET=local-webhook-secret
```

### 4. Compile & deploy

```bash
# Compile the smart contract to TEAL and generate TypeScript client
npm run build

# Deploy AMM contract + create TestUSDC ASA + seed initial liquidity
npm run deploy
```

The deploy script outputs:
```
=== Deployment Summary ===
  App ID:        1001
  App Address:   AAAA...
  TestUSDC ID:   1002
  LP Token ID:   1003
  Fee:           0.3%
=== Done ===
```

The script automatically writes `APP_ID`, `ASSET_B_ID`, and `LP_TOKEN_ID` back to `.env`.

### 5. Start the API server

```bash
npm run dev
```

---

## SDK Demo (optional)

The `slytherin-dex-sdk/demo` directory contains a standalone Vite web app that demonstrates SDK usage with a mock API (no live node required).

```bash
cd slytherin-dex-sdk/demo
npm install
npm run dev
# Open http://localhost:5173
```

---

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run build` | Compile contracts → TEAL, generate TypeScript client |
| `npm run deploy` | Deploy/update contract, seed liquidity |
| `npm run dev` | Start API server with hot-reload |
| `npm run api:start` | Start API server (production mode) |
| `npm run test` | Run integration tests (vitest) |
| `npm run cli` | Interactive CLI for pool operations |
| `npm run webhook:receiver` | Start local webhook test server |

---

## Verifying the Deployment

After starting the API server, test each endpoint:

```bash
# Health check
curl http://localhost:3000/api/v1/health

# Live pool price
curl http://localhost:3000/api/v1/market/price

# Pool reserves
curl http://localhost:3000/api/v1/market/reserves

# Swap quote (1 ALGO → TUSDC, 0.5% slippage)
curl "http://localhost:3000/api/v1/swap/quote?direction=algo_to_asset&amountIn=1000000&slippageBps=50"
```

---

## Troubleshooting

### `DEPLOYER_MNEMONIC` errors on LocalNet

AlgoKit auto-provisions a funded account. Leave `DEPLOYER_MNEMONIC` blank for LocalNet; AlgoKit reads the default KMD wallet.

### `EMPTY_POOL` on quote

The pool wasn't seeded. Re-run `npm run deploy` — it seeds 10 ALGO + 5 TUSDC automatically.

### Port 3000 in use

```bash
API_PORT=3001 npm run dev
```

### AlgoKit localnet won't start

```bash
algokit localnet reset   # wipes and restarts Docker containers
```

### Contract compile errors

```bash
npx puya-ts smart_contracts/amm_dex/contract.algo.ts --out-dir smart_contracts/artifacts
```

---

## Next Steps

- Read [Architecture](docs/ARCHITECTURE.md) to understand the system design
- Read [Smart Contract Reference](docs/CONTRACTS.md) for on-chain method details
- Read [API Reference](docs/API.md) for the full REST and WebSocket spec
- Use the [SDK](slytherin-dex-sdk/README.md) to integrate from any TypeScript project
