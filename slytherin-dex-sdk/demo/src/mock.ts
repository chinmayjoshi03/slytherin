/**
 * Mock fetch that simulates the Slytherin DEX API.
 * This lets the demo run without a real backend.
 */

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function randomHex(bytes: number): string {
  return Array.from({ length: bytes }, () =>
    Math.floor(Math.random() * 256).toString(16).padStart(2, "0"),
  ).join("");
}

function fakeBase64(len = 120): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("") + "==";
}

const ROUTES: Record<string, (url: URL, body?: unknown) => unknown> = {
  // GET /api/v1/market/reserves
  "GET /api/v1/market/reserves": () => ({
    pool_app_id: 100_200_300,
    reserves: [
      { asset_id: 0, symbol: "ALGO", reserves: 8_452_310_000, decimals: 6 },
      { asset_id: 456_789, symbol: "SLYTH", reserves: 24_780_000, decimals: 6 },
    ],
    lp_token_supply: 14_470_350,
    last_updated: new Date().toISOString(),
  }),

  // GET /api/v1/swap/quote
  "GET /api/v1/swap/quote": (url: URL) => {
    const amountIn = Number(url.searchParams.get("amount_in") ?? 1_000_000);
    const slippage = Number(url.searchParams.get("slippage_bps") ?? 50);
    const direction = url.searchParams.get("direction") ?? "algo_to_b";
    const rate = direction === "algo_to_b" ? 2.93 : 0.341;
    const amountOut = Math.floor(amountIn * rate);
    const fee = Math.floor(amountIn * 0.003);
    return {
      direction,
      amount_in: amountIn,
      amount_out: amountOut,
      price_impact_bps: Math.floor(Math.random() * 15) + 1,
      fee,
      slippage_bps: slippage,
      minimum_received: Math.floor(amountOut * (1 - slippage / 10_000)),
      expires_at: new Date(Date.now() + 120_000).toISOString(),
    };
  },

  // POST /api/v1/swap/execute
  "POST /api/v1/swap/execute": (_url: URL, body: unknown) => {
    const b = body as Record<string, unknown>;
    const quoteRoute = ROUTES["GET /api/v1/swap/quote"]!;
    const fakeUrl = new URL(
      `http://localhost/api/v1/swap/quote?direction=${b.direction}&amount_in=${b.amount_in}&slippage_bps=${b.slippage_bps}`,
    );
    return {
      group_id: randomHex(32),
      transactions: [
        { txn: fakeBase64(), signer: b.sender, description: "App call — swap" },
        { txn: fakeBase64(), signer: b.sender, description: "Payment — input asset" },
      ],
      quote: quoteRoute(fakeUrl),
      expires_at: new Date(Date.now() + 120_000).toISOString(),
    };
  },

  // POST /api/v1/swap/submit
  "POST /api/v1/swap/submit": () => ({
    tx_id: randomHex(32),
    group_id: randomHex(32),
    status: "confirmed",
    round: 42_000_000 + Math.floor(Math.random() * 10_000),
  }),

  // POST /api/v1/liquidity/add
  "POST /api/v1/liquidity/add": (_url: URL, body: unknown) => {
    const b = body as Record<string, unknown>;
    return {
      group_id: randomHex(32),
      transactions: [
        { txn: fakeBase64(), signer: b.sender, description: "App call — add liquidity" },
        { txn: fakeBase64(), signer: b.sender, description: "Payment — ALGO deposit" },
        { txn: fakeBase64(), signer: b.sender, description: "Asset transfer — SLYTH deposit" },
      ],
      estimated_lp_tokens: Math.floor(
        Math.sqrt((b.amount_algo as number) * (b.amount_b as number)),
      ),
      expires_at: new Date(Date.now() + 120_000).toISOString(),
    };
  },

  // POST /api/v1/webhooks/register
  "POST /api/v1/webhooks/register": (_url: URL, body: unknown) => {
    const b = body as Record<string, unknown>;
    return {
      webhook_id: `wh_${randomHex(12)}`,
      url: b.url,
      events: b.events,
      secret: `whsec_${randomHex(24)}`,
      created_at: new Date().toISOString(),
    };
  },
};

/**
 * Drop-in replacement for `globalThis.fetch` that resolves with mock data
 * after a short artificial delay.
 */
export const mockFetch: typeof globalThis.fetch = async (
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> => {
  // Simulate network latency
  await delay(300 + Math.random() * 400);

  const urlStr = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const url = new URL(urlStr);
  const method = (init?.method ?? "GET").toUpperCase();
  const pathname = url.pathname;

  const routeKey = `${method} ${pathname}`;
  const handler = ROUTES[routeKey];

  if (!handler) {
    return new Response(JSON.stringify({ error: "not_found", message: `No mock for ${routeKey}`, status_code: 404 }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: unknown;
  if (init?.body) {
    body = JSON.parse(init.body as string);
  }

  const data = handler(url, body);

  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
