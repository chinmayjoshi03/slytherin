import { Router, Request, Response } from 'express'
import { AlgorandService } from '../services/algorand'
import { webhookService } from '../services/webhook'
import { readLimiter, writeLimiter } from '../middleware/rateLimiter'
import { requireAuth } from '../middleware/auth'

export const swapRouter = Router()

function getService(req: Request): AlgorandService {
  return req.app.get('algorandService') as AlgorandService
}

/**
 * GET /api/v1/swap/quote
 * Query: direction=algo_to_asset|asset_to_algo, amountIn (in microunits)
 */
swapRouter.get('/quote', readLimiter, async (req: Request, res: Response) => {
  try {
    const service = getService(req)
    const direction = req.query.direction as string
    const amountIn = BigInt(req.query.amountIn as string || '0')
    const slippageBps = Number(req.query.slippageBps ?? 100)

    if (!direction || !amountIn) {
      res.status(400).json({ error: 'MISSING_PARAMS', message: 'direction and amountIn required' })
      return
    }

    const pool = await service.getPoolState()
    if (pool.reserveA === 0n || pool.reserveB === 0n) {
      res.status(400).json({ error: 'EMPTY_POOL', message: 'Pool has no liquidity' })
      return
    }

    let quote
    if (direction === 'algo_to_asset') {
      quote = service.calculateSwapOutput(amountIn, pool.reserveA, pool.reserveB, pool.feeBps)
      quote.assetIn = 'ALGO'
      quote.assetOut = 'TUSDC'
    } else if (direction === 'asset_to_algo') {
      quote = service.calculateSwapOutput(amountIn, pool.reserveB, pool.reserveA, pool.feeBps)
      quote.assetIn = 'TUSDC'
      quote.assetOut = 'ALGO'
    } else {
      res.status(400).json({ error: 'INVALID_DIRECTION', message: 'Use algo_to_asset or asset_to_algo' })
      return
    }

    res.json({
      ...quote,
      amountIn: quote.amountIn.toString(),
      amountOut: quote.amountOut.toString(),
      minOutput: service.applySlippage(quote.amountOut, slippageBps).toString(),
      slippageBps,
      fee: quote.fee.toString(),
    })
  } catch (err) {
    res.status(500).json({ error: 'QUOTE_FAILED', message: (err as Error).message })
  }
})

/**
 * POST /api/v1/swap/execute
 * Body: { sender, direction, amountIn, minOutput, slippageBps? }
 * Returns unsigned transaction group (base64 encoded)
 */
swapRouter.post('/execute', writeLimiter, requireAuth, async (req: Request, res: Response) => {
  try {
    const service = getService(req)
    const { sender, direction, amountIn, minOutput, slippageBps } = req.body

    if (!sender || !direction || !amountIn) {
      res.status(400).json({ error: 'MISSING_PARAMS', message: 'sender, direction, amountIn required' })
      return
    }

    const amtIn = BigInt(amountIn)
    let minOut: bigint

    if (minOutput) {
      minOut = BigInt(minOutput)
    } else {
      // Auto-calculate with slippage tolerance (default 1%)
      const pool = await service.getPoolState()
      const slippage = slippageBps ? Number(slippageBps) : 100
      const reserveIn = direction === 'algo_to_asset' ? pool.reserveA : pool.reserveB
      const reserveOut = direction === 'algo_to_asset' ? pool.reserveB : pool.reserveA
      const quote = service.calculateSwapOutput(amtIn, reserveIn, reserveOut, pool.feeBps)
      minOut = service.applySlippage(quote.amountOut, slippage)
    }

    let unsignedTxns: string[]
    if (direction === 'algo_to_asset') {
      unsignedTxns = await service.buildSwapAlgoForAsset(sender, amtIn, minOut)
    } else if (direction === 'asset_to_algo') {
      unsignedTxns = await service.buildSwapAssetForAlgo(sender, amtIn, minOut)
    } else {
      res.status(400).json({ error: 'INVALID_DIRECTION' })
      return
    }

    res.json({
      transactions: unsignedTxns,
      message: 'Sign these transactions with your wallet and submit via /swap/submit',
      direction,
      amountIn: amtIn.toString(),
      minOutput: minOut.toString(),
    })
  } catch (err) {
    res.status(500).json({ error: 'BUILD_FAILED', message: (err as Error).message })
  }
})

/**
 * POST /api/v1/swap/submit
 * Body: { signedTxns: string[] } — base64 encoded signed transactions
 */
swapRouter.post('/submit', writeLimiter, requireAuth, async (req: Request, res: Response) => {
  try {
    const service = getService(req)
    const { signedTxns } = req.body

    if (!signedTxns || !Array.isArray(signedTxns)) {
      res.status(400).json({ error: 'MISSING_PARAMS', message: 'signedTxns array required' })
      return
    }

    const result = await service.submitSignedTxns(signedTxns)

    // Fire webhook event
    await webhookService.fireEvent('swap_confirmed', {
      txn_id: result.txId,
      confirmed_round: result.confirmedRound,
    })
    ;(global as any).__broadcastTrade?.({
      event: 'swap_confirmed',
      txn_id: result.txId,
      confirmed_round: result.confirmedRound,
    })

    res.json({
      success: true,
      txId: result.txId,
      confirmedRound: result.confirmedRound,
    })
  } catch (err) {
    res.status(500).json({ error: 'SUBMIT_FAILED', message: (err as Error).message })
  }
})
