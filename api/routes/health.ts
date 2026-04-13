import { Router, Request, Response } from 'express'
import { generateChallenge, verifyChallenge } from '../middleware/auth'

export const healthRouter = Router()

/** GET /api/v1/health — API health check */
healthRouter.get('/', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'slytherin-dex',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    appId: process.env.APP_ID || 'NOT SET',
  })
})

/** GET /api/v1/health/auth/challenge — get a signing challenge */
healthRouter.get('/auth/challenge', generateChallenge)

/** POST /api/v1/health/auth/verify — verify signature, get JWT */
healthRouter.post('/auth/verify', verifyChallenge)
