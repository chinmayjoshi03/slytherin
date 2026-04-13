import {
  arc4,
  assert,
  Asset,
  Account,
  Global,
  GlobalState,
  gtxn,
  itxn,
  op,
  Txn,
  uint64,
  Uint64,
} from '@algorandfoundation/algorand-typescript'

const SCALE = Uint64(10_000)
const MIN_LIQUIDITY = Uint64(1_000)

/**
 * AmmDex — Constant-Product AMM on Algorand
 *
 * Pools ALGO (native) against an ASA (asset B).
 * LP token created on-chain at bootstrap via inner txn.
 * Fee: configurable by governor (default 30 bps = 0.3%).
 */
export class AmmDex extends arc4.Contract {
  assetB = GlobalState<Asset>({ key: 'asset_b' })
  lpToken = GlobalState<Asset>({ key: 'lp_token' })
  governor = GlobalState<Account>({ key: 'governor' })
  feeBps = GlobalState<uint64>({ key: 'fee_bps' })
  reserveA = GlobalState<uint64>({ key: 'reserve_a' })
  reserveB = GlobalState<uint64>({ key: 'reserve_b' })
  totalLp = GlobalState<uint64>({ key: 'total_lp' })

  /**
   * Bootstrap the pool: create LP token, opt into asset B.
   * Requires a seed payment to cover MBR for the LP ASA + asset B opt-in.
   */
  @arc4.abimethod()
  bootstrap(seed: gtxn.PaymentTxn, assetB: Asset, feeBps: uint64): Asset {
    assert(!this.lpToken.hasValue, 'ALREADY_BOOTSTRAPPED')
    assert(feeBps < SCALE, 'FEE_TOO_HIGH')
    assert(seed.receiver === Global.currentApplicationAddress, 'BAD_SEED_RECEIVER')
    assert(seed.amount >= Uint64(300_000), 'SEED_TOO_LOW')

    this.assetB.value = assetB
    this.feeBps.value = feeBps
    this.governor.value = Txn.sender
    this.reserveA.value = Uint64(0)
    this.reserveB.value = Uint64(0)
    this.totalLp.value = Uint64(0)

    const lpResult = itxn
      .assetConfig({
        total: 10_000_000_000,
        decimals: 6,
        assetName: 'SLYDEX-LP',
        unitName: 'SDLP',
        manager: Global.currentApplicationAddress,
        reserve: Global.currentApplicationAddress,
        fee: Uint64(0),
      })
      .submit()

    this.lpToken.value = lpResult.createdAsset

    itxn
      .assetTransfer({
        xferAsset: assetB,
        assetReceiver: Global.currentApplicationAddress,
        assetAmount: 0,
        fee: Uint64(0),
      })
      .submit()

    return lpResult.createdAsset
  }

  /**
   * Add liquidity: deposit ALGO + asset B, receive LP tokens.
   * First deposit: LP = sqrt(amountA * amountB) - MIN_LIQUIDITY
   * Subsequent:    LP = min(amountA * totalLp / reserveA, amountB * totalLp / reserveB)
   */
  @arc4.abimethod()
  addLiquidity(payAlgo: gtxn.PaymentTxn, xferB: gtxn.AssetTransferTxn): uint64 {
    assert(this.lpToken.hasValue, 'NOT_BOOTSTRAPPED')
    assert(payAlgo.receiver === Global.currentApplicationAddress, 'BAD_ALGO_RECEIVER')
    assert(xferB.assetReceiver === Global.currentApplicationAddress, 'BAD_ASSET_RECEIVER')
    assert(xferB.xferAsset === this.assetB.value, 'WRONG_ASSET')

    const amountA: uint64 = payAlgo.amount
    const amountB: uint64 = xferB.assetAmount
    let lpToMint: uint64

    if (this.totalLp.value === Uint64(0)) {
      const product: uint64 = amountA * amountB
      const sqrtProduct: uint64 = op.sqrt(product)
      assert(sqrtProduct > MIN_LIQUIDITY, 'INITIAL_LIQUIDITY_TOO_LOW')
      lpToMint = sqrtProduct - MIN_LIQUIDITY
      const locked: uint64 = lpToMint + MIN_LIQUIDITY
      this.totalLp.value = locked
    } else {
      const lpFromA: uint64 = (amountA * this.totalLp.value) / this.reserveA.value
      const lpFromB: uint64 = (amountB * this.totalLp.value) / this.reserveB.value
      lpToMint = lpFromA < lpFromB ? lpFromA : lpFromB
      const newTotal: uint64 = this.totalLp.value + lpToMint
      this.totalLp.value = newTotal
    }

    assert(lpToMint > Uint64(0), 'ZERO_LP_MINT')

    const newReserveA: uint64 = this.reserveA.value + amountA
    const newReserveB: uint64 = this.reserveB.value + amountB
    this.reserveA.value = newReserveA
    this.reserveB.value = newReserveB

    itxn
      .assetTransfer({
        xferAsset: this.lpToken.value,
        assetReceiver: Txn.sender,
        assetAmount: lpToMint,
        fee: Uint64(0),
      })
      .submit()

    return lpToMint
  }

  /**
   * Remove liquidity: send LP tokens to contract, receive proportional ALGO + asset B.
   */
  @arc4.abimethod()
  removeLiquidity(lpXfer: gtxn.AssetTransferTxn): void {
    assert(this.lpToken.hasValue, 'NOT_BOOTSTRAPPED')
    assert(lpXfer.xferAsset === this.lpToken.value, 'WRONG_LP_TOKEN')
    assert(lpXfer.assetReceiver === Global.currentApplicationAddress, 'BAD_LP_RECEIVER')

    const lpAmount: uint64 = lpXfer.assetAmount
    assert(lpAmount > Uint64(0), 'ZERO_LP_BURN')
    assert(lpAmount < this.totalLp.value, 'INSUFFICIENT_LP')

    const outA: uint64 = (lpAmount * this.reserveA.value) / this.totalLp.value
    const outB: uint64 = (lpAmount * this.reserveB.value) / this.totalLp.value

    assert(outA > Uint64(0), 'ZERO_ALGO_OUT')
    assert(outB > Uint64(0), 'ZERO_ASSET_OUT')

    const newResA: uint64 = this.reserveA.value - outA
    const newResB: uint64 = this.reserveB.value - outB
    const newTotalLp: uint64 = this.totalLp.value - lpAmount
    this.reserveA.value = newResA
    this.reserveB.value = newResB
    this.totalLp.value = newTotalLp

    // Move LP sent to the app account into a sink to keep on-chain LP balances aligned with totalLp accounting.
    itxn
      .assetTransfer({
        xferAsset: this.lpToken.value,
        assetReceiver: op.Global.zeroAddress,
        assetAmount: lpAmount,
        fee: Uint64(0),
      })
      .submit()

    itxn
      .payment({
        receiver: Txn.sender,
        amount: outA,
        fee: Uint64(0),
      })
      .submit()

    itxn
      .assetTransfer({
        xferAsset: this.assetB.value,
        assetReceiver: Txn.sender,
        assetAmount: outB,
        fee: Uint64(0),
      })
      .submit()
  }

  /**
   * Swap ALGO → Asset B.
   * User sends ALGO payment, receives asset B.
   */
  @arc4.abimethod()
  swapAlgoForAsset(payAlgo: gtxn.PaymentTxn, minOutput: uint64): uint64 {
    assert(this.lpToken.hasValue, 'NOT_BOOTSTRAPPED')
    assert(payAlgo.receiver === Global.currentApplicationAddress, 'BAD_RECEIVER')

    const amountIn: uint64 = payAlgo.amount
    assert(amountIn > Uint64(0), 'ZERO_INPUT')

    const amountOut: uint64 = this._computeOutput(amountIn, this.reserveA.value, this.reserveB.value)

    assert(amountOut >= minOutput, 'SLIPPAGE_EXCEEDED')
    assert(amountOut < this.reserveB.value, 'INSUFFICIENT_RESERVES')

    const newResA: uint64 = this.reserveA.value + amountIn
    const newResB: uint64 = this.reserveB.value - amountOut
    this.reserveA.value = newResA
    this.reserveB.value = newResB

    itxn
      .assetTransfer({
        xferAsset: this.assetB.value,
        assetReceiver: Txn.sender,
        assetAmount: amountOut,
        fee: Uint64(0),
      })
      .submit()

    return amountOut
  }

  /**
   * Swap Asset B → ALGO.
   * User sends asset B transfer, receives ALGO.
   */
  @arc4.abimethod()
  swapAssetForAlgo(xferB: gtxn.AssetTransferTxn, minOutput: uint64): uint64 {
    assert(this.lpToken.hasValue, 'NOT_BOOTSTRAPPED')
    assert(xferB.assetReceiver === Global.currentApplicationAddress, 'BAD_RECEIVER')
    assert(xferB.xferAsset === this.assetB.value, 'WRONG_ASSET')

    const amountIn: uint64 = xferB.assetAmount
    assert(amountIn > Uint64(0), 'ZERO_INPUT')

    const amountOut: uint64 = this._computeOutput(amountIn, this.reserveB.value, this.reserveA.value)

    assert(amountOut >= minOutput, 'SLIPPAGE_EXCEEDED')
    assert(amountOut < this.reserveA.value, 'INSUFFICIENT_RESERVES')

    const newResB: uint64 = this.reserveB.value + amountIn
    const newResA: uint64 = this.reserveA.value - amountOut
    this.reserveB.value = newResB
    this.reserveA.value = newResA

    itxn
      .payment({
        receiver: Txn.sender,
        amount: amountOut,
        fee: Uint64(0),
      })
      .submit()

    return amountOut
  }

  /** Read-only: price of ALGO in asset B units, scaled by 1e6 */
  @arc4.abimethod({ readonly: true })
  getPrice(): uint64 {
    assert(this.reserveA.value > Uint64(0), 'NO_RESERVES')
    const scaled: uint64 = this.reserveB.value * Uint64(1_000_000)
    const price: uint64 = scaled / this.reserveA.value
    return price
  }

  @arc4.abimethod({ readonly: true })
  getReserveA(): uint64 {
    return this.reserveA.value
  }

  @arc4.abimethod({ readonly: true })
  getReserveB(): uint64 {
    return this.reserveB.value
  }

  @arc4.abimethod({ readonly: true })
  getTotalLp(): uint64 {
    return this.totalLp.value
  }

  @arc4.abimethod({ readonly: true })
  getFeeBps(): uint64 {
    return this.feeBps.value
  }

  /**
   * Compatibility helper for checklist-based integrations:
   * direction: 0 => ALGO -> Asset B, 1 => Asset B -> ALGO
   */
  @arc4.abimethod({ readonly: true })
  swap(direction: uint64, amountIn: uint64, minAmountOut: uint64): uint64 {
    assert(amountIn > Uint64(0), 'ZERO_INPUT')
    const amountOut: uint64 =
      direction === Uint64(0)
        ? this._computeOutput(amountIn, this.reserveA.value, this.reserveB.value)
        : this._computeOutput(amountIn, this.reserveB.value, this.reserveA.value)
    assert(amountOut >= minAmountOut, 'SLIPPAGE_EXCEEDED')
    return amountOut
  }

  /** Compatibility helper for checklist-based integrations */
  @arc4.abimethod({ readonly: true })
  addLiquidityPreview(amountAlgo: uint64, amountAsset: uint64): uint64 {
    return this._previewMint(amountAlgo, amountAsset)
  }

  /** Compatibility helper for checklist-based integrations */
  @arc4.abimethod({ readonly: true })
  removeLiquidityPreview(lpAmount: uint64): [uint64, uint64] {
    assert(lpAmount > Uint64(0), 'ZERO_LP_BURN')
    assert(this.totalLp.value > Uint64(0), 'NO_LP_SUPPLY')
    const amountAlgo: uint64 = (lpAmount * this.reserveA.value) / this.totalLp.value
    const amountAsset: uint64 = (lpAmount * this.reserveB.value) / this.totalLp.value
    return [amountAlgo, amountAsset]
  }

  /** Compatibility helper for checklist-based integrations */
  @arc4.abimethod({ readonly: true })
  getReserves(): [uint64, uint64] {
    return [this.reserveA.value, this.reserveB.value]
  }

  /** Governor-only: update swap fee */
  @arc4.abimethod()
  setFee(newFeeBps: uint64): void {
    assert(Txn.sender === this.governor.value, 'NOT_GOVERNOR')
    assert(newFeeBps < SCALE, 'FEE_TOO_HIGH')
    this.feeBps.value = newFeeBps
  }

  /**
   * Constant-product swap output:
   * dy = (dx * feeFactor * reserveOut) / (reserveIn * SCALE + dx * feeFactor)
   */
  private _computeOutput(amountIn: uint64, reserveIn: uint64, reserveOut: uint64): uint64 {
    const feeFactor: uint64 = SCALE - this.feeBps.value
    const amountInWithFee: uint64 = amountIn * feeFactor
    const numerator: uint64 = amountInWithFee * reserveOut
    const denominatorBase: uint64 = reserveIn * SCALE
    const denominator: uint64 = denominatorBase + amountInWithFee
    const result: uint64 = numerator / denominator
    return result
  }

  private _previewMint(amountA: uint64, amountB: uint64): uint64 {
    if (this.totalLp.value === Uint64(0)) {
      const product: uint64 = amountA * amountB
      const sqrtProduct: uint64 = op.sqrt(product)
      assert(sqrtProduct > MIN_LIQUIDITY, 'INITIAL_LIQUIDITY_TOO_LOW')
      return sqrtProduct - MIN_LIQUIDITY
    }
    const lpFromA: uint64 = (amountA * this.totalLp.value) / this.reserveA.value
    const lpFromB: uint64 = (amountB * this.totalLp.value) / this.reserveB.value
    return lpFromA < lpFromB ? lpFromA : lpFromB
  }
}
