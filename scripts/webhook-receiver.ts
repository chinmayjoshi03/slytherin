#!/usr/bin/env node
/**
 * Slytherin DEX — Webhook Receiver Server
 *
 * A local test server that:
 *   1. Listens for incoming webhook POSTs from the DEX
 *   2. Verifies HMAC-SHA256 signatures
 *   3. Logs events with pretty formatting
 *
 * Usage:
 *   npm run webhook:receiver                         # defaults to port 4000
 *   npm run webhook:receiver -- --port 5000          # custom port
 *   npm run webhook:receiver -- --secret abc123...   # verify signatures
 *
 * The receiver auto-registers itself with the DEX API on startup
 * if you provide --register (requires --token for auth).
 */

import http from 'node:http'
import crypto from 'node:crypto'

// ── Parse args ──
const args = process.argv.slice(2)
function getArg(name: string, fallback: string): string {
  const idx = args.indexOf(`--${name}`)
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback
}

const PORT = parseInt(getArg('port', '4000'), 10)
const WEBHOOK_SECRET = getArg('secret', '')
const API_BASE = getArg('api', 'http://localhost:3000/api/v1')
const AUTH_TOKEN = getArg('token', '')
const AUTO_REGISTER = args.includes('--register')
const EVENTS = getArg('events', 'swap_confirmed,liquidity_changed,price_update')

// ── Colors (no deps) ──
const c = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m',
  bg: '\x1b[44m',
}

function timestamp(): string {
  return new Date().toISOString().slice(11, 23)
}

function log(prefix: string, msg: string): void {
  console.log(`${c.dim}${timestamp()}${c.reset}  ${prefix}  ${msg}`)
}

// ── Signature verification ──
function verifySignature(body: string, receivedSig: string, secret: string): boolean {
  if (!secret) return true // skip if no secret provided
  try {
    const parsed = JSON.parse(body)
    const signable = JSON.stringify({ ...parsed, signature: undefined })
    const expected = crypto.createHmac('sha256', secret).update(signable).digest('hex')
    return expected === receivedSig
  } catch {
    return false
  }
}

// ── Event log formatting ──
const eventIcons: Record<string, string> = {
  swap_confirmed: '🔄',
  liquidity_changed: '💧',
  price_update: '📈',
}

let eventCount = 0

function formatEvent(eventType: string, data: Record<string, unknown>): string {
  const icon = eventIcons[eventType] || '📌'
  const lines = Object.entries(data)
    .map(([k, v]) => `      ${c.dim}${k}:${c.reset} ${v}`)
    .join('\n')
  return `${icon} ${c.bold}${eventType}${c.reset}\n${lines}`
}

// ── HTTP Server ──
const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok', eventsReceived: eventCount }))
    return
  }

  if (req.method !== 'POST') {
    res.writeHead(405)
    res.end('Method Not Allowed')
    return
  }

  let body = ''
  req.on('data', (chunk) => { body += chunk })
  req.on('end', () => {
    eventCount++
    const sig = req.headers['x-webhook-signature'] as string || ''
    const eventType = req.headers['x-webhook-event'] as string || 'unknown'

    // Verify signature
    const sigValid = verifySignature(body, sig, WEBHOOK_SECRET)
    const sigLabel = WEBHOOK_SECRET
      ? (sigValid ? `${c.green}✓ verified${c.reset}` : `${c.red}✗ INVALID${c.reset}`)
      : `${c.dim}(no secret set — skipped)${c.reset}`

    log(`${c.bg}${c.bold} IN ${c.reset}`, `Event #${eventCount}  ${sigLabel}`)

    try {
      const parsed = JSON.parse(body)
      console.log(`    ${formatEvent(eventType, parsed.data || parsed)}`)
      console.log(`    ${c.dim}event_id: ${parsed.event_id || 'n/a'}${c.reset}`)
      console.log(`    ${c.dim}timestamp: ${parsed.timestamp || 'n/a'}${c.reset}`)
      console.log()
    } catch {
      log(`${c.yellow}WARN${c.reset}`, `Non-JSON body: ${body.slice(0, 200)}`)
    }

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ received: true, event: eventCount }))
  })
})

// ── Auto-register with DEX API ──
async function autoRegister(): Promise<void> {
  if (!AUTO_REGISTER) return

  if (!AUTH_TOKEN) {
    log(`${c.yellow}WARN${c.reset}`, 'Skipping auto-register: --token is required for auth. Register manually.')
    return
  }

  const webhookUrl = `http://localhost:${PORT}`
  log(`${c.cyan}REG${c.reset}`, `Registering ${webhookUrl} with DEX API...`)

  try {
    const res = await fetch(`${API_BASE}/webhooks/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AUTH_TOKEN}`,
      },
      body: JSON.stringify({ url: webhookUrl, events: EVENTS.split(',') }),
    })
    const data = await res.json() as Record<string, unknown>

    if (!res.ok) {
      log(`${c.red}ERR${c.reset}`, `Registration failed: ${JSON.stringify(data)}`)
      return
    }

    log(`${c.green} OK ${c.reset}`, `Registered! Webhook ID: ${c.cyan}${data.id}${c.reset}`)
    log(`${c.green} OK ${c.reset}`, `Secret: ${c.yellow}${data.secret}${c.reset}`)
    log(`${c.dim}    ${c.reset}`, `Events: ${(data.events as string[]).join(', ')}`)
    console.log()
  } catch (err) {
    log(`${c.red}ERR${c.reset}`, `Could not reach DEX API: ${(err as Error).message}`)
  }
}

// ── Start ──
server.listen(PORT, async () => {
  console.log()
  console.log(`  ${c.bold}${c.magenta}🔔 Slytherin DEX — Webhook Receiver${c.reset}`)
  console.log(`  ${c.dim}────────────────────────────────────${c.reset}`)
  console.log(`  ${c.dim}Listening on${c.reset}   ${c.cyan}http://localhost:${PORT}${c.reset}`)
  console.log(`  ${c.dim}Health check${c.reset}   ${c.cyan}http://localhost:${PORT}/health${c.reset}`)
  if (WEBHOOK_SECRET) {
    console.log(`  ${c.dim}Secret${c.reset}         ${c.green}configured (will verify signatures)${c.reset}`)
  } else {
    console.log(`  ${c.dim}Secret${c.reset}         ${c.yellow}not set (use --secret to verify)${c.reset}`)
  }
  console.log(`  ${c.dim}────────────────────────────────────${c.reset}`)
  console.log(`  ${c.dim}Waiting for webhook events...${c.reset}\n`)

  await autoRegister()
})
