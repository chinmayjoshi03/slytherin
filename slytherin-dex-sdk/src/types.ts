// ---------------------------------------------------------------------------
// Client configuration
// ---------------------------------------------------------------------------

/** Options passed to the SlytherinDexClient constructor. */
export interface SlytherinDexClientOptions {
  /** Base URL of the Slytherin DEX API (e.g. "https://api.slytherin.io"). */
  baseUrl: string;

  /** Optional API key sent as `X-API-Key` header on every request. */
  apiKey?: string;

  /**
   * Optional custom `fetch` implementation.
   * Defaults to the global `fetch` available in Node 18+ and modern browsers.
   */
  fetch?: typeof globalThis.fetch;
}

// ---------------------------------------------------------------------------
// Swap direction
// ---------------------------------------------------------------------------

/** Direction of a swap: ALGO → token B or token B → ALGO. */
export type SwapDirection = "algo_to_b" | "b_to_algo";

// ---------------------------------------------------------------------------
// /api/v1/market/reserves
// ---------------------------------------------------------------------------

/** A single reserve entry returned by the API. */
export interface ReserveInfo {
  asset_id: number;
  symbol: string;
  reserves: number;
  decimals: number;
}

/** Response shape for `GET /api/v1/market/reserves`. */
export interface GetReservesResponse {
  pool_app_id: number;
  reserves: ReserveInfo[];
  lp_token_supply: number;
  last_updated: string;
}

// ---------------------------------------------------------------------------
// /api/v1/swap/quote
// ---------------------------------------------------------------------------

/** Response shape for `GET /api/v1/swap/quote`. */
export interface GetQuoteResponse {
  direction: SwapDirection;
  amount_in: number;
  amount_out: number;
  price_impact_bps: number;
  fee: number;
  slippage_bps: number;
  minimum_received: number;
  expires_at: string;
}

// ---------------------------------------------------------------------------
// /api/v1/swap/execute
// ---------------------------------------------------------------------------

/** Body sent to `POST /api/v1/swap/execute`. */
export interface ExecuteSwapRequest {
  sender: string;
  direction: SwapDirection;
  amount_in: number;
  slippage_bps: number;
}

/** A single unsigned transaction returned from the execute endpoint. */
export interface UnsignedTransaction {
  txn: string;       // base64-encoded unsigned transaction
  signer: string;    // address that must sign
  description: string;
}

/** Response shape for `POST /api/v1/swap/execute`. */
export interface ExecuteSwapResponse {
  group_id: string;
  transactions: UnsignedTransaction[];
  quote: GetQuoteResponse;
  expires_at: string;
}

// ---------------------------------------------------------------------------
// /api/v1/swap/submit
// ---------------------------------------------------------------------------

/** Body sent to `POST /api/v1/swap/submit`. */
export interface SubmitSwapRequest {
  /** Array of base64-encoded signed transactions. */
  signed_txns: string[];
}

/** Response shape for `POST /api/v1/swap/submit`. */
export interface SubmitSwapResponse {
  tx_id: string;
  group_id: string;
  status: "submitted" | "confirmed" | "failed";
  round?: number;
}

// ---------------------------------------------------------------------------
// /api/v1/liquidity/add
// ---------------------------------------------------------------------------

/** Body sent to `POST /api/v1/liquidity/add`. */
export interface AddLiquidityRequest {
  sender: string;
  amount_algo: number;
  amount_b: number;
}

/** Response shape for `POST /api/v1/liquidity/add`. */
export interface AddLiquidityResponse {
  group_id: string;
  transactions: UnsignedTransaction[];
  estimated_lp_tokens: number;
  expires_at: string;
}

// ---------------------------------------------------------------------------
// /api/v1/webhooks/register
// ---------------------------------------------------------------------------

/** Supported webhook event types. */
export type WebhookEvent =
  | "swap.completed"
  | "swap.failed"
  | "liquidity.added"
  | "liquidity.removed"
  | "reserves.updated";

/** Body sent to `POST /api/v1/webhooks/register`. */
export interface RegisterWebhookRequest {
  url: string;
  events: WebhookEvent[];
}

/** Response shape for `POST /api/v1/webhooks/register`. */
export interface RegisterWebhookResponse {
  webhook_id: string;
  url: string;
  events: WebhookEvent[];
  secret: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Standard error body returned by the API. */
export interface ApiErrorBody {
  error: string;
  message: string;
  status_code: number;
}
