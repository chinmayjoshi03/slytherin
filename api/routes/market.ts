import { Router, Request, Response } from 'express'
import { AlgorandService } from '../services/algorand'
import { readLimiter } from '../middleware/rateLimiter'

export const marketRouter = Router()

function getService(req: Request): AlgorandService {
  return req.app.get('algorandService') as AlgorandService
}

/** GET /api/v1/market/price — current price */
marketRouter.get('/price', readLimiter, async (req: Request, res: Response) => {
  try {
    const pool = await getService(req).getPoolState()
    res.json({
      pair: 'ALGO/TUSDC',
      priceAlgoInTusdc: pool.priceAtoB,
      priceTusdcInAlgo: pool.priceBtoA,
      reserveAlgo: pool.reserveA.toString(),
      reserveTusdc: pool.reserveB.toString(),
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    res.status(500).json({ error: 'PRICE_FAILED', message: (err as Error).message })
  }
})

/** GET /api/v1/market/reserves — current reserves */
marketRouter.get('/reserves', readLimiter, async (req: Request, res: Response) => {
  try {
    const pool = await getService(req).getPoolState()
    res.json({
      reserveAlgo: pool.reserveA.toString(),
      reserveTusdc: pool.reserveB.toString(),
      totalLp: pool.totalLp.toString(),
      constantProduct: (pool.reserveA * pool.reserveB).toString(),
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    res.status(500).json({ error: 'RESERVES_FAILED', message: (err as Error).message })
  }
})

/** GET /api/v1/market/pool — full pool info */
marketRouter.get('/pool', readLimiter, async (req: Request, res: Response) => {
  try {
    const service = getService(req)
    const pool = await service.getPoolState()

    const tvlAlgo = Number(pool.reserveA) / 1e6
    const tvlTusdc = Number(pool.reserveB) / 1e6

    res.json({
      appId: pool.appId,
      appAddress: service.getAppAddress(),
      pair: 'ALGO/TUSDC',
      assets: {
        algo: { symbol: 'ALGO', reserve: pool.reserveA.toString(), decimals: 6 },
        tusdc: { id: pool.assetBId, symbol: 'TUSDC', reserve: pool.reserveB.toString(), decimals: 6 },
      },
      lpToken: { id: pool.lpTokenId, symbol: 'SDLP', totalSupply: pool.totalLp.toString() },
      feeBps: pool.feeBps,
      feePercent: pool.feeBps / 100,
      priceAlgoInTusdc: pool.priceAtoB,
      priceTusdcInAlgo: pool.priceBtoA,
      tvl: { algo: tvlAlgo, tusdc: tvlTusdc },
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    res.status(500).json({ error: 'POOL_FAILED', message: (err as Error).message })
  }
})
