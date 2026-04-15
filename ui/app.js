// ── Slytherin DEX Playground ──
const output = document.getElementById('output')

function setOutput(data) {
  output.textContent = JSON.stringify(data, null, 2)
}

function token() {
  return document.getElementById('token').value.trim()
}

function authHeaders() {
  return token() ? { Authorization: 'Bearer ' + token() } : {}
}

async function api(path, options) {
  options = options || {}
  const response = await fetch('/api/v1' + path, {
    method: options.method || 'GET',
    headers: Object.assign({ 'Content-Type': 'application/json' }, options.headers || {}),
    body: options.body || undefined,
  })
  const body = await response.json()
  if (!response.ok) throw body
  return body
}

// ── Reserves ──
document.getElementById('btnReserves').addEventListener('click', async function () {
  try {
    setOutput(await api('/market/reserves'))
  } catch (e) {
    setOutput(e)
  }
})

// ── Quote ──
document.getElementById('btnQuote').addEventListener('click', async function () {
  var direction = document.getElementById('direction').value
  var amountIn = document.getElementById('amountIn').value
  var slippageBps = document.getElementById('slippageBps').value
  try {
    setOutput(
      await api('/swap/quote?direction=' + direction + '&amountIn=' + amountIn + '&slippageBps=' + slippageBps)
    )
  } catch (e) {
    setOutput(e)
  }
})

// ── Execute Swap ──
document.getElementById('btnExecute').addEventListener('click', async function () {
  var sender = document.getElementById('sender').value
  var direction = document.getElementById('direction').value
  var amountIn = document.getElementById('amountIn').value
  var slippageBps = Number(document.getElementById('slippageBps').value)
  try {
    var data = await api('/swap/execute', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ sender: sender, direction: direction, amountIn: amountIn, slippageBps: slippageBps }),
    })
    document.getElementById('unsignedTxns').value = JSON.stringify(data.transactions, null, 2)
    setOutput(data)
  } catch (e) {
    setOutput(e)
  }
})

// ── Submit Signed ──
document.getElementById('btnSubmit').addEventListener('click', async function () {
  try {
    var signedTxns = JSON.parse(document.getElementById('signedTxns').value || '[]')
    var data = await api('/swap/submit', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ signedTxns: signedTxns }),
    })
    data.explorer = 'https://testnet.algoexplorer.io/tx/' + data.txId
    setOutput(data)
  } catch (e) {
    setOutput(e)
  }
})
