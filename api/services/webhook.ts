import { v4 as uuidv4 } from 'uuid'
import crypto from 'crypto'

export interface WebhookRegistration {
  id: string
  url: string
  events: string[]
  secret: string
  createdAt: string
  active: boolean
}

export interface WebhookEvent {
  event_id: string
  event_type: string
  timestamp: string
  data: Record<string, unknown>
  signature: string
}

/**
 * WebhookService — manages webhook registrations and event delivery.
 * Uses HMAC-SHA256 for payload signing.
 */
export class WebhookService {
  private registrations: Map<string, WebhookRegistration> = new Map()

  register(url: string, events: string[]): WebhookRegistration {
    const reg: WebhookRegistration = {
      id: uuidv4(),
      url,
      events,
      secret: crypto.randomBytes(32).toString('hex'),
      createdAt: new Date().toISOString(),
      active: true,
    }
    this.registrations.set(reg.id, reg)
    return reg
  }

  unregister(id: string): boolean {
    return this.registrations.delete(id)
  }

  list(): WebhookRegistration[] {
    return Array.from(this.registrations.values())
  }

  getById(id: string): WebhookRegistration | undefined {
    return this.registrations.get(id)
  }

  /** Fire an event to all matching webhooks (non-blocking) */
  async fireEvent(eventType: string, data: Record<string, unknown>): Promise<void> {
    const matching = Array.from(this.registrations.values()).filter(
      (r) => r.active && r.events.includes(eventType),
    )

    for (const reg of matching) {
      const event: WebhookEvent = {
        event_id: uuidv4(),
        event_type: eventType,
        timestamp: new Date().toISOString(),
        data,
        signature: '',
      }
      event.signature = this.sign(event, reg.secret)
      this.deliver(reg, event).catch((err) => {
        console.error(`Webhook delivery failed [${reg.id}] → ${reg.url}:`, err.message)
      })
    }
  }

  private sign(event: Omit<WebhookEvent, 'signature'>, secret: string): string {
    const payload = JSON.stringify({ ...event, signature: undefined })
    return crypto.createHmac('sha256', secret).update(payload).digest('hex')
  }

  /** Deliver with retry (3 attempts, exponential backoff) */
  private async deliver(reg: WebhookRegistration, event: WebhookEvent, attempt = 1): Promise<void> {
    const maxAttempts = 3
    try {
      const resp = await fetch(reg.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': event.signature,
          'X-Webhook-Event': event.event_type,
        },
        body: JSON.stringify(event),
        signal: AbortSignal.timeout(10000),
      })
      if (!resp.ok && attempt < maxAttempts) {
        const delay = Math.pow(2, attempt) * 1000
        await new Promise((r) => setTimeout(r, delay))
        return this.deliver(reg, event, attempt + 1)
      }
    } catch (err) {
      if (attempt < maxAttempts) {
        const delay = Math.pow(2, attempt) * 1000
        await new Promise((r) => setTimeout(r, delay))
        return this.deliver(reg, event, attempt + 1)
      }
      throw err
    }
  }
}

// Singleton
export const webhookService = new WebhookService()
