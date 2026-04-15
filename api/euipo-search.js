/**
 * /api/euipo-search
 *
 * Searches the EUIPO Open Data (COPLA) trademark API for marks by applicant/holder.
 * Uses OAuth2 client credentials flow with in-memory token caching.
 *
 * Env vars:
 *   EUIPO_CLIENT_ID      — OAuth2 client ID
 *   EUIPO_CLIENT_SECRET  — OAuth2 client secret
 *   EUIPO_ENV            — 'sandbox' (default) | 'production'
 *
 * Query params:
 *   ?holder=<name>              — search by applicant/holder name
 *   ?trademarkNumbers=A,B,C     — bypass: fetch specific marks by application number
 *
 * Returns 200 { status: 'pending', message } when credentials are absent.
 * Returns 200 { count, results[] } on success.
 */

export const config = { runtime: 'nodejs' }

// ── constants ──────────────────────────────────────────────────────────────────

const PROD_API_BASE    = 'https://euipo.europa.eu/copla/trademark/data/v1'
const SANDBOX_API_BASE = 'https://euipo.europa.eu/copla/trademark/data/v1'   // same host, sandbox uses test credentials
const TOKEN_URL        = 'https://euipo.europa.eu/idm2/oauth/token'
const PAGE_SIZE        = 50
const MAX_PAGES        = 10     // hard cap to prevent runaway pagination

// ── in-memory token cache (persists across warm Vercel invocations) ────────────

let tokenCache = { token: null, expiresAt: 0 }

async function getToken(clientId, clientSecret) {
  const now = Date.now()
  if (tokenCache.token && tokenCache.expiresAt > now + 60_000) {
    return tokenCache.token
  }

  const res = await fetch(TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'client_credentials',
      client_id:     clientId,
      client_secret: clientSecret,
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`OAuth2 token error (${res.status}): ${text.slice(0, 300)}`)
  }

  const { access_token, expires_in = 28800 } = await res.json()
  tokenCache = { token: access_token, expiresAt: now + expires_in * 1_000 }
  return access_token
}

// ── result normalisation ───────────────────────────────────────────────────────

function mapStatus(raw) {
  const s = (raw || '').toLowerCase()
  if (s.includes('registered') || s === 'active')   return 'Active'
  if (s.includes('filed') || s.includes('pending')) return 'Pending'
  if (s.includes('expir'))                           return 'Expired'
  if (s.includes('oppos'))                           return 'Opposed'
  if (s.includes('withdrawn') || s.includes('refuse') || s.includes('cancel')) return 'Expired'
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase() : 'Unknown'
}

function extractNcl(tm) {
  // EUIPO API may return niceClasses as array of numbers or objects
  const raw = tm.niceClasses ?? tm.niceClassList ?? tm.goodsAndServicesNiceClasses ?? []
  if (!Array.isArray(raw)) return String(raw || '')
  return raw.map(c => (typeof c === 'object' ? c.classNumber ?? c.number ?? c : c)).join(', ')
}

function normalise(tm, isSandbox) {
  // EUIPO returns slightly different shapes from different API versions — handle both
  const appNo  = tm.applicationNumber || tm.applicationNum || tm.trademarkId || ''
  const regNo  = tm.registrationNumber || tm.registrationNum || ''
  const name   =
    tm.wordMark ??
    tm.markText ??
    tm.trademarkName ??
    tm.representation?.text ??
    (tm.markKind === 'Figurative' ? '[Figurative mark]' : '—')

  const applicant =
    (tm.applicants?.[0]?.name) ??
    (tm.holders?.[0]?.name) ??
    tm.applicantName ??
    tm.holderName ??
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
    isSandbox,
  }
}

// ── API helpers ────────────────────────────────────────────────────────────────

async function euipoGet(path, token, isSandbox) {
  const base = isSandbox ? SANDBOX_API_BASE : PROD_API_BASE
  const res  = await fetch(`${base}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept:        'application/json',
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`EUIPO API error (${res.status}): ${text.slice(0, 300)}`)
  }
  return res.json()
}

// ── search strategies ──────────────────────────────────────────────────────────

async function searchByHolder(holder, token, isSandbox) {
  const results = []
  let start     = 0

  for (let page = 0; page < MAX_PAGES; page++) {
    const qs   = new URLSearchParams({
      'applicant.name': holder,
      start:            String(start),
      rows:             String(PAGE_SIZE),
    })
    const data = await euipoGet(`/trademarks?${qs}`, token, isSandbox)

    const hits  = data.trademarks ?? data.results ?? data.data ?? []
    hits.forEach(tm => results.push(normalise(tm, isSandbox)))

    const total = data.totalResults ?? data.total ?? data.count ?? hits.length
    if (results.length >= total || hits.length < PAGE_SIZE) break
    start += PAGE_SIZE
  }

  return results
}

async function fetchByNumbers(numbers, token, isSandbox) {
  const results = []
  for (const num of numbers) {
    try {
      const data = await euipoGet(`/trademarks/${encodeURIComponent(num.trim())}`, token, isSandbox)
      const tm   = data.trademark ?? data.result ?? data
      if (tm && (tm.applicationNumber || tm.trademarkId)) {
        results.push(normalise(tm, isSandbox))
      }
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

  // No credentials → pending state (renders as blue info badge in dashboard)
  if (!clientId || !clientSecret) {
    return res.status(200).json({
      status:  'pending',
      message: 'EUIPO credentials not configured. Add EUIPO_CLIENT_ID and EUIPO_CLIENT_SECRET to environment variables.',
    })
  }

  const { holder, trademarkNumbers } = req.query

  try {
    const token = await getToken(clientId, clientSecret)

    // Bypass mode: look up specific application numbers directly
    if (trademarkNumbers) {
      const numbers = trademarkNumbers.split(',').map(s => s.trim()).filter(Boolean)
      if (numbers.length === 0) {
        return res.status(400).json({ error: 'trademarkNumbers must be a comma-separated list' })
      }
      const results = await fetchByNumbers(numbers, token, isSandbox)
      return res.status(200).json({ count: results.length, results, isSandbox })
    }

    if (!holder) {
      return res.status(400).json({ error: 'Missing required parameter: holder or trademarkNumbers' })
    }

    const results = await searchByHolder(holder, token, isSandbox)
    return res.status(200).json({ count: results.length, results, isSandbox })

  } catch (err) {
    // Distinguish OAuth token errors from search errors
    if (err.message.startsWith('OAuth2 token error')) {
      tokenCache = { token: null, expiresAt: 0 }   // invalidate cache on auth failure
      return res.status(502).json({
        error:      'EUIPO authentication failed',
        detail:     err.message,
        workaround: 'Verify EUIPO_CLIENT_ID and EUIPO_CLIENT_SECRET are correct.',
      })
    }
    return res.status(500).json({ error: err.message })
  }
}
