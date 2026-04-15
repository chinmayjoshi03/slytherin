import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { createServer } from 'http'
import path from 'node:path'
import { swapRouter } from './routes/swap'
import { liquidityRouter } from './routes/liquidity'
import { marketRouter } from './routes/market'
import { webhookRouter } from './routes/webhook'
import { healthRouter } from './routes/health'
import { globalLimiter } from './middleware/rateLimiter'
import { setupWebSocket } from './ws/priceStream'
import { AlgorandService } from './services/algorand'

const app = express()
const server = createServer(app)

// ── Middleware ──
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'", 'ws:', 'wss:'],
      },
    },
  })
)
app.use(cors())
app.use(express.json())
app.use(globalLimiter)
app.use('/ui', express.static(path.resolve(__dirname, '../ui')))

// ── Initialize Algorand Service (singleton) ──
const algorandService = new AlgorandService()
app.set('algorandService', algorandService)

// ── Routes ──
app.use('/api/v1/swap', swapRouter)
app.use('/api/v1/liquidity', liquidityRouter)
app.use('/api/v1/market', marketRouter)
app.use('/api/v1/webhooks', webhookRouter)
app.use('/api/v1/health', healthRouter)

// ── API info ──
app.get('/api/v1', (_req, res) => {
  res.json({
    name: 'Slytherin DEX API',
    version: '1.0.0',
    description: 'Frontendless DEX — API-first decentralized exchange on Algorand',
    endpoints: {
      swap: '/api/v1/swap',
      liquidity: '/api/v1/liquidity',
      market: '/api/v1/market',
      webhooks: '/api/v1/webhooks',
      health: '/api/v1/health',
      websocket: 'ws://host:port/ws',
    },
  })
})

app.get('/', (_req, res) => {
  res.redirect('/ui')
})

// ── 404 handler ──
app.use((_req, res) => {
  res.status(404).json({ error: 'NOT_FOUND', message: 'Endpoint not found' })
})

// ── Error handler ──
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err)
  res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message })
})

// ── Start ──
const PORT = parseInt(process.env.API_PORT || '3000', 10)
const HOST = process.env.API_HOST || '0.0.0.0'

setupWebSocket(server, algorandService)

server.listen(PORT, HOST, () => {
  console.log(`\n🐍 Slytherin DEX API running at http://${HOST}:${PORT}`)
  console.log(`   WebSocket at ws://${HOST}:${PORT}/ws`)
  console.log(`   Docs: GET /api/v1\n`)
})

export { app, server }
