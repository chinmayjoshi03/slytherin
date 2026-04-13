import { AlgorandClient } from '@algorandfoundation/algokit-utils'
import { AmmDexFactory } from '../artifacts/amm_dex/AmmDexClient'

function readGlobalState(gs: any[]): Record<string, bigint> {
  const state: Record<string, bigint> = {}
  for (const e of gs) {
    const key = Buffer.from(e.key, 'base64').toString('utf8')
    if (e.value.type === 2) state[key] = BigInt(e.value.uint)
  }
  return state
}

export async function deploy() {
  console.log('=== Deploying AmmDex ===')

  const algorand = AlgorandClient.fromEnvironment()
  const deployer = await algorand.account.fromEnvironment('DEPLOYER')

  // ── Step 1: Deploy AMM Contract ──
  console.log('Deploying AMM DEX contract...')
  const factory = algorand.client.getTypedAppFactory(AmmDexFactory, {
    defaultSender: deployer.addr,
  })

  const { appClient } = await factory.deploy({
    onUpdate: 'append',
    onSchemaBreak: 'append',
  })

  console.log(`  AMM DEX deployed — App ID: ${appClient.appClient.appId}, Address: ${appClient.appAddress}`)

  // ── Step 2: Read current state ──
  const appInfo = await algorand.client.algod.getApplicationByID(Number(appClient.appClient.appId)).do()
  const gs = readGlobalState((appInfo.params?.globalState as any[]) || [])
  const alreadyBootstrapped = 'lp_token' in gs

  let testUsdcId: bigint
  let lpTokenId: bigint

  if (alreadyBootstrapped) {
    // Reuse existing assets from state
    testUsdcId = gs['asset_b']
    lpTokenId = gs['lp_token']
    console.log(`  Already bootstrapped — TUSDC: ${testUsdcId}, LP Token: ${lpTokenId}`)
  } else {
    // ── Step 3a: Create TestUSDC ASA ──
    console.log('Creating TestUSDC ASA...')
    const assetCreateResult = await algorand.send.assetCreate({
      sender: deployer.addr,
      total: 1_000_000_000_000n,
      decimals: 6,
      assetName: 'TestUSDC',
      unitName: 'TUSDC',
    })
    testUsdcId = BigInt(assetCreateResult.assetId)
    console.log(`  TestUSDC created with Asset ID: ${testUsdcId}`)

    // ── Step 3b: Fund the app account ──
    console.log('Funding app account...')
    await algorand.send.payment({
      amount: (1).algo(),
      sender: deployer.addr,
      receiver: appClient.appAddress,
    })

    // ── Step 3c: Bootstrap ──
    console.log('Bootstrapping AMM pool (ALGO / TestUSDC)...')
    const bootstrapResult = await appClient.send.bootstrap({
      args: {
        seed: await algorand.createTransaction.payment({
          sender: deployer.addr,
          receiver: appClient.appAddress,
          amount: (0.3).algo(),
        }),
        assetB: testUsdcId,
        feeBps: 30n,
      },
      extraFee: (2000).microAlgo(), // 2 inner txns: assetConfig + assetTransfer opt-in
    })
    lpTokenId = bootstrapResult.return!
    console.log(`  Pool bootstrapped — LP Token ID: ${lpTokenId}`)
  }

  // ── Step 4: Seed initial liquidity ──
  console.log('Adding initial liquidity (10 ALGO + 5 TUSDC)...')

  // Opt deployer into assets if needed
  const deployerInfo = await algorand.client.algod.accountInformation(deployer.addr.toString()).do()
  const heldAssets = new Set((deployerInfo.assets || []).map((a: any) => BigInt(a['asset-id'] ?? a.assetId ?? 0n)))

  if (!heldAssets.has(testUsdcId)) {
    await algorand.send.assetOptIn({ sender: deployer.addr, assetId: testUsdcId })
  }
  if (!heldAssets.has(lpTokenId)) {
    await algorand.send.assetOptIn({ sender: deployer.addr, assetId: lpTokenId })
  }

  const addLiqResult = await appClient.send.addLiquidity({
    args: {
      payAlgo: await algorand.createTransaction.payment({
        sender: deployer.addr,
        receiver: appClient.appAddress,
        amount: (10).algo(),
      }),
      xferB: await algorand.createTransaction.assetTransfer({
        sender: deployer.addr,
        receiver: appClient.appAddress,
        assetId: testUsdcId,
        amount: 5_000_000n, // 5 TUSDC
      }),
    },
    extraFee: (1000).microAlgo(), // 1 inner txn: LP token transfer
  })

  console.log(`  Initial liquidity added — LP tokens minted: ${addLiqResult.return}`)

  // ── Summary ──
  console.log('\n=== Deployment Summary ===')
  console.log(`  App ID:        ${appClient.appClient.appId}`)
  console.log(`  App Address:   ${appClient.appAddress}`)
  console.log(`  TestUSDC ID:   ${testUsdcId}`)
  console.log(`  LP Token ID:   ${lpTokenId}`)
  console.log(`  Fee:           0.3%`)
  console.log('=== Done ===')
}
