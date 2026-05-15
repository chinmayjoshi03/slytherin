# slytherin-dex-sdk

> TypeScript SDK for the **Slytherin DEX** — swap, liquidity, and webhook APIs on Algorand.

Zero runtime dependencies. Uses the native `fetch` API (Node 18+, all modern browsers).

---

## Quick Start

### 1. Install

```bash
npm install slytherin-dex-sdk
```

### 2. Get a Quote & Execute a Swap

```ts
import { SlytherinDexClient } from "slytherin-dex-sdk";

const dex = new SlytherinDexClient({ baseUrl: "https://api.slytherin.io" });

// Get a quote — swap 1 ALGO → SLYTH with 0.5% max slippage
const quote = await dex.getQuote("algo_to_b", 1_000_000, 50);
console.log(`Expected output: ${quote.amount_out} (fee: ${quote.fee})`);

// Build the unsigned swap transaction group
const { transactions } = await dex.executeSwap("YOUR_ALGO_ADDRESS", "algo_to_b", 1_000_000, 50);

// Sign with your wallet and submit
const signed = transactions.map((t) => myWallet.signTxn(t.txn));
const result = await dex.submitSwap(signed);
console.log(`✅ Swap confirmed — tx: ${result.tx_id}, round: ${result.round}`);
```

### 3. Register a Webhook

```ts
const hook = await dex.registerWebhook(
  "https://your-server.com/hooks/slytherin",
  ["swap.completed", "swap.failed", "liquidity.added"],
);

console.log(`Webhook ID: ${hook.webhook_id}`);
console.log(`Signing secret: ${hook.secret}`);  // use this to verify incoming payloads
```

## API Reference

### Constructor

```ts
new SlytherinDexClient(options: SlytherinDexClientOptions)
```

| Option    | Type                  | Required | Description                                |
| --------- | --------------------- | -------- | ------------------------------------------ |
| `baseUrl` | `string`              | ✅       | Base URL of the Slytherin DEX API          |
| `apiKey`  | `string`              | —        | Sent as `X-API-Key` header on every request |
| `fetch`   | `typeof globalThis.fetch` | —    | Custom fetch implementation                |

---

### `getReserves()`

Fetch current pool reserves.

```ts
const reserves = await dex.getReserves();
// → GetReservesResponse
```

**Endpoint:** `GET /api/v1/market/reserves`

---

### `getQuote(direction, amountIn, slippageBps)`

Get a price quote without executing a swap.

```ts
const quote = await dex.getQuote("algo_to_b", 1_000_000, 50);
// → GetQuoteResponse
```

| Param         | Type            | Description                      |
| ------------- | --------------- | -------------------------------- |
| `direction`   | `SwapDirection` | `"algo_to_b"` or `"b_to_algo"`  |
| `amountIn`    | `number`        | Input amount in base units       |
| `slippageBps` | `number`        | Max slippage in basis points     |

**Endpoint:** `GET /api/v1/swap/quote`

---

### `executeSwap(sender, direction, amountIn, slippageBps)`

Build an unsigned swap transaction group.

```ts
const swap = await dex.executeSwap("ALGO_ADDR", "algo_to_b", 1_000_000, 50);
// → ExecuteSwapResponse  (contains .transactions[] to sign)
```

**Endpoint:** `POST /api/v1/swap/execute`

---

### `submitSwap(signedTxns)`

Submit signed transactions to the Algorand network.

```ts
const result = await dex.submitSwap(["base64SignedTxn1", "base64SignedTxn2"]);
// → SubmitSwapResponse
```

**Endpoint:** `POST /api/v1/swap/submit`

---

### `addLiquidity(sender, amountAlgo, amountB)`

Build an unsigned add-liquidity transaction group.

```ts
const lp = await dex.addLiquidity("ALGO_ADDR", 5_000_000, 10_000);
// → AddLiquidityResponse  (contains .transactions[] to sign)
```

**Endpoint:** `POST /api/v1/liquidity/add`

---

### `registerWebhook(url, events)`

Register a webhook to receive real-time event notifications.

```ts
const hook = await dex.registerWebhook(
  "https://example.com/hooks/slytherin",
  ["swap.completed", "liquidity.added"],
);
console.log(`Webhook secret: ${hook.secret}`);
// → RegisterWebhookResponse
```

| Event                | Description               |
| -------------------- | ------------------------- |
| `swap.completed`     | Swap confirmed on-chain   |
| `swap.failed`        | Swap transaction failed   |
| `liquidity.added`    | Liquidity added to pool   |
| `liquidity.removed`  | Liquidity removed from pool |
| `reserves.updated`   | Pool reserves changed     |

**Endpoint:** `POST /api/v1/webhooks/register`

---

## Error Handling

All methods throw a `SlytherinApiError` when the API returns a non-2xx status:

```ts
import { SlytherinApiError } from "slytherin-dex-sdk";

try {
  await dex.getQuote("algo_to_b", 1, 50);
} catch (err) {
  if (err instanceof SlytherinApiError) {
    console.error(err.statusCode); // e.g. 400
    console.error(err.body);       // { error, message, status_code }
  }
}
```

## Types

Every request/response type is exported for your convenience:

```ts
import type {
  SwapDirection,
  GetReservesResponse,
  GetQuoteResponse,
  ExecuteSwapResponse,
  SubmitSwapResponse,
  AddLiquidityResponse,
  RegisterWebhookResponse,
  WebhookEvent,
} from "slytherin-dex-sdk";
```

## License

MIT
