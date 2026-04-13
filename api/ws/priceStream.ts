import { Server as HttpServer } from 'http'
import { WebSocketServer, WebSocket } from 'ws'
import { AlgorandService } from '../services/algorand'
import { webhookService } from '../services/webhook'

const POLL_INTERVAL_MS = 4000 // ~1 block on Algorand

/**
 * WebSocket price stream.
 *
 * Clients connect to ws://host:port/ws and receive:
 * - price_update events every block (~4s)
 * - trade events when webhooks fire
 *
 * Send {"subscribe": "price"} to start receiving price updates.
 * Send {"subscribe": "trades"} to receive trade events.
 */
export function setupWebSocket(server: HttpServer, algorandService: AlgorandService): void {
  const wss = new WebSocketServer({ server, path: '/ws' })

  const priceSubscribers = new Set<WebSocket>()
  const tradeSubscribers = new Set<WebSocket>()

  wss.on('connection', (ws: WebSocket) => {
    console.log('[WS] Client connected')

    ws.on('message', (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString())
        if (msg.subscribe === 'price') {
          priceSubscribers.add(ws)
          ws.send(JSON.stringify({ type: 'subscribed', channel: 'price' }))
        } else if (msg.subscribe === 'trades') {
          tradeSubscribers.add(ws)
          ws.send(JSON.stringify({ type: 'subscribed', channel: 'trades' }))
        } else if (msg.unsubscribe) {
          priceSubscribers.delete(ws)
          tradeSubscribers.delete(ws)
          ws.send(JSON.stringify({ type: 'unsubscribed' }))
        }
      } catch {
        ws.send(JSON.stringify({ error: 'Invalid message format. Send {"subscribe":"price"}' }))
      }
    })

    ws.on('close', () => {
      priceSubscribers.delete(ws)
      tradeSubscribers.delete(ws)
      console.log('[WS] Client disconnected')
    })

    // Send welcome message
    ws.send(
      JSON.stringify({
        type: 'welcome',
        message: 'Slytherin DEX WebSocket. Send {"subscribe":"price"} or {"subscribe":"trades"}',
      }),
    )
  })

  // Heartbeat every 30s
  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping()
      }
    })
  }, 30_000)

  // Price polling
  let lastPriceA = 0
  let lastPriceB = 0
  const priceInterval = setInterval(async () => {
    if (priceSubscribers.size === 0) return
    try {
      const pool = await algorandService.getPoolState()
      // Only broadcast if price changed
      if (pool.priceAtoB !== lastPriceA || pool.priceBtoA !== lastPriceB) {
        lastPriceA = pool.priceAtoB
        lastPriceB = pool.priceBtoA
        const msg = JSON.stringify({
          type: 'price_update',
          pair: 'ALGO/TUSDC',
          priceAlgoInTusdc: pool.priceAtoB,
          priceTusdcInAlgo: pool.priceBtoA,
          reserveAlgo: pool.reserveA.toString(),
          reserveTusdc: pool.reserveB.toString(),
          timestamp: new Date().toISOString(),
        })
        priceSubscribers.forEach((ws) => {
          if (ws.readyState === WebSocket.OPEN) ws.send(msg)
        })
        await webhookService.fireEvent('price_update', {
          pair: 'ALGO/TUSDC',
          priceAlgoInTusdc: pool.priceAtoB,
          priceTusdcInAlgo: pool.priceBtoA,
          reserveAlgo: pool.reserveA.toString(),
          reserveTusdc: pool.reserveB.toString(),
        })
      }
    } catch (err) {
      console.error('[WS] Price poll error:', (err as Error).message)
    }
  }, POLL_INTERVAL_MS)

  wss.on('close', () => {
    clearInterval(heartbeatInterval)
    clearInterval(priceInterval)
  })

  /** Broadcast trade event to trade subscribers */
  ;(global as any).__broadcastTrade = (data: Record<string, unknown>) => {
    const msg = JSON.stringify({ type: 'trade', ...data, timestamp: new Date().toISOString() })
    tradeSubscribers.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(msg)
    })
  }
}
