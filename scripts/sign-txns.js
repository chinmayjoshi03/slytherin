#!/usr/bin/env node
require('dotenv').config()
const fs = require('node:fs')
const algosdk = require('algosdk')

function readInput() {
  const argPath = process.argv[2]
  if (argPath) {
    return fs.readFileSync(argPath, 'utf8')
  }
  return fs.readFileSync(0, 'utf8')
}

function main() {
  const mnemonic = process.env.DEPLOYER_MNEMONIC
  if (!mnemonic) {
    throw new Error('DEPLOYER_MNEMONIC missing in .env')
  }

  const raw = readInput().trim()
  if (!raw) {
    throw new Error('No input provided. Pass execute JSON file path or pipe JSON via stdin.')
  }

  const payload = JSON.parse(raw)
  if (!Array.isArray(payload.transactions) || payload.transactions.length === 0) {
    throw new Error('Input must include a non-empty transactions[] array from /swap/execute')
  }

  const account = algosdk.mnemonicToSecretKey(mnemonic)
  const signedTxns = payload.transactions.map((txnB64) => {
    const unsignedTxn = algosdk.decodeUnsignedTransaction(Buffer.from(txnB64, 'base64'))
    return Buffer.from(unsignedTxn.signTxn(account.sk)).toString('base64')
  })

  const output = { signedTxns }
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`)
}

try {
  main()
} catch (err) {
  console.error(`sign-txns error: ${err.message}`)
  process.exit(1)
}
