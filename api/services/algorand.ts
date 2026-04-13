import algosdk from 'algosdk'

export interface PoolState {
  appId: number
  assetBId: number
  lpTokenId: number
  reserveA: bigint
  reserveB: bigint
  totalLp: bigint
  feeBps: number
  priceAtoB: number
  priceBtoA: number
}

export interface SwapQuote {
  assetIn: string
  assetOut: string
  amountIn: bigint
  amountOut: bigint
  priceImpact: number
  fee: bigint
  exchangeRate: number
  minOutput?: bigint
}

export class AlgorandService {
  private algod: algosdk.Algodv2
  private appId: number
  private assetBId: number
  private lpTokenId: number

  constructor() {
    const server = process.env.ALGOD_SERVER || 'http://localhost'
    const port = process.env.ALGOD_PORT || '4001'
    const token = process.env.ALGOD_TOKEN || 'a'.repeat(64)
    this.algod = new algosdk.Algodv2(token, server, port)
    this.appId = parseInt(process.env.APP_ID || '0', 10)
    this.assetBId = parseInt(process.env.ASSET_B_ID || '0', 10)
    this.lpTokenId = parseInt(process.env.LP_TOKEN_ID || '0', 10)
    this.validateConfiguration(server)
  }

  getAppAddress(): string {
    return algosdk.getApplicationAddress(this.appId).toString()
  }

  getAppId(): number { return this.appId }
  getAssetBId(): number { return this.assetBId }
  getLpTokenId(): number { return this.lpTokenId }

  /** Read current pool state from global state */
  async getPoolState(): Promise<PoolState> {
    const appInfo = await this.algod.getApplicationByID(this.appId).do()
    const gs = (appInfo.params?.globalState as any[]) || []

    const state: Record<string, bigint> = {}
    for (const entry of gs) {
      const key = Buffer.from(entry.key, 'base64').toString('utf8')
      if (entry.value.type === 2) {
        state[key] = BigInt(entry.value.uint)
      }
    }

    const reserveA = state['reserve_a'] ?? 0n
    const reserveB = state['reserve_b'] ?? 0n
    const priceAtoB = reserveA > 0n ? Number(reserveB) / Number(reserveA) : 0
    const priceBtoA = reserveB > 0n ? Number(reserveA) / Number(reserveB) : 0

    return {
      appId: this.appId,
      assetBId: this.assetBId,
      lpTokenId: this.lpTokenId,
      reserveA,
      reserveB,
      totalLp: state['total_lp'] ?? 0n,
      feeBps: Number(state['fee_bps'] ?? 30n),
      priceAtoB,
      priceBtoA,
    }
  }

  /** Calculate swap output off-chain (mirrors on-chain math) */
  calculateSwapOutput(amountIn: bigint, reserveIn: bigint, reserveOut: bigint, feeBps: number): SwapQuote {
    const scale = 10_000n
    const fee = BigInt(feeBps)
    const feeFactor = scale - fee
    const amountInWithFee = amountIn * feeFactor
    const numerator = amountInWithFee * reserveOut
    const denominator = reserveIn * scale + amountInWithFee
    const amountOut = numerator / denominator
    const feeAmount = (amountIn * fee) / scale
    const spotPrice = Number(reserveOut) / Number(reserveIn)
    const execPrice = Number(amountOut) / Number(amountIn)
    const priceImpact = Math.abs(1 - execPrice / spotPrice) * 100

    return { assetIn: 'ALGO', assetOut: 'TUSDC', amountIn, amountOut, priceImpact, fee: feeAmount, exchangeRate: execPrice }
  }

  applySlippage(amountOut: bigint, slippageBps: number): bigint {
    const safeBps = Math.max(0, Math.min(10_000, slippageBps))
    return amountOut - (amountOut * BigInt(safeBps)) / 10_000n
  }

  /** Build unsigned swap ALGO → Asset B transaction group */
  async buildSwapAlgoForAsset(sender: string, amountIn: bigint, minOutput: bigint): Promise<string[]> {
    const sp = await this.algod.getTransactionParams().do()
    const appAddr = this.getAppAddress()

    const payTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender, receiver: appAddr, amount: amountIn, suggestedParams: sp,
    })
    const appCallTxn = algosdk.makeApplicationCallTxnFromObject({
      sender,
      appIndex: this.appId,
      onComplete: algosdk.OnApplicationComplete.NoOpOC,
      appArgs: [
        algosdk.ABIMethod.fromSignature('swapAlgoForAsset(pay,uint64)uint64').getSelector(),
        algosdk.encodeUint64(minOutput),
      ],
      foreignAssets: [this.assetBId],
      suggestedParams: { ...sp, fee: BigInt(sp.fee) * 2n, flatFee: true },
    })

    const group = algosdk.assignGroupID([payTxn, appCallTxn])
    return group.map((txn) => Buffer.from(algosdk.encodeUnsignedTransaction(txn)).toString('base64'))
  }

  /** Build unsigned swap Asset B → ALGO transaction group */
  async buildSwapAssetForAlgo(sender: string, amountIn: bigint, minOutput: bigint): Promise<string[]> {
    const sp = await this.algod.getTransactionParams().do()
    const appAddr = this.getAppAddress()

    const axferTxn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
      sender, receiver: appAddr, amount: amountIn, assetIndex: this.assetBId, suggestedParams: sp,
    })
    const appCallTxn = algosdk.makeApplicationCallTxnFromObject({
      sender,
      appIndex: this.appId,
      onComplete: algosdk.OnApplicationComplete.NoOpOC,
      appArgs: [
        algosdk.ABIMethod.fromSignature('swapAssetForAlgo(axfer,uint64)uint64').getSelector(),
        algosdk.encodeUint64(minOutput),
      ],
      foreignAssets: [this.assetBId],
      suggestedParams: { ...sp, fee: BigInt(sp.fee) * 2n, flatFee: true },
    })

    const group = algosdk.assignGroupID([axferTxn, appCallTxn])
    return group.map((txn) => Buffer.from(algosdk.encodeUnsignedTransaction(txn)).toString('base64'))
  }

  /** Build unsigned add liquidity transaction group */
  async buildAddLiquidity(sender: string, amountAlgo: bigint, amountB: bigint): Promise<string[]> {
    const sp = await this.algod.getTransactionParams().do()
    const appAddr = this.getAppAddress()

    const payTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
      sender, receiver: appAddr, amount: amountAlgo, suggestedParams: sp,
    })
    const axferTxn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
      sender, receiver: appAddr, amount: amountB, assetIndex: this.assetBId, suggestedParams: sp,
    })
    const appCallTxn = algosdk.makeApplicationCallTxnFromObject({
      sender,
      appIndex: this.appId,
      onComplete: algosdk.OnApplicationComplete.NoOpOC,
      appArgs: [algosdk.ABIMethod.fromSignature('addLiquidity(pay,axfer)uint64').getSelector()],
      foreignAssets: [this.assetBId, this.lpTokenId],
      suggestedParams: { ...sp, fee: BigInt(sp.fee) * 3n, flatFee: true },
    })

    const group = algosdk.assignGroupID([payTxn, axferTxn, appCallTxn])
    return group.map((txn) => Buffer.from(algosdk.encodeUnsignedTransaction(txn)).toString('base64'))
  }

  /** Build unsigned remove liquidity transaction group */
  async buildRemoveLiquidity(sender: string, lpAmount: bigint): Promise<string[]> {
    const sp = await this.algod.getTransactionParams().do()
    const appAddr = this.getAppAddress()

    const lpXferTxn = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
      sender, receiver: appAddr, amount: lpAmount, assetIndex: this.lpTokenId, suggestedParams: sp,
    })
    const appCallTxn = algosdk.makeApplicationCallTxnFromObject({
      sender,
      appIndex: this.appId,
      onComplete: algosdk.OnApplicationComplete.NoOpOC,
      appArgs: [algosdk.ABIMethod.fromSignature('removeLiquidity(axfer)void').getSelector()],
      foreignAssets: [this.assetBId, this.lpTokenId],
      suggestedParams: { ...sp, fee: BigInt(sp.fee) * 3n, flatFee: true },
    })

    const group = algosdk.assignGroupID([lpXferTxn, appCallTxn])
    return group.map((txn) => Buffer.from(algosdk.encodeUnsignedTransaction(txn)).toString('base64'))
  }

  /** Submit signed transactions to the network */
  async submitSignedTxns(signedTxns: string[]): Promise<{ txId: string; confirmedRound: number }> {
    if (signedTxns.length === 0) {
      throw new Error('NO_SIGNED_TXNS')
    }
    const decoded = signedTxns.map((s) => new Uint8Array(Buffer.from(s, 'base64')))
    const merged = new Uint8Array(decoded.reduce((a, b) => a + b.length, 0))
    let offset = 0
    for (const d of decoded) { merged.set(d, offset); offset += d.length }

    const result = await this.algod.sendRawTransaction(merged).do()
    const txId = (result as any).txId ?? (result as any).txid
    const confirmed = await algosdk.waitForConfirmation(this.algod, txId, 4)
    return {
      txId,
      confirmedRound: Number((confirmed as any).confirmedRound ?? (confirmed as any)['confirmed-round']),
    }
  }

  /** Get account asset balance */
  async getAssetBalance(address: string, assetId: number): Promise<bigint> {
    try {
      const info = await this.algod.accountInformation(address).do()
      const assets = (info.assets ?? info['assets']) as any[]
      const asset = assets?.find((a: any) => (a['asset-id'] ?? a.assetId) === assetId)
      return BigInt(asset?.amount ?? 0)
    } catch {
      return 0n
    }
  }

  /** Get account ALGO balance */
  async getAlgoBalance(address: string): Promise<bigint> {
    const info = await this.algod.accountInformation(address).do()
    return BigInt((info as any).amount)
  }

  private validateConfiguration(server: string): void {
    if (!this.appId || !this.assetBId || !this.lpTokenId) {
      throw new Error('APP_ID, ASSET_B_ID, and LP_TOKEN_ID must be configured')
    }
    const network = (process.env.ALGORAND_NETWORK || '').toLowerCase()
    if (network === 'testnet' && !server.includes('testnet')) {
      throw new Error('ALGOD_SERVER must point to testnet when ALGORAND_NETWORK=testnet')
    }
  }
}
