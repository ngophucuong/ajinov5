const axios = require('axios')

const WORKER_URL =
  process.env.WORKER_URL || 'https://agent-gateway.ngophucuong.workers.dev'
const INTERNAL_SECRET =
  process.env.INTERNAL_SECRET || 'dev-secret-change-in-production'

/**
 * Get user state from Worker KV.
 * Returns state object or null if not found / error.
 */
async function getState(telegramId) {
  try {
    const res = await axios.get(
      `${WORKER_URL}/internal/kv/tgstate/${telegramId}`,
      {
        headers: { 'X-Internal-Secret': INTERNAL_SECRET },
        timeout: 3000,
      }
    )
    return res.data
  } catch {
    return null
  }
}

/**
 * Set user state in Worker KV.
 */
async function setState(telegramId, data) {
  try {
    await axios.put(
      `${WORKER_URL}/internal/kv/tgstate/${telegramId}`,
      data,
      {
        headers: {
          'X-Internal-Secret': INTERNAL_SECRET,
          'Content-Type': 'application/json',
        },
        timeout: 3000,
      }
    )
  } catch (e) {
    console.error('setState error:', e.message)
  }
}

/**
 * Clear user state from Worker KV.
 */
async function clearState(telegramId) {
  try {
    await axios.delete(
      `${WORKER_URL}/internal/kv/tgstate/${telegramId}`,
      {
        headers: { 'X-Internal-Secret': INTERNAL_SECRET },
        timeout: 3000,
      }
    )
  } catch (e) {
    console.error('clearState error:', e.message)
  }
}

module.exports = { getState, setState, clearState }
