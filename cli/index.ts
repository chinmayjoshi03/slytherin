#!/usr/bin/env node
import { Command } from 'commander'
import chalk from 'chalk'

const API_BASE = process.env.DEX_API_URL || 'http://localhost:3000/api/v1'

const program = new Command()

program
  .name('slytherin-dex')
  .description('CLI for Slytherin DEX — Frontendless Algorand DEX')
  .version('1.0.0')

// ── Helper ──
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function api(path: string, method = 'GET', body?: unknown): Promise<any> {
  const opts: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  }
  if (body) opts.body = JSON.stringify(body)
  const res = await fetch(`${API_BASE}${path}`, opts)
  const data = (await res.json()) as Record<string, any>
  if (!res.ok) {
    console.error(chalk.red(`Error: ${data.error} — ${data.message}`))
    process.exit(1)
  }
  return data
}

function formatMicro(val: string | bigint, decimals = 6): string {
  const n = typeof val === 'string' ? BigInt(val) : val
  const whole = n / BigInt(10 ** decimals)
  const frac = (n % BigInt(10 ** decimals)).toString().padStart(decimals, '0')
  return `${whole}.${frac}`
}

// ── Commands ──

program
  .command('price')
  .description('Get current pool price')
  .action(async () => {
    const data = await api('/market/price')
    console.log(chalk.bold('\n🐍 Slytherin DEX — Price'))
    console.log(`  Pair:              ${chalk.cyan('ALGO / TUSDC')}`)
    console.log(`  ALGO → TUSDC:      ${chalk.green(data.priceAlgoInTusdc.toFixed(6))}`)
    console.log(`  TUSDC → ALGO:      ${chalk.green(data.priceTusdcInAlgo.toFixed(6))}`)
    console.log(`  Reserve ALGO:      ${chalk.yellow(formatMicro(data.reserveAlgo))}`)
    console.log(`  Reserve TUSDC:     ${chalk.yellow(formatMicro(data.reserveTusdc))}`)
    console.log(`  Timestamp:         ${data.timestamp}\n`)
  })

program
  .command('pool')
  .description('Get full pool info')
  .action(async () => {
    const data = await api('/market/pool')
    console.log(chalk.bold('\n🐍 Slytherin DEX — Pool Info'))
    console.log(`  App ID:            ${chalk.cyan(data.appId)}`)
    console.log(`  App Address:       ${chalk.dim(data.appAddress)}`)
    console.log(`  Pair:              ${chalk.cyan(data.pair)}`)
    console.log(`  Fee:               ${chalk.yellow(data.feePercent + '%')}`)
    console.log(`  LP Token ID:       ${data.lpToken.id}`)
    console.log(`  Reserve ALGO:      ${chalk.green(formatMicro(data.assets.algo.reserve))} ALGO`)
    console.log(`  Reserve TUSDC:     ${chalk.green(formatMicro(data.assets.tusdc.reserve))} TUSDC`)
    console.log(`  Total LP:          ${formatMicro(data.lpToken.totalSupply)}`)
    console.log(`  TVL:               ${data.tvl.algo.toFixed(2)} ALGO / ${data.tvl.tusdc.toFixed(2)} TUSDC\n`)
  })

program
  .command('quote')
  .description('Get a swap quote')
  .requiredOption('-d, --direction <dir>', 'algo_to_asset or asset_to_algo')
  .requiredOption('-a, --amount <amount>', 'Amount in (human readable, e.g. 10.5)')
  .action(async (opts) => {
    const decimals = 6
    const microAmount = BigInt(Math.floor(parseFloat(opts.amount) * 10 ** decimals))
    const data = await api(`/swap/quote?direction=${opts.direction}&amountIn=${microAmount}`)

    console.log(chalk.bold('\n🐍 Slytherin DEX — Swap Quote'))
    console.log(`  Direction:         ${chalk.cyan(opts.direction)}`)
    console.log(`  Input:             ${chalk.yellow(formatMicro(data.amountIn))} ${data.assetIn}`)
    console.log(`  Output:            ${chalk.green(formatMicro(data.amountOut))} ${data.assetOut}`)
    console.log(`  Exchange Rate:     ${chalk.green(data.exchangeRate.toFixed(6))}`)
    console.log(`  Price Impact:      ${chalk.red(data.priceImpact.toFixed(4) + '%')}`)
    console.log(`  Fee:               ${formatMicro(data.fee)}\n`)
  })

program
  .command('swap')
  .description('Execute a swap (builds unsigned txns)')
  .requiredOption('-d, --direction <dir>', 'algo_to_asset or asset_to_algo')
  .requiredOption('-a, --amount <amount>', 'Amount in (human readable)')
  .requiredOption('-s, --sender <address>', 'Sender Algorand address')
  .option('--slippage <bps>', 'Slippage tolerance in bps (default: 100 = 1%)', '100')
  .action(async (opts) => {
    const decimals = 6
    const microAmount = BigInt(Math.floor(parseFloat(opts.amount) * 10 ** decimals)).toString()

    const data = await api('/swap/execute', 'POST', {
      sender: opts.sender,
      direction: opts.direction,
      amountIn: microAmount,
      slippageBps: parseInt(opts.slippage),
    })

    console.log(chalk.bold('\n🐍 Slytherin DEX — Swap Transaction Built'))
    console.log(`  Direction:         ${chalk.cyan(opts.direction)}`)
    console.log(`  Amount In:         ${chalk.yellow(opts.amount)}`)
    console.log(`  Min Output:        ${chalk.green(formatMicro(data.minOutput))}`)
    console.log(`  Transactions:      ${data.transactions.length} txn(s)`)
    console.log(chalk.dim(`\n  ${data.message}`))
    console.log(chalk.dim('\n  Unsigned transactions (base64):'))
    data.transactions.forEach((txn: string, i: number) => {
      console.log(`  [${i}] ${txn.slice(0, 60)}...`)
    })
    console.log()
  })

program
  .command('position')
  .description('Check LP position for an address')
  .requiredOption('-a, --address <address>', 'Algorand address')
  .action(async (opts) => {
    const data = await api(`/liquidity/position/${opts.address}`)

    console.log(chalk.bold('\n🐍 Slytherin DEX — LP Position'))
    console.log(`  Address:           ${chalk.dim(data.address)}`)
    console.log(`  LP Balance:        ${chalk.green(formatMicro(data.lpBalance))} SDLP`)
    console.log(`  Pool Share:        ${chalk.yellow(data.sharePercent.toFixed(2) + '%')}`)
    console.log(`  Est. ALGO:         ${chalk.green(formatMicro(data.estimatedAlgo))} ALGO`)
    console.log(`  Est. TUSDC:        ${chalk.green(formatMicro(data.estimatedAssetB))} TUSDC\n`)
  })

program
  .command('webhook')
  .description('Manage webhooks')
  .addCommand(
    new Command('register')
      .description('Register a webhook URL')
      .requiredOption('-u, --url <url>', 'Webhook URL')
      .option('-e, --events <events>', 'Comma-separated events', 'swap_confirmed,liquidity_changed')
      .action(async (opts) => {
        const data = await api('/webhooks/register', 'POST', {
          url: opts.url,
          events: opts.events.split(','),
        })
        console.log(chalk.bold('\n🐍 Webhook Registered'))
        console.log(`  ID:      ${chalk.cyan(data.id)}`)
        console.log(`  URL:     ${data.url}`)
        console.log(`  Events:  ${data.events.join(', ')}`)
        console.log(`  Secret:  ${chalk.yellow(data.secret)}`)
        console.log(chalk.dim('  ⚠ Store the secret. Used to verify payload signatures.\n'))
      }),
  )
  .addCommand(
    new Command('list')
      .description('List all webhooks')
      .action(async () => {
        const data = await api('/webhooks/list')
        if (data.webhooks.length === 0) {
          console.log(chalk.dim('\n  No webhooks registered.\n'))
          return
        }
        console.log(chalk.bold('\n🐍 Registered Webhooks'))
        for (const h of data.webhooks) {
          console.log(`  [${chalk.cyan(h.id)}] ${h.url} — ${h.events.join(', ')} (${h.active ? chalk.green('active') : chalk.red('inactive')})`)
        }
        console.log()
      }),
  )
  .addCommand(
    new Command('delete')
      .description('Delete a webhook')
      .requiredOption('-i, --id <id>', 'Webhook ID')
      .action(async (opts) => {
        await api(`/webhooks/${opts.id}`, 'DELETE')
        console.log(chalk.green('\n  Webhook deleted.\n'))
      }),
  )

program
  .command('health')
  .description('Check API health')
  .action(async () => {
    const data = await api('/health')
    console.log(chalk.bold('\n🐍 Slytherin DEX — Health'))
    console.log(`  Status:    ${chalk.green(data.status)}`)
    console.log(`  Version:   ${data.version}`)
    console.log(`  Uptime:    ${Math.floor(data.uptime)}s\n`)
  })

program.parse()
