import { Router, Request, Response } from 'express'
import { webhookService } from '../services/webhook'
import { requireAuth } from '../middleware/auth'

export const webhookRouter = Router()

/** POST /api/v1/webhooks/register — register a webhook URL */
webhookRouter.post('/register', requireAuth, (req: Request, res: Response) => {
  const { url, events } = req.body

  if (!url) {
    res.status(400).json({ error: 'MISSING_URL', message: 'url is required' })
    return
  }

  const validEvents = ['swap_confirmed', 'liquidity_changed', 'price_update']
  const evts = events && Array.isArray(events) ? events : validEvents

  const reg = webhookService.register(url, evts)

  res.status(201).json({
    id: reg.id,
    url: reg.url,
    events: reg.events,
    secret: reg.secret,
    message: 'Webhook registered. Store the secret — it is used to verify payload signatures.',
  })
})

/** GET /api/v1/webhooks/list — list registered webhooks */
webhookRouter.get('/list', requireAuth, (_req: Request, res: Response) => {
  const hooks = webhookService.list().map((h) => ({
    id: h.id,
    url: h.url,
    events: h.events,
    active: h.active,
    createdAt: h.createdAt,
  }))
  res.json({ webhooks: hooks })
})

/** DELETE /api/v1/webhooks/:id — remove a webhook */
webhookRouter.delete('/:id', requireAuth, (req: Request, res: Response) => {
  const id = req.params.id as string
  const deleted = webhookService.unregister(id)
  if (deleted) {
    res.json({ success: true, message: 'Webhook removed' })
  } else {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Webhook not found' })
  }
})
