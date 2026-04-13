import rateLimit from 'express-rate-limit'

const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10)
const max = parseInt(process.env.RATE_LIMIT_MAX || '60', 10)

/** Global rate limiter — applies to all routes */
export const globalLimiter = rateLimit({
  windowMs,
  max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'RATE_LIMITED', message: 'Too many requests, please try again later' },
})

/** Strict rate limiter for write operations (swap execute, liquidity) */
export const writeLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'RATE_LIMITED', message: 'Too many write requests' },
})

/** Relaxed rate limiter for read operations (quotes, market data) */
export const readLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'RATE_LIMITED', message: 'Too many read requests' },
})
