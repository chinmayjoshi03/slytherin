/* ===================================================================
   slytherin-dex-sdk Demo — Main Application
   =================================================================== */

import "./style.css";
import { mockFetch } from "./mock";

// ⬇ This is the SDK import — exactly how an external consumer would use it
import {
  SlytherinDexClient,
  SlytherinApiError,
  type SwapDirection,
  type WebhookEvent,
} from "slytherin-dex-sdk";

// ---------------------------------------------------------------------------
// 1. Instantiate the SDK client (using the mock fetch for this demo)
// ---------------------------------------------------------------------------
const dex = new SlytherinDexClient({
  baseUrl: "https://api.slytherin.io",
  fetch: mockFetch, // In production you'd remove this — real fetch is the default
});

// ---------------------------------------------------------------------------
// 2. Helpers
// ---------------------------------------------------------------------------
function $(id: string): HTMLElement {
  return document.getElementById(id)!;
}

const consoleEl = $("console-log");

type LogLevel = "info" | "call" | "ok" | "error";

function log(msg: string, level: LogLevel = "info"): void {
  const line = document.createElement("p");
  line.className = `console__line console__line--${level}`;
  const ts = new Date().toLocaleTimeString();
  line.textContent = `[${ts}] ${msg}`;
  consoleEl.appendChild(line);
  consoleEl.scrollTop = consoleEl.scrollHeight;
}

function showOutput(id: string, data: unknown): void {
  const el = $(id) as HTMLDivElement;
  el.textContent = JSON.stringify(data, null, 2);
  el.classList.add("visible");
  // Re-trigger animation
  el.style.animation = "none";
  void el.offsetHeight; // reflow
  el.style.animation = "";
}

async function withLoading(btn: HTMLButtonElement, fn: () => Promise<void>): Promise<void> {
  btn.classList.add("loading");
  try {
    await fn();
  } catch (err) {
    if (err instanceof SlytherinApiError) {
      log(`API Error ${err.statusCode}: ${err.message}`, "error");
    } else {
      log(`Error: ${(err as Error).message}`, "error");
    }
  } finally {
    btn.classList.remove("loading");
  }
}

function formatNum(n: number, decimals = 6): string {
  return (n / 10 ** decimals).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// ---------------------------------------------------------------------------
// 3. Grab UI elements
// ---------------------------------------------------------------------------
const btnReserves = $("btn-reserves") as HTMLButtonElement;
const btnQuote    = $("btn-quote") as HTMLButtonElement;
const btnExecute  = $("btn-execute") as HTMLButtonElement;
const btnLp       = $("btn-lp") as HTMLButtonElement;
const btnWebhook  = $("btn-webhook") as HTMLButtonElement;

const selDirection = $("swap-direction") as HTMLSelectElement;
const inpAmount    = $("swap-amount") as HTMLInputElement;
const inpSlippage  = $("swap-slippage") as HTMLInputElement;
const inpLpAlgo    = $("lp-algo") as HTMLInputElement;
const inpLpB       = $("lp-b") as HTMLInputElement;
const inpWhUrl     = $("wh-url") as HTMLInputElement;

// ---------------------------------------------------------------------------
// 4. Wire up UI actions
// ---------------------------------------------------------------------------

// ---- Reserves ----
btnReserves.addEventListener("click", () => {
  withLoading(btnReserves, async () => {
    log("dex.getReserves()", "call");

    const res = await dex.getReserves();

    // Render a pretty table instead of raw JSON
    const container = $("reserves-output");
    container.innerHTML = `
      <table class="reserves-table">
        <thead><tr><th>Asset</th><th>Symbol</th><th>Reserves</th><th>Decimals</th></tr></thead>
        <tbody>
          ${res.reserves
            .map(
              (r) =>
                `<tr>
                  <td>${r.asset_id === 0 ? "—" : r.asset_id}</td>
                  <td>${r.symbol}</td>
                  <td>${formatNum(r.reserves, r.decimals)}</td>
                  <td>${r.decimals}</td>
                </tr>`,
            )
            .join("")}
        </tbody>
      </table>
      <p class="reserves-lp">LP Supply: <strong>${formatNum(res.lp_token_supply)}</strong> &nbsp;·&nbsp; Pool App ID: <strong>${res.pool_app_id}</strong></p>
    `;
    log(`✓ Reserves fetched — ${res.reserves.length} assets`, "ok");
  });
});

// ---- Get Quote ----
btnQuote.addEventListener("click", () => {
  withLoading(btnQuote, async () => {
    const direction = selDirection.value as SwapDirection;
    const amountIn = Number(inpAmount.value);
    const slippage = Number(inpSlippage.value);

    log(`dex.getQuote("${direction}", ${amountIn}, ${slippage})`, "call");

    const quote = await dex.getQuote(direction, amountIn, slippage);
    showOutput("swap-output", quote);

    log(`✓ Quote: ${formatNum(quote.amount_in)} → ${formatNum(quote.amount_out)}  (impact ${quote.price_impact_bps} bps)`, "ok");
  });
});

// ---- Execute Swap ----
btnExecute.addEventListener("click", () => {
  withLoading(btnExecute, async () => {
    const direction = selDirection.value as SwapDirection;
    const amountIn = Number(inpAmount.value);
    const slippage = Number(inpSlippage.value);
    const sender = "DEMO7XQKPZQ3KFZ5YTQKAW6P3GGZQLFCMHFDRHRGKQVHNPN5MVSUK6ZB74";

    log(`dex.executeSwap("${sender.slice(0, 8)}…", "${direction}", ${amountIn}, ${slippage})`, "call");

    const swap = await dex.executeSwap(sender, direction, amountIn, slippage);
    showOutput("swap-output", swap);

    log(`✓ Swap group built — ${swap.transactions.length} txns, group_id: ${swap.group_id.slice(0, 12)}…`, "ok");
  });
});

// ---- Add Liquidity ----
btnLp.addEventListener("click", () => {
  withLoading(btnLp, async () => {
    const amountAlgo = Number(inpLpAlgo.value);
    const amountB = Number(inpLpB.value);
    const sender = "DEMO7XQKPZQ3KFZ5YTQKAW6P3GGZQLFCMHFDRHRGKQVHNPN5MVSUK6ZB74";

    log(`dex.addLiquidity("${sender.slice(0, 8)}…", ${amountAlgo}, ${amountB})`, "call");

    const lp = await dex.addLiquidity(sender, amountAlgo, amountB);
    showOutput("lp-output", lp);

    log(`✓ Liquidity group built — ${lp.transactions.length} txns, ~${lp.estimated_lp_tokens} LP tokens`, "ok");
  });
});

// ---- Register Webhook ----
btnWebhook.addEventListener("click", () => {
  withLoading(btnWebhook, async () => {
    const url = inpWhUrl.value;
    const checkboxes = document.querySelectorAll<HTMLInputElement>(
      '#card-webhook input[type="checkbox"]:checked',
    );
    const events = Array.from(checkboxes).map((cb) => cb.value as WebhookEvent);

    log(`dex.registerWebhook("${url}", [${events.join(", ")}])`, "call");

    const hook = await dex.registerWebhook(url, events);
    showOutput("webhook-output", hook);

    log(`✓ Webhook registered — id: ${hook.webhook_id}, events: ${hook.events.length}`, "ok");
  });
});

// ---------------------------------------------------------------------------
// 5. Glow follow cursor (subtle background effect)
// ---------------------------------------------------------------------------
document.addEventListener("mousemove", (e) => {
  document.body.style.setProperty("--mx", `${e.clientX}px`);
  document.body.style.setProperty("--my", `${e.clientY}px`);
});

log("SlytherinDexClient instantiated with mock API", "ok");
