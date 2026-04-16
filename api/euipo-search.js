/**
 * /api/euipo-search
 *
 * Searches the EUIPO Trademark Search API for marks by applicant/holder.
 * Uses OAuth2 client credentials flow with in-memory token caching.
 *
 * Env vars:
 *   EUIPO_CLIENT_ID      — OAuth2 client ID (also sent as X-IBM-Client-Id header)
 *   EUIPO_CLIENT_SECRET  — OAuth2 client secret
 *   EUIPO_ENV            — 'sandbox' (default) | 'production'
 *
 * Query params:
 *   ?holder=<name>              — search by applicant/holder name
 *   ?trademarkNumbers=A,B,C     — bypass: fetch specific marks by application number
 *
 * Returns 200 { status: 'pending', message } when credentials are absent.
 * Returns 200 { count, results[], isSandbox } on success.
 * Returns 4xx/5xx { error, detail, ... } with the raw upstream response body on failure.
 */

export const config = { runtime: 'nodejs' }

// ── endpoint constants ─────────────────────────────────────────────────────────

const SANDBOX_TOKEN_URL = 'https://auth-sandbox.euipo.europa.eu/oidc/accessToken'
const PROD_TOKEN_URL    = 'https://auth.euipo.europa.eu/oidc/accessToken'

const SANDBOX_API_BASE  = 'https://api-sandbox.euipo.europa.eu/trademark-search/trademarks'
const PROD_API_BASE     = 'https://api.euipo.europa.eu/trademark-search/trademarks'

const PAGE_SIZE = 50
const MAX_PAGES = 10

// ── in-memory token cache (persists across warm Vercel invocations) ────────────

let tokenCache = { token: null, expiresAt: 0 }

async function getToken(clientId, clientSecret, isSandbox) {
  const now      = Date.now()
  if (tokenCache.token && tokenCache.expiresAt > now + 60_000) {
    return tokenCache.token
  }

  const tokenUrl = isSandbox ? SANDBOX_TOKEN_URL : PROD_TOKEN_URL

  let res
  try {
    res = await fetch(tokenUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'client_credentials',
        client_id:     clientId,
        client_secret: clientSecret,
        scope:         'uid',
      }),
    })
  } catch (networkErr) {
    throw new Error(`OAuth2 token network error: ${networkErr.message}`)
  }

  const rawBody = await res.text().catch(() => '(unreadable)')

  if (!res.ok) {
    throw new Error(
      `OAuth2 token error (HTTP ${res.status}) from ${tokenUrl}: ${rawBody.slice(0, 500)}`
    )
  }

  let parsed
  try {
    parsed = JSON.parse(rawBody)
  } catch {
    throw new Error(`OAuth2 token response was not JSON: ${rawBody.slice(0, 300)}`)
  }

  if (!parsed.access_token) {
    throw new Error(`OAuth2 token response missing access_token: ${rawBody.slice(0, 300)}`)
  }

  const { access_token, expires_in = 28800 } = parsed
  tokenCache = { token: access_token, expiresAt: now + expires_in * 1_000 }
  return access_token
}

// ── result normalisation ───────────────────────────────────────────────────────

function mapStatus(raw) {
  const s = (raw || '').toLowerCase()
  if (s.includes('registered') || s === 'active')    return 'Active'
  if (s.includes('filed') || s.includes('pending'))  return 'Pending'
  if (s.includes('expir'))                            return 'Expired'
  if (s.includes('oppos'))                            return 'Opposed'
  if (s.includes('withdrawn') || s.includes('refus') || s.includes('cancel')) return 'Expired'
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase() : 'Unknown'
}

function extractNcl(tm) {
  const raw = tm.niceClasses ?? tm.niceClassList ?? tm.goodsAndServicesNiceClasses ?? []
  if (!Array.isArray(raw)) return String(raw || '')
  return raw.map(c => (typeof c === 'object' ? c.classNumber ?? c.number ?? c : c)).join(', ')
}

function normalise(tm) {
  const appNo = tm.applicationNumber || tm.applicationNum || tm.trademarkId || ''
  const regNo = tm.registrationNumber || tm.registrationNum || ''

  const name =
    tm.wordMark ??
    tm.markText ??
    tm.trademarkName ??
    tm.representation?.text ??
    (tm.markKind === 'Figurative' ? '[Figurative mark]' : '—')

  const applicant =
    tm.applicants?.[0]?.name ??
    tm.holders?.[0]?.name    ??
    tm.applicantName          ??
    tm.holderName             ??
    '—'

  return {
    id:               `euipo-${appNo || Math.random().toString(36).slice(2)}`,
    registry:         'EUIPO',
    country:          'European Union',
    applicant,
    markName:         name,
    serialNo:         appNo,
    regNo,
    kindOfMark:       tm.markKind ?? tm.trademarkKind ?? tm.markType ?? '—',
    ncl:              extractNcl(tm),
    applicationDate:  (tm.applicationDate  || '').slice(0, 10),
    publicationDate:  (tm.publicationDate  || '').slice(0, 10),
    registrationDate: (tm.registrationDate || '').slice(0, 10),
    expiryDate:       (tm.expiryDate       || '').slice(0, 10),
    status:           mapStatus(tm.trademarkStatus ?? tm.status ?? tm.markStatus),
  }
}

// ── holder name filtering ──────────────────────────────────────────────────────

/**
 * Strip common corporate designators to get the distinctive company name.
 * e.g. "Yanolja Co., Ltd." → "yanolja"
 *      "Go Global Travel Ltd." → "go global travel"
 */
function extractKeyword(companyName) {
  return companyName
    .replace(/\b(co\.|co|ltd\.?|limited|inc\.?|incorporated|pte\.?|pvt\.?|llc|l\.l\.c\.?|corp\.?|corporation|company|s\.a\.|b\.v\.|gmbh|ag|plc)\b\.?/gi, ' ')
    .replace(/[,\.\s]+/g, ' ')
    .trim()
    .toLowerCase()
}

/**
 * Returns true when every significant word from the search query
 * appears (case-insensitively) in the applicant/holder name returned
 * by the API — preventing unrelated results from leaking through.
 */
function holderMatchesQuery(applicant, searchQuery) {
  const keyword = extractKeyword(searchQuery)
  const target  = (applicant || '').toLowerCase()
  const words   = keyword.split(/\s+/).filter(w => w.length >= 2)
  if (words.length === 0) return true   // nothing to filter on — keep
  return words.every(w => target.includes(w))
}

// ── API search helper ──────────────────────────────────────────────────────────

async function euipoSearch(params, clientId, token, isSandbox) {
  const base = isSandbox ? SANDBOX_API_BASE : PROD_API_BASE
  const url  = `${base}?${new URLSearchParams(params)}`

  let res
  try {
    res = await fetch(url, {
      headers: {
        Authorization:    `Bearer ${token}`,
        'X-IBM-Client-Id': clientId,
        Accept:           'application/json',
      },
    })
  } catch (networkErr) {
    throw new Error(`EUIPO search network error: ${networkErr.message}`)
  }

  const rawBody = await res.text().catch(() => '(unreadable)')

  if (!res.ok) {
    throw new Error(
      `EUIPO search error (HTTP ${res.status}) from ${url}: ${rawBody.slice(0, 500)}`
    )
  }

  try {
    return JSON.parse(rawBody)
  } catch {
    throw new Error(`EUIPO search response was not JSON: ${rawBody.slice(0, 300)}`)
  }
}

// ── search strategies ──────────────────────────────────────────────────────────

async function searchByHolder(holder, clientId, token, isSandbox) {
  const results = []
  let start     = 0

  for (let page = 0; page < MAX_PAGES; page++) {
    const data = await euipoSearch(
      { q: holder, start: String(start), rows: String(PAGE_SIZE) },
      clientId, token, isSandbox
    )

    const hits = data.trademarks ?? data.results ?? data.data ?? []
    hits.forEach(tm => results.push(normalise(tm)))

    const total = data.totalResults ?? data.total ?? data.count ?? hits.length
    if (results.length >= total || hits.length < PAGE_SIZE) break
    start += PAGE_SIZE
  }

  // Strict filter: only keep records whose holder name actually matches
  // the subsidiary we searched for, preventing unrelated results
  return results.filter(r => holderMatchesQuery(r.applicant, holder))
}

async function fetchByNumbers(numbers, clientId, token, isSandbox) {
  const results = []
  for (const num of numbers) {
    try {
      const data = await euipoSearch(
        { applicationNumber: num.trim() },
        clientId, token, isSandbox
      )
      const hits = data.trademarks ?? data.results ?? data.data ?? []
      hits.forEach(tm => results.push(normalise(tm)))
    } catch {
      // individual lookup failure — skip and continue
    }
  }
  return results
}

// ── handler ────────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  const clientId     = process.env.EUIPO_CLIENT_ID     ?? ''
  const clientSecret = process.env.EUIPO_CLIENT_SECRET ?? ''
  const isSandbox    = (process.env.EUIPO_ENV ?? 'sandbox') !== 'production'

  // Surface env-var state for easier debugging
  const envDebug = {
    EUIPO_CLIENT_ID:     clientId     ? `set (${clientId.slice(0, 4)}…)`     : 'NOT SET',
    EUIPO_CLIENT_SECRET: clientSecret ? `set (${clientSecret.slice(0, 4)}…)` : 'NOT SET',
    EUIPO_ENV:           process.env.EUIPO_ENV ?? '(unset — defaulting to sandbox)',
    isSandbox,
    tokenEndpoint: isSandbox ? SANDBOX_TOKEN_URL : PROD_TOKEN_URL,
    searchEndpoint: isSandbox ? SANDBOX_API_BASE  : PROD_API_BASE,
  }

  // No credentials → pending state (renders as blue info badge in dashboard)
  if (!clientId || !clientSecret) {
    return res.status(200).json({
      status:   'pending',
      isSandbox,
      message:  'EUIPO credentials not configured. Add EUIPO_CLIENT_ID and EUIPO_CLIENT_SECRET to environment variables.',
      debug:    envDebug,
    })
  }

  const { holder, trademarkNumbers } = req.query

  try {
    const token = await getToken(clientId, clientSecret, isSandbox)

    if (trademarkNumbers) {
      const numbers = trademarkNumbers.split(',').map(s => s.trim()).filter(Boolean)
      if (numbers.length === 0) {
        return res.status(400).json({ error: 'trademarkNumbers must be a comma-separated list' })
      }
      const results = await fetchByNumbers(numbers, clientId, token, isSandbox)
      return res.status(200).json({ count: results.length, results, isSandbox })
    }

    if (!holder) {
      return res.status(400).json({ error: 'Missing required parameter: holder or trademarkNumbers' })
    }

    const results = await searchByHolder(holder, clientId, token, isSandbox)
    return res.status(200).json({ count: results.length, results, isSandbox })

  } catch (err) {
    // Invalidate token cache on any auth failure so the next request retries
    if (err.message.includes('OAuth2 token')) {
      tokenCache = { token: null, expiresAt: 0 }
      return res.status(502).json({
        error:    'EUIPO authentication failed',
        detail:   err.message,
        debug:    envDebug,
        workaround: 'Verify EUIPO_CLIENT_ID and EUIPO_CLIENT_SECRET are correct and the token endpoint is reachable.',
      })
    }
    return res.status(500).json({
      error:  err.message,
      debug:  envDebug,
    })
  }
}
