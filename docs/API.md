# API Reference

> Slytherin DEX REST API + WebSocket  
> Base URL: `http://localhost:3000/api/v1`

---

## Table of Contents

- [Authentication](#authentication)
- [Rate Limits](#rate-limits)
- [Health](#health)
- [Market](#market)
- [Swap](#swap)
- [Liquidity](#liquidity)
- [Webhooks](#webhooks)
- [WebSocket](#websocket)
- [Error Format](#error-format)

---

## Authentication

The API uses **wallet-signature authentication** — no passwords or API keys are stored. Mutating endpoints (`POST /swap/execute`, `POST /swap/submit`, `POST /liquidity/*`, `POST /webhooks/*`) require a JWT in the `Authorization` header.

### Step 1 — Get a challenge

```http
GET /api/v1/health/auth/challenge?address=YOUR_ALGO_ADDRESS
```

**Response:**

```json
{
  "challenge": "Sign this message to authenticate with Slytherin DEX: abc123xyz...",
  "address": "ABCDEF...",
  "expiresAt": "2026-05-19T14:00:00.000Z"
}
```

### Step 2 — Sign the challenge

Sign the `challenge` string with your Algorand private key. With `algosdk`:

```typescript
import algosdk from 'algosdk'

const account = algosdk.mnemonicToSecretKey(mnemonic)
const msgBytes = new TextEncoder().encode(challenge)
const signature = algosdk.signBytes(msgBytes, account.sk)
const signatureB64 = Buffer.from(signature).toString('base64')
```

### Step 3 — Verify and receive a JWT

```http
POST /api/v1/health/auth/verify
Content-Type: application/json

{
  "address": "YOUR_ALGO_ADDRESS",
  "signature": "BASE64_SIGNATURE"
}
```

**Response:**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "address": "YOUR_ALGO_ADDRESS",
  "expiresIn": "24h"
}
```

### Using the JWT

Include in all mutating requests:

```http
Authorization: Bearer YOUR_JWT_TOKEN
```

---

## Rate Limits

| Route type | Limit |
|-----------|-------|
| Read endpoints (GET) | 60 requests / minute |
| Write endpoints (POST, DELETE) | 20 requests / minute |
| Global fallback | 100 requests / minute |

Rate limit headers are returned on every response:
- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset`

---

## Health

### `GET /api/v1/health`

API health check. No authentication required.

**Response:**

```json
{
  "status": "ok",
  "service": "slytherin-dex",
  "version": "1.0.0",
  "timestamp": "2026-05-19T08:17:10.000Z",
  "uptime": 3721.5,
  "appId": "758764386"
}
```

---

## Market

All market endpoints are read-only and require no authentication.

### `GET /api/v1/market/price`

Current spot price for the ALGO/TUSDC pair.

**Response:**

```json
{
  "pair": "ALGO/TUSDC",
  "priceAlgoInTusdc": 0.482,
  "priceTusdcInAlgo": 2.074,
  "reserveAlgo": "10000000",
  "reserveTusdc": "4820000",
  "timestamp": "2026-05-19T08:17:10.000Z"
}
```

---

### `GET /api/v1/market/reserves`

Raw pool reserve state.

**Response:**

```json
{
  "reserveAlgo": "10000000",
  "reserveTusdc": "4820000",
  "totalLp": "6927610",
  "constantProduct": "48200000000000",
  "timestamp": "2026-05-19T08:17:10.000Z"
}
```

---

### `GET /api/v1/market/pool`

Full pool info including TVL and asset metadata.

**Response:**

```json
{
  "appId": 758764386,
  "appAddress": "AAAA...",
  "pair": "ALGO/TUSDC",
  "assets": {
    "algo":  { "symbol": "ALGO",  "reserve": "10000000", "decimals": 6 },
    "tusdc": { "id": 758764390, "symbol": "TUSDC", "reserve": "4820000", "decimals": 6 }
  },
  "lpToken": {
    "id": 758764391,
    "symbol": "SDLP",
    "totalSupply": "6927610"
  },
  "feeBps": 30,
  "feePercent": 0.3,
  "priceAlgoInTusdc": 0.482,
  "priceTusdcInAlgo": 2.074,
  "tvl": { "algo": 10.0, "tusdc": 4.82 },
  "timestamp": "2026-05-19T08:17:10.000Z"
}
```

---

## Swap

### `GET /api/v1/swap/quote`

Compute a swap quote without executing anything. No authentication required.

**Query parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `direction` | `string` | ✅ | `algo_to_asset` or `asset_to_algo` |
| `amountIn` | `number` | ✅ | Input amount in base units (microALGO or µTUSDC) |
| `slippageBps` | `number` | — | Max slippage in basis points (default 100 = 1%) |

**Example:**

```bash
curl "http://localhost:3000/api/v1/swap/quote?direction=algo_to_asset&amountIn=1000000&slippageBps=50"
```

**Response:**

```json
{
  "amountIn": "1000000",
  "amountOut": "479523",
  "minOutput": "477125",
  "slippageBps": 50,
  "fee": "30",
  "assetIn": "ALGO",
  "assetOut": "TUSDC"
}
```

| Field | Description |
|-------|-------------|
| `amountIn` | Input amount you provided |
| `amountOut` | Expected output |
| `minOutput` | `amountOut` with `slippageBps` tolerance applied — use this in `executeSwap` |
| `fee` | Fee charged (base units) |

---

### `POST /api/v1/swap/execute` 🔒

Build an unsigned transaction group for a swap. **Requires JWT.**

The returned transactions must be signed locally and submitted via `/swap/submit`.

**Request body:**

```json
{
  "sender":     "YOUR_ALGO_ADDRESS",
  "direction":  "algo_to_asset",
  "amountIn":   "1000000",
  "slippageBps": 50
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `sender` | `string` | ✅ | Algorand address that will sign and pay |
| `direction` | `string` | ✅ | `algo_to_asset` or `asset_to_algo` |
| `amountIn` | `string` | ✅ | Input amount in base units |
| `slippageBps` | `number` | — | Slippage tolerance in bps (default 100) |
| `minOutput` | `string` | — | Override auto-calculated min output |

**Response:**

```json
{
  "transactions": ["base64EncodedUnsignedTxn1", "base64EncodedUnsignedTxn2"],
  "message": "Sign these transactions with your wallet and submit via /swap/submit",
  "direction": "algo_to_asset",
  "amountIn": "1000000",
  "minOutput": "477125"
}
```

The `transactions` array contains base64-encoded unsigned Algorand transactions forming an atomic group. All must be signed and submitted together.

---

### `POST /api/v1/swap/submit` 🔒

Submit signed swap transactions to the Algorand network. **Requires JWT.**

**Request body:**

```json
{
  "signedTxns": ["base64SignedTxn1", "base64SignedTxn2"]
}
```

**Response:**

```json
{
  "success": true,
  "txId": "ABCXYZ...",
  "confirmedRound": 42069
}
```

**Side effects:** Fires `swap_confirmed` webhook event and broadcasts to WebSocket subscribers.

---

## Liquidity

### `POST /api/v1/liquidity/add` 🔒

Build an unsigned add-liquidity transaction group. **Requires JWT.**

**Request body:**

```json
{
  "sender":     "YOUR_ALGO_ADDRESS",
  "amountAlgo": "5000000",
  "amountB":    "2500000"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `sender` | `string` | ✅ | LP provider address |
| `amountAlgo` | `string` | ✅ | ALGO to deposit (microALGOs) |
| `amountB` | `string` | ✅ | TestUSDC to deposit (base units) |

**Response:**

```json
{
  "transactions": ["base64Txn1", "base64Txn2", "base64Txn3"],
  "message": "Sign all transactions and submit via /liquidity/submit",
  "amountAlgo": "5000000",
  "amountB": "2500000"
}
```

---

### `POST /api/v1/liquidity/remove` 🔒

Build an unsigned remove-liquidity transaction group. **Requires JWT.**

**Request body:**

```json
{
  "sender":   "YOUR_ALGO_ADDRESS",
  "lpAmount": "1000000"
}
```

**Response:**

```json
{
  "transactions": ["base64Txn1", "base64Txn2"],
  "message": "Sign all transactions and submit via /liquidity/submit",
  "lpAmount": "1000000"
}
```

---

### `POST /api/v1/liquidity/submit` 🔒

Submit signed liquidity transactions. **Requires JWT.**

**Request body:**

```json
{
  "signedTxns": ["base64SignedTxn1", "..."]
}
```

**Response:**

```json
{
  "success": true,
  "txId": "ABCXYZ...",
  "confirmedRound": 42070
}
```

**Side effects:** Fires `liquidity_changed` webhook event.

---

### `GET /api/v1/liquidity/position/:address`

Get an address's LP position. No authentication required.

**Example:**

```bash
curl "http://localhost:3000/api/v1/liquidity/position/ABCDEF..."
```

**Response:**

```json
{
  "address": "ABCDEF...",
  "lpBalance": "1200000",
  "sharePercent": 17.32,
  "estimatedAlgo": "1732000",
  "estimatedAssetB": "835024",
  "pool": {
    "totalLp": "6927610",
    "reserveA": "10000000",
    "reserveB": "4820000"
  }
}
```

---

## Webhooks

Subscribe to real-time DEX events delivered via HTTP POST to your server. **All webhook endpoints require JWT.**

### Supported events

| Event | Fired when |
|-------|-----------|
| `swap_confirmed` | A swap transaction is confirmed on-chain |
| `liquidity_changed` | Liquidity is added or removed |
| `price_update` | Pool price changes (broadcast by WebSocket stream) |

### `POST /api/v1/webhooks/register` 🔒

Register a webhook endpoint.

**Request body:**

```json
{
  "url": "https://your-server.example/webhook",
  "events": ["swap_confirmed", "liquidity_changed"]
}
```

If `events` is omitted, all events are subscribed.

**Response:**

```json
{
  "id": "wh_abc123",
  "url": "https://your-server.example/webhook",
  "events": ["swap_confirmed", "liquidity_changed"],
  "secret": "whsec_xyz...",
  "message": "Webhook registered. Store the secret — it is used to verify payload signatures."
}
```

> **Store the `secret` now.** It is shown only once.

### `GET /api/v1/webhooks/list` 🔒

List registered webhooks.

**Response:**

```json
{
  "webhooks": [
    {
      "id": "wh_abc123",
      "url": "https://your-server.example/webhook",
      "events": ["swap_confirmed"],
      "active": true,
      "createdAt": "2026-05-19T08:00:00.000Z"
    }
  ]
}
```

### `DELETE /api/v1/webhooks/:id` 🔒

Remove a webhook.

**Response:**

```json
{ "success": true, "message": "Webhook removed" }
```

---

### Webhook Payload Format

Your server receives a `POST` request with:

```http
POST /your-webhook-path HTTP/1.1
Content-Type: application/json
X-Slytherin-Signature: sha256=HMAC_SIGNATURE

{
  "event": "swap_confirmed",
  "data": {
    "txn_id": "ABCXYZ...",
    "confirmed_round": 42069
  },
  "timestamp": "2026-05-19T08:17:10.000Z"
}
```

### Verifying the signature

```typescript
import crypto from 'crypto'

function verifySignature(payload: string, secret: string, header: string): boolean {
  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex')
  return crypto.timingSafeEqual(
    Buffer.from(header),
    Buffer.from(expected)
  )
}
```

---

## WebSocket

Connect to receive real-time price and trade events.

**URL:** `ws://localhost:3000/ws`

### Connection

```javascript
const ws = new WebSocket('ws://localhost:3000/ws')

ws.onopen = () => console.log('Connected to Slytherin DEX stream')

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data)
  console.log(msg)
}
```

### Message types

#### `price_update`

Sent every ~5 seconds with current pool state.

```json
{
  "type": "price_update",
  "price": 0.482,
  "reserveA": 10000000,
  "reserveB": 4820000,
  "timestamp": "2026-05-19T08:17:10.000Z"
}
```

#### `swap_confirmed`

Sent immediately when a swap is confirmed on-chain.

```json
{
  "type": "swap_confirmed",
  "event": "swap_confirmed",
  "txn_id": "ABCXYZ...",
  "confirmed_round": 42069
}
```

#### `liquidity_changed`

Sent when liquidity is added or removed.

```json
{
  "type": "liquidity_changed",
  "event": "liquidity_changed",
  "txn_id": "DEFGHI...",
  "confirmed_round": 42070
}
```

---

## Error Format

All errors return a consistent JSON body:

```json
{
  "error": "ERROR_CODE",
  "message": "Human-readable description"
}
```

### Common error codes

| HTTP | Code | Description |
|------|------|-------------|
| 400 | `MISSING_PARAMS` | Required query/body params absent |
| 400 | `INVALID_DIRECTION` | Direction must be `algo_to_asset` or `asset_to_algo` |
| 400 | `EMPTY_POOL` | Pool has no liquidity |
| 401 | `UNAUTHORIZED` | Missing or invalid JWT |
| 404 | `NOT_FOUND` | Endpoint not found |
| 429 | `RATE_LIMITED` | Too many requests |
| 500 | `QUOTE_FAILED` | Internal quote computation error |
| 500 | `BUILD_FAILED` | Failed to build transaction group |
| 500 | `SUBMIT_FAILED` | Failed to broadcast transactions |

---

## Complete Example (curl)

```bash
BASE="http://localhost:3000/api/v1"
ADDRESS="YOUR_ALGORAND_ADDRESS"

# 1. Get a challenge
CHALLENGE=$(curl -s "$BASE/health/auth/challenge?address=$ADDRESS" | jq -r '.challenge')
echo "Challenge: $CHALLENGE"

# 2. Sign it (requires algosdk — see scripts/sign-txns.js for reference)
# SIGNATURE="..." (base64 encoded)

# 3. Get JWT
JWT=$(curl -s -X POST "$BASE/health/auth/verify" \
  -H "Content-Type: application/json" \
  -d "{\"address\":\"$ADDRESS\",\"signature\":\"$SIGNATURE\"}" | jq -r '.token')

# 4. Get a quote
curl -s "$BASE/swap/quote?direction=algo_to_asset&amountIn=1000000&slippageBps=50" | jq

# 5. Execute (get unsigned txns)
EXEC=$(curl -s -X POST "$BASE/swap/execute" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d "{\"sender\":\"$ADDRESS\",\"direction\":\"algo_to_asset\",\"amountIn\":\"1000000\",\"slippageBps\":50}")
echo $EXEC | jq .transactions

# 6. Sign locally, then submit
curl -s -X POST "$BASE/swap/submit" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"signedTxns":["BASE64_SIGNED_TXN_1","BASE64_SIGNED_TXN_2"]}' | jq
```

---

## SDK

For TypeScript/JavaScript projects, use the official SDK instead of raw HTTP:

```bash
npm install slytherin-dex-sdk
```

See [slytherin-dex-sdk/README.md](../slytherin-dex-sdk/README.md) for full SDK documentation.
