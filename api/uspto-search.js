/**
 * Vercel serverless function: /api/uspto-search
 *
 * Searches USPTO trademarks by owner/company name via the Marker API.
 * Automatically follows pagination and caches results per owner for 24 hours
 * to stay within the 1,000 free searches/month limit.
 *
 * Env vars:
 *   MARKER_API_USERNAME  — Marker API account username
 *   MARKER_API_PASSWORD  — Marker API account password
 *
 * Query params:
 *   ?owner=<name>  — owner/company name to search
 *
 * Returns 200 { status: 'pending', message } when credentials are absent.
 * Returns 200 { count, results[], cached? } on success.
 * Returns 502 { error, detail } on upstream failure.
 *
 * Marker API endpoint:
 *   GET https://markerapi.com/api/v2/trademarks/owner/{owner}/status/all
 *       /start/{start}/username/{user}/password/{pass}
 */

export const config = { runtime: 'nodejs' }

// ── constants ─────────────────────────────────────────────────────────────────

const MARKER_BASE  = 'https://markerapi.com/api/v2/trademarks/owner'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000   // 24 hours
const MAX_PAGES    = 20                      // safety ceiling

// ── in-memory cache (survives warm Vercel invocations) ────────────────────────
// Map<ownerKey, { results: object[], expiresAt: number }>

const cache = new Map()

// ── helpers ───────────────────────────────────────────────────────────────────

function mapStatus(raw) {
  const s = (raw || '').toLowerCase()
  if (s.includes('registered') || s === 'live')                               return 'Active'
  if (s.includes('pending') || s.includes('filed') || s.includes('publish'))  return 'Pending'
  if (s.includes('abandon') || s.includes('cancel') ||
      s.includes('dead')    || s.includes('expired'))                          return 'Expired'
  if (s.includes('oppos')   || s.includes('refus'))                            return 'Opposed'
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase() : 'Unknown'
}

/** Normalise common date formats to ISO YYYY-MM-DD. */
function isoDate(raw) {
  if (!raw) return ''
  // Already ISO: 2019-03-12 or 2019-03-12T...
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10)
  // MM/DD/YYYY
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`
  return ''
}

function normalise(tm) {
  const serialNo = String(tm.serialnumber ?? tm.serialNumber ?? '')
  return {
    id               : `uspto-${serialNo || Math.random().toString(36).slice(2)}`,
    registry         : 'USPTO',
    country          : 'United States',
    applicant        : tm.owner        ?? '—',
    markName         : tm.wordmark     ?? tm.wordMark ?? '—',
    serialNo,
    regNo            : String(tm.registrationnumber ?? tm.registrationNumber ?? ''),
    ncl              : String(tm.code  ?? ''),
    applicationDate  : isoDate(String(tm.filingdate      ?? tm.filingDate      ?? '')),
    registrationDate : isoDate(String(tm.registrationdate ?? tm.registrationDate ?? '')),
    status           : mapStatus(String(tm.status ?? '')),
    description      : String(tm.description ?? ''),
  }
}

// ── Marker API pagination ─────────────────────────────────────────────────────

async function fetchAllPages(owner, username, password) {
  const enc     = s => encodeURIComponent(s)
  const results = []
  let start     = 1

  for (let page = 0; page < MAX_PAGES; page++) {
    const url       = `${MARKER_BASE}/${enc(owner)}/status/all/start/${start}/username/${enc(username)}/password/${enc(password)}`
    const maskedUrl = `${MARKER_BASE}/${enc(owner)}/status/all/start/${start}/username/${enc(username)}/password/***`

    console.log(`[uspto-search] page=${page + 1} owner="${owner}" start=${start}`)
    console.log(`[uspto-search] GET ${maskedUrl}`)

    let res
    try {
      res = await fetch(url, { headers: { Accept: 'application/json' } })
    } catch (err) {
      console.error(`[uspto-search] Network error: ${err.message}`)
      throw new Error(`Marker API network error: ${err.message}`)
    }

    console.log(`[uspto-search] HTTP ${res.status} ${res.statusText}`)

    const rawBody = await res.text().catch(() => '(unreadable)')

    if (!res.ok) {
      console.error(`[uspto-search] Error body: ${rawBody}`)
      throw new Error(`HTTP ${res.status} ${res.statusText} — ${rawBody.slice(0, 400)}`)
    }

    console.log(`[uspto-search] Response preview: ${rawBody.slice(0, 300)}`)

    let json
    try {
      json = JSON.parse(rawBody)
    } catch {
      console.error(`[uspto-search] Response is not JSON: ${rawBody.slice(0, 300)}`)
      throw new Error(`Response was not JSON (HTTP 200) — ${rawBody.slice(0, 300)}`)
    }

    const trademarks = json.trademarks ?? json.results ?? json.data ?? []
    if (Array.isArray(trademarks)) {
      trademarks.forEach(tm => results.push(normalise(tm)))
      console.log(`[uspto-search] page=${page + 1} parsed ${trademarks.length} trademarks (running total: ${results.length})`)
    } else {
      console.log(`[uspto-search] page=${page + 1} unexpected shape — top-level keys: ${Object.keys(json).join(', ')}`)
    }

    // Follow pagination: `next` is the start index for the next page
    const next = json.next
    if (next && Number(next) > start) {
      start = Number(next)
    } else {
      console.log(`[uspto-search] pagination done — no next page (next=${next})`)
      break
    }
  }

  return results
}

// ── handler ───────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET')     return res.status(405).json({ error: 'Method not allowed' })

  const username = process.env.MARKER_API_USERNAME ?? ''
  const password = process.env.MARKER_API_PASSWORD ?? ''

  console.log(`[uspto-search] credentials configured: username=${username ? 'YES' : 'MISSING'} password=${password ? 'YES' : 'MISSING'}`)

  if (!username || !password) {
    return res.status(200).json({
      status  : 'pending',
      message : 'Marker API credentials not configured. Add MARKER_API_USERNAME and MARKER_API_PASSWORD to environment variables.',
    })
  }

  const owner = (req.query.owner || '').trim()
  if (!owner) {
    return res.status(400).json({ error: 'Missing required query parameter: owner' })
  }

  console.log(`[uspto-search] request for owner="${owner}"`)

  // ── Cache lookup ────────────────────────────────────────────────────────────
  const cacheKey = owner.toLowerCase()
  const cached   = cache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    console.log(`[uspto-search] cache hit for "${owner}" (${cached.results.length} results)`)
    return res.status(200).json({
      count   : cached.results.length,
      results : cached.results,
      cached  : true,
    })
  }

  // ── Fetch ───────────────────────────────────────────────────────────────────
  try {
    const results = await fetchAllPages(owner, username, password)

    console.log(`[uspto-search] SUCCESS "${owner}" — ${results.length} total results`)
    cache.set(cacheKey, { results, expiresAt: Date.now() + CACHE_TTL_MS })

    return res.status(200).json({ count: results.length, results })

  } catch (err) {
    console.error(`[uspto-search] FAILED for owner="${owner}": ${err.message}`)
    return res.status(502).json({
      error  : `Marker API request failed: ${err.message}`,
      detail : err.message,
    })
  }
}
