import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import algosdk from 'algosdk'

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me'
const TOKEN_EXPIRY = '24h'

// In-memory challenge store (production: use Redis)
const challenges: Map<string, { challenge: string; expiresAt: number }> = new Map()

/**
 * Wallet-based authentication:
 * 1. GET  /auth/challenge?address=ALGO_ADDR → returns a challenge string
 * 2. POST /auth/verify { address, signature } → returns JWT
 * 3. Protected routes check Authorization: Bearer <jwt>
 */

/** Generate a challenge for wallet signing */
export function generateChallenge(req: Request, res: Response): void {
  const address = req.query.address as string
  if (!address || !algosdk.isValidAddress(address)) {
    res.status(400).json({ error: 'INVALID_ADDRESS', message: 'Provide a valid Algorand address' })
    return
  }

  const challenge = `slytherin-dex:${crypto.randomBytes(32).toString('hex')}:${Date.now()}`
  challenges.set(address, { challenge, expiresAt: Date.now() + 5 * 60 * 1000 })

  res.json({ address, challenge })
}

/** Verify a signed challenge and issue JWT */
export function verifyChallenge(req: Request, res: Response): void {
  const { address, signature } = req.body
  if (!address || !signature) {
    res.status(400).json({ error: 'MISSING_FIELDS', message: 'address and signature required' })
    return
  }

  const entry = challenges.get(address)
  if (!entry || entry.expiresAt < Date.now()) {
    res.status(401).json({ error: 'INVALID_CHALLENGE', message: 'Challenge expired or not found' })
    return
  }

  try {
    const sigBytes = new Uint8Array(Buffer.from(signature, 'base64'))
    const msgBytes = new Uint8Array(Buffer.from(entry.challenge))
    const verified = algosdk.verifyBytes(msgBytes, sigBytes, address)
    if (!verified) {
      res.status(401).json({ error: 'BAD_SIGNATURE', message: 'Signature verification failed' })
      return
    }

    challenges.delete(address)
    const token = jwt.sign({ address }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY })
    res.json({ token, expiresIn: TOKEN_EXPIRY })
  } catch (err) {
    res.status(401).json({ error: 'VERIFICATION_FAILED', message: (err as Error).message })
  }
}

/** Middleware to protect routes — verifies JWT and attaches address to req */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'UNAUTHORIZED', message: 'Bearer token required' })
    return
  }

  try {
    const decoded = jwt.verify(header.slice(7), JWT_SECRET) as { address: string }
    ;(req as any).walletAddress = decoded.address
    next()
  } catch {
    res.status(401).json({ error: 'INVALID_TOKEN', message: 'Token expired or invalid' })
  }
}
