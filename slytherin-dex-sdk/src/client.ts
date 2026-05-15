import type {
  SlytherinDexClientOptions,
  SwapDirection,
  GetReservesResponse,
  GetQuoteResponse,
  ExecuteSwapRequest,
  ExecuteSwapResponse,
  SubmitSwapRequest,
  SubmitSwapResponse,
  AddLiquidityRequest,
  AddLiquidityResponse,
  RegisterWebhookRequest,
  RegisterWebhookResponse,
  WebhookEvent,
  ApiErrorBody,
} from "./types.js";

// ---------------------------------------------------------------------------
// Custom error class
// ---------------------------------------------------------------------------

/**
 * Thrown when the Slytherin DEX API returns a non-2xx response.
 */
export class SlytherinApiError extends Error {
  public readonly statusCode: number;
  public readonly body: ApiErrorBody | null;

  constructor(statusCode: number, body: ApiErrorBody | null) {
    const msg = body?.message ?? `API responded with status ${statusCode}`;
    super(msg);
    this.name = "SlytherinApiError";
    this.statusCode = statusCode;
    this.body = body;
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

/**
 * Lightweight TypeScript client for the Slytherin DEX REST API.
 *
 * Uses the native `fetch` API (Node 18+, all modern browsers) — zero
 * runtime dependencies.
 *
 * @example
 * ```ts
 * const dex = new SlytherinDexClient({ baseUrl: "https://api.slytherin.io" });
 * const reserves = await dex.getReserves();
 * ```
 */
export class SlytherinDexClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;
  private readonly _fetch: typeof globalThis.fetch;

  constructor(options: SlytherinDexClientOptions) {
    // Strip trailing slash for consistent URL joining
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");

    this.headers = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (options.apiKey) {
      this.headers["X-API-Key"] = options.apiKey;
    }

    this._fetch = options.fetch ?? globalThis.fetch;
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    const init: RequestInit = {
      method,
      headers: { ...this.headers },
    };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }

    const res = await this._fetch(url, init);

    if (!res.ok) {
      let errorBody: ApiErrorBody | null = null;
      try {
        errorBody = (await res.json()) as ApiErrorBody;
      } catch {
        // body wasn't JSON — that's fine
      }
      throw new SlytherinApiError(res.status, errorBody);
    }

    return (await res.json()) as T;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Fetch current pool reserves.
   *
   * `GET /api/v1/market/reserves`
   */
  async getReserves(): Promise<GetReservesResponse> {
    return this.request<GetReservesResponse>("GET", "/api/v1/market/reserves");
  }

  /**
   * Get a swap price quote (does **not** execute a swap).
   *
   * `GET /api/v1/swap/quote`
   *
   * @param direction  - `"algo_to_b"` or `"b_to_algo"`
   * @param amountIn   - Amount of the input asset (in base units)
   * @param slippageBps - Maximum slippage in basis points (e.g. 50 = 0.5 %)
   */
  async getQuote(
    direction: SwapDirection,
    amountIn: number,
    slippageBps: number,
  ): Promise<GetQuoteResponse> {
    const params = new URLSearchParams({
      direction,
      amount_in: String(amountIn),
      slippage_bps: String(slippageBps),
    });
    return this.request<GetQuoteResponse>(
      "GET",
      `/api/v1/swap/quote?${params.toString()}`,
    );
  }

  /**
   * Build an unsigned swap transaction group.
   *
   * `POST /api/v1/swap/execute`
   *
   * The returned transactions must be signed by the sender and then
   * submitted via {@link submitSwap}.
   *
   * @param sender      - Algorand address of the swapper
   * @param direction   - `"algo_to_b"` or `"b_to_algo"`
   * @param amountIn    - Amount of the input asset (in base units)
   * @param slippageBps - Maximum slippage in basis points
   */
  async executeSwap(
    sender: string,
    direction: SwapDirection,
    amountIn: number,
    slippageBps: number,
  ): Promise<ExecuteSwapResponse> {
    const body: ExecuteSwapRequest = {
      sender,
      direction,
      amount_in: amountIn,
      slippage_bps: slippageBps,
    };
    return this.request<ExecuteSwapResponse>(
      "POST",
      "/api/v1/swap/execute",
      body,
    );
  }

  /**
   * Submit signed swap transactions to the network.
   *
   * `POST /api/v1/swap/submit`
   *
   * @param signedTxns - Array of base64-encoded signed transactions
   */
  async submitSwap(signedTxns: string[]): Promise<SubmitSwapResponse> {
    const body: SubmitSwapRequest = { signed_txns: signedTxns };
    return this.request<SubmitSwapResponse>(
      "POST",
      "/api/v1/swap/submit",
      body,
    );
  }

  /**
   * Build an unsigned add-liquidity transaction group.
   *
   * `POST /api/v1/liquidity/add`
   *
   * @param sender     - Algorand address of the liquidity provider
   * @param amountAlgo - ALGO amount (in microAlgos)
   * @param amountB    - Token B amount (in base units)
   */
  async addLiquidity(
    sender: string,
    amountAlgo: number,
    amountB: number,
  ): Promise<AddLiquidityResponse> {
    const body: AddLiquidityRequest = {
      sender,
      amount_algo: amountAlgo,
      amount_b: amountB,
    };
    return this.request<AddLiquidityResponse>(
      "POST",
      "/api/v1/liquidity/add",
      body,
    );
  }

  /**
   * Register a webhook to receive real-time event notifications.
   *
   * `POST /api/v1/webhooks/register`
   *
   * @param url    - HTTPS endpoint that will receive POST callbacks
   * @param events - Array of event types to subscribe to
   */
  async registerWebhook(
    url: string,
    events: WebhookEvent[],
  ): Promise<RegisterWebhookResponse> {
    const body: RegisterWebhookRequest = { url, events };
    return this.request<RegisterWebhookResponse>(
      "POST",
      "/api/v1/webhooks/register",
      body,
    );
  }
}
