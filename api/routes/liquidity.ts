import { Router, Request, Response } from 'express'
import { AlgorandService } from '../services/algorand'
import { webhookService } from '../services/webhook'
import { writeLimiter } from '../middleware/rateLimiter'

export const liquidityRouter = Router()

function getService(req: Request): AlgorandService {
  return req.app.get('algorandService') as AlgorandService
}

/**
 * POST /api/v1/liquidity/add
 * Body: { sender, amountAlgo, amountB }
 * Returns unsigned transaction group
 */
liquidityRouter.post('/add', writeLimiter, async (req: Request, res: Response) => {
  try {
    const service = getService(req)
    const { sender, amountAlgo, amountB } = req.body

    if (!sender || !amountAlgo || !amountB) {
      res.status(400).json({ error: 'MISSING_PARAMS', message: 'sender, amountAlgo, amountB required' })
      return
    }

    const unsignedTxns = await service.buildAddLiquidity(
      sender,
      BigInt(amountAlgo),
      BigInt(amountB),
    )

    res.json({
      transactions: unsignedTxns,
      message: 'Sign all transactions and submit via /liquidity/submit',
      amountAlgo: amountAlgo.toString(),
      amountB: amountB.toString(),
    })
  } catch (err) {
    res.status(500).json({ error: 'BUILD_FAILED', message: (err as Error).message })
  }
})

/**
 * POST /api/v1/liquidity/remove
 * Body: { sender, lpAmount }
 * Returns unsigned transaction group
 */
liquidityRouter.post('/remove', writeLimiter, async (req: Request, res: Response) => {
  try {
    const service = getService(req)
    const { sender, lpAmount } = req.body

    if (!sender || !lpAmount) {
      res.status(400).json({ error: 'MISSING_PARAMS', message: 'sender, lpAmount required' })
      return
    }

    const unsignedTxns = await service.buildRemoveLiquidity(sender, BigInt(lpAmount))

    res.json({
      transactions: unsignedTxns,
      message: 'Sign all transactions and submit via /liquidity/submit',
      lpAmount: lpAmount.toString(),
    })
  } catch (err) {
    res.status(500).json({ error: 'BUILD_FAILED', message: (err as Error).message })
  }
})

/**
 * POST /api/v1/liquidity/submit
 * Body: { signedTxns: string[] }
 */
liquidityRouter.post('/submit', writeLimiter, async (req: Request, res: Response) => {
  try {
    const service = getService(req)
    const { signedTxns } = req.body

    if (!signedTxns || !Array.isArray(signedTxns)) {
      res.status(400).json({ error: 'MISSING_PARAMS', message: 'signedTxns array required' })
      return
    }

    const result = await service.submitSignedTxns(signedTxns)

    webhookService.fireEvent('liquidity_changed', {
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

/**
 * GET /api/v1/liquidity/position/:address
 * Returns LP token balance and estimated value
 */
liquidityRouter.get('/position/:address', async (req: Request, res: Response) => {
  try {
    const service = getService(req)
    const address = req.params.address as string

    const pool = await service.getPoolState()
    const lpBalance = await service.getAssetBalance(address, service.getLpTokenId())

    let sharePercent = 0
    let estimatedAlgo = 0n
    let estimatedAssetB = 0n

    if (pool.totalLp > 0n) {
      sharePercent = Number(lpBalance * 10_000n / pool.totalLp) / 100
      estimatedAlgo = (lpBalance * pool.reserveA) / pool.totalLp
      estimatedAssetB = (lpBalance * pool.reserveB) / pool.totalLp
    }

    res.json({
      address,
      lpBalance: lpBalance.toString(),
      sharePercent,
      estimatedAlgo: estimatedAlgo.toString(),
      estimatedAssetB: estimatedAssetB.toString(),
      pool: {
        totalLp: pool.totalLp.toString(),
        reserveA: pool.reserveA.toString(),
        reserveB: pool.reserveB.toString(),
      },
    })
  } catch (err) {
    res.status(500).json({ error: 'QUERY_FAILED', message: (err as Error).message })
  }
})
