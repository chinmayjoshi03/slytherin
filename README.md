# Slytherin DEX (Frontendless, API-first)

Slytherin DEX is a headless Algorand AMM designed for bots, fintech backends, and developer integrations.  
It exposes REST APIs, WebSocket streams, CLI commands, and a minimal developer playground UI, without a retail frontend.

## Deployment

- Deployed App ID (Testnet): `758764386`
- Live API URL: `TBD_DEPLOYMENT_URL`
- Live UI URL: `TBD_DEPLOYMENT_URL/ui`

## Tech Stack

- Smart contracts: Algorand TypeScript (PuyaTS), ARC-4
- Contract build/client generation: AlgoKit (`algokit compile ts`, typed clients)
- Backend/API: Node.js + TypeScript + Express
- Chain integration: `algosdk`

## Local Run

```bash
npm install
cp .env.example .env
# fill DEPLOYER_MNEMONIC and network values in .env
npm run deploy
npm run dev
```

API base URL: `http://localhost:3000/api/v1`  
Developer UI: `http://localhost:3000/ui`

## Auth Flow (wallet signature)

1) Get challenge:
```bash
curl "http://localhost:3000/api/v1/health/auth/challenge?address=YOUR_ALGO_ADDRESS"
```
2) Sign the returned challenge with wallet.
3) Verify and receive JWT:
```bash
curl -X POST "http://localhost:3000/api/v1/health/auth/verify" \
  -H "Content-Type: application/json" \
  -d '{"address":"YOUR_ALGO_ADDRESS","signature":"BASE64_SIGNATURE"}'
```

Use returned token in mutating endpoints:
```bash
-H "Authorization: Bearer YOUR_JWT"
```

## API Endpoints with curl examples

### Health & Auth

```bash
curl "http://localhost:3000/api/v1/health"
curl "http://localhost:3000/api/v1/health/auth/challenge?address=YOUR_ALGO_ADDRESS"
curl -X POST "http://localhost:3000/api/v1/health/auth/verify" -H "Content-Type: application/json" -d '{"address":"YOUR_ALGO_ADDRESS","signature":"BASE64_SIGNATURE"}'
```

### Market

```bash
curl "http://localhost:3000/api/v1/market/price"
curl "http://localhost:3000/api/v1/market/pool"
curl "http://localhost:3000/api/v1/market/reserves"
```

### Swap

```bash
curl "http://localhost:3000/api/v1/swap/quote?direction=algo_to_asset&amountIn=1000000&slippageBps=50"
curl "http://localhost:3000/api/v1/swap/quote?direction=asset_to_algo&amountIn=500000&slippageBps=50"

curl -X POST "http://localhost:3000/api/v1/swap/execute" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT" \
  -d '{"sender":"YOUR_ALGO_ADDRESS","direction":"algo_to_asset","amountIn":"1000000","slippageBps":50}'

curl -X POST "http://localhost:3000/api/v1/swap/submit" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT" \
  -d '{"signedTxns":["BASE64_SIGNED_TXN_1","BASE64_SIGNED_TXN_2"]}'
```

### Liquidity

```bash
curl -X POST "http://localhost:3000/api/v1/liquidity/add" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT" \
  -d '{"sender":"YOUR_ALGO_ADDRESS","amountAlgo":"1000000","amountB":"500000"}'

curl -X POST "http://localhost:3000/api/v1/liquidity/remove" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT" \
  -d '{"sender":"YOUR_ALGO_ADDRESS","lpAmount":"1000"}'

curl -X POST "http://localhost:3000/api/v1/liquidity/submit" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT" \
  -d '{"signedTxns":["BASE64_SIGNED_TXN_1","BASE64_SIGNED_TXN_2"]}'

curl "http://localhost:3000/api/v1/liquidity/position/YOUR_ALGO_ADDRESS"
```

### Webhooks

```bash
curl -X POST "http://localhost:3000/api/v1/webhooks/register" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT" \
  -d '{"url":"https://your-receiver.example/webhook","events":["swap_confirmed","liquidity_changed","price_update"]}'

curl -H "Authorization: Bearer YOUR_JWT" "http://localhost:3000/api/v1/webhooks/list"
curl -X DELETE -H "Authorization: Bearer YOUR_JWT" "http://localhost:3000/api/v1/webhooks/WEBHOOK_ID"
```

## Non-custodial Swap Flow

1) `POST /swap/execute` returns unsigned transaction group  
2) Client signs locally with wallet  
3) `POST /swap/submit` broadcasts signed group  
4) API returns `txId` and confirmation round  
5) Verify on AlgoExplorer: `https://testnet.algoexplorer.io/tx/{txId}`

## Note for Hackathon Review

- Project password reference: `ALGOHackSeries3`
