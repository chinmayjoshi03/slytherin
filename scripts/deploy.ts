import 'dotenv/config'
import { execSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { deploy } from '../smart_contracts/amm_dex/deploy-config'

function parseSummary(output: string): { appId?: string; assetBId?: string; lpTokenId?: string } {
  const appId = output.match(/App ID:\s+(\d+)/)?.[1]
  const assetBId = output.match(/TestUSDC ID:\s+(\d+)/)?.[1]
  const lpTokenId = output.match(/LP Token ID:\s+(\d+)/)?.[1]
  return { appId, assetBId, lpTokenId }
}

function updateEnvFile(values: { appId?: string; assetBId?: string; lpTokenId?: string }): void {
  const envPath = path.resolve(process.cwd(), '.env')
  if (!fs.existsSync(envPath)) return

  let envContent = fs.readFileSync(envPath, 'utf8')
  const updates: Array<[string, string | undefined]> = [
    ['APP_ID', values.appId],
    ['ASSET_B_ID', values.assetBId],
    ['LP_TOKEN_ID', values.lpTokenId],
  ]

  for (const [key, value] of updates) {
    if (!value) continue
    if (new RegExp(`^${key}=`, 'm').test(envContent)) {
      envContent = envContent.replace(new RegExp(`^${key}=.*$`, 'm'), `${key}=${value}`)
    } else {
      envContent += `\n${key}=${value}`
    }
  }

  fs.writeFileSync(envPath, envContent.endsWith('\n') ? envContent : `${envContent}\n`)
}

async function main(): Promise<void> {
  console.log('Building contracts...')
  execSync('npm run build', { stdio: 'inherit' })

  console.log('Deploying AmmDex...')
  const logs: string[] = []
  const originalLog = console.log
  console.log = (...args: unknown[]) => {
    logs.push(args.map((a) => String(a)).join(' '))
    originalLog(...args)
  }

  try {
    await deploy()
  } finally {
    console.log = originalLog
  }

  const summary = parseSummary(logs.join('\n'))
  updateEnvFile(summary)

  console.log('\nDeployment complete.')
  if (summary.appId) console.log(`APP_ID=${summary.appId}`)
  if (summary.assetBId) console.log(`ASSET_B_ID=${summary.assetBId}`)
  if (summary.lpTokenId) console.log(`LP_TOKEN_ID=${summary.lpTokenId}`)
}

main().catch((err: Error) => {
  console.error('Deploy failed:', err.message)
  process.exit(1)
})
