/**
 * /api/euipo-search
 *
 * Searches the EUIPO Trademark Search API for marks by applicant name.
 * Uses OAuth2 client credentials flow with in-memory token caching.
 * Uses RSQL query language as per the official EUIPO OpenAPI spec.
 *
 * Env vars:
 *   EUIPO_CLIENT_ID      — OAuth2 client ID (also sent as X-IBM-Client-Id header)
 *   EUIPO_CLIENT_SECRET  — OAuth2 client secret
 *   EUIPO_ENV            — 'production' (default) | 'sandbox'
 *
 * Query params:
 *   ?holder=<searchKey>          — search by applicant name (partial match)
 *   ?trademarkNumbers=A,B,C      — bypass: fetch specific marks by application number
 *
 * Returns 200 { status: 'pending', message } when credentials are absent.
 * Returns 200 { count, results[], isSandbox } on success.
 * Returns 4xx/5xx { error, detail, ... } on failure.
 */

export const config = { runtime: 'nodejs' }

// ── Endpoint constants ─────────────────────────────────────────────────────────

const SANDBOX_TOKEN_URL = 'https://auth-sandbox.euipo.europa.eu/oidc/accessToken'
const PROD_TOKEN_URL    = 'https://auth.euipo.europa.eu/oidc/accessToken'

const SANDBOX_BASE = 'https://api-sandbox.euipo.europa.eu/trademark-search'
const PROD_BASE    = 'https://api.euipo.europa.eu/trademark-search'

const PAGE_SIZE = 100
const MAX_PAGES = 5   // max pages per search to avoid rate limiting

// Fields to request — keeps response payload small
const FIELDS = [
  'applicationNumber',
  'wordMarkSpecification',
  'applicants',
  'applicationDate',
  'registrationDate',
  'expiryDate',
  'status',
  'niceClasses',
  'markFeature',
  'markKind',
  'publications',
].join(',')

// ── In-memory token cache (persists across warm Vercel invocations) ────────────

let tokenCache = { token: null, expiresAt: 0, env: null }

async function getToken(clientId, clientSecret, isSandbox) {
  const now = Date.now()
  const env = isSandbox ? 'sandbox' : 'production'
  if (tokenCache.token && tokenCache.expiresAt > now + 60_000 && tokenCache.env === env) {
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
  tokenCache = {
    token:     access_token,
    expiresAt: now + expires_in * 1_000,
    env,
  }
  return access_token
}

// ── Result normalisation ───────────────────────────────────────────────────────

function mapStatus(raw) {
  const s = (raw || '').toLowerCase()
  if (s.includes('registered') || s === 'active')               return 'Active'
  if (s.includes('filed') || s.includes('pending'))             return 'Pending'
  if (s.includes('expir'))                                       return 'Expired'
  if (s.includes('oppos'))                                       return 'Opposed'
  if (s.includes('withdrawn') || s.includes('refus') || s.includes('cancel')) return 'Expired'
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase() : 'Unknown'
}

function extractNcl(tm) {
  const raw = tm.niceClasses ?? []
  if (!Array.isArray(raw)) return String(raw || '')
  return raw
    .map(c => (typeof c === 'object' ? c.classNumber ?? c.number ?? c : c))
    .join(', ')
}

function normalise(tm) {
  const appNo = tm.applicationNumber ?? ''

  // wordMarkSpecification.verbalElement is the mark text for word marks
  const markName =
    tm.wordMarkSpecification?.verbalElement ??
    tm.wordMark ??
    tm.markText ??
    (tm.markFeature === 'FIGURATIVE' || tm.markKind === 'Figurative'
      ? '[Figurative mark]'
      : '—')

  const applicant =
    tm.applicants?.[0]?.name ??
    tm.holders?.[0]?.name    ??
    '—'

  // publications: use first entry's publicationDate
  const publicationDate = tm.publications?.[0]?.publicationDate ?? ''

  return {
    id:               `euipo-${appNo || Math.random().toString(36).slice(2)}`,
    registry:         'EUIPO',
    country:          'European Union (EUIPO)',
    applicant,
    markName,
    serialNo:         String(appNo),
    regNo:            String(appNo),    // EUIPO uses application number as the primary identifier
    kindOfMark:       tm.markKind    ?? '—',
    markFeature:      tm.markFeature ?? '—',
    ncl:              extractNcl(tm),
    applicationDate:  (tm.applicationDate  || '').slice(0, 10),
    publicationDate:  (publicationDate     || '').slice(0, 10),
    registrationDate: (tm.registrationDate || '').slice(0, 10),
    expiryDate:       (tm.expiryDate       || '').slice(0, 10),
    status:           mapStatus(tm.status ?? ''),
  }
}

// ── Low-level fetch helper ─────────────────────────────────────────────────────

async function euipoFetch(url, clientId, token) {
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
    throw new Error(`EUIPO network error: ${networkErr.message}`)
  }

  const rawBody = await res.text().catch(() => '(unreadable)')

  if (res.status === 401) {
    // Invalidate token so next call re-authenticates
    tokenCache = { token: null, expiresAt: 0, env: null }
    throw new Error(`EUIPO 401 Unauthorized — token expired or invalid credentials`)
  }
  if (res.status === 403) {
    throw new Error(`EUIPO 403 Forbidden — not subscribed to this API plan or IP not whitelisted`)
  }
  if (res.status === 429) {
    throw new Error(`EUIPO 429 Too Many Requests — rate limit exceeded, try again later`)
  }
  if (!res.ok) {
    throw new Error(`EUIPO HTTP ${res.status} from ${url}: ${rawBody.slice(0, 500)}`)
  }

  try {
    return JSON.parse(rawBody)
  } catch {
    throw new Error(`EUIPO response was not JSON: ${rawBody.slice(0, 300)}`)
  }
}

// ── Search strategies ──────────────────────────────────────────────────────────

/**
 * Search by applicant name using RSQL wildcard matching.
 * e.g. term = "Yanolja Cloud" → query=applicants.name=="*Yanolja Cloud*"
 */
async function searchByHolder(term, clientId, token, isSandbox) {
  const base    = isSandbox ? SANDBOX_BASE : PROD_BASE
  const results = []

  // RSQL query with wildcards for partial name matching
  const rsql = `applicants.name=="*${term}*"`

  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({
      query:  rsql,
      page:   String(page),
      size:   String(PAGE_SIZE),
      fields: FIELDS,
    })
    const url  = `${base}/trademarks?${params}`
    const data = await euipoFetch(url, clientId, token)

    const hits = data.trademarks ?? data.content ?? data.results ?? data.data ?? []
    hits.forEach(tm => results.push(normalise(tm)))

    const totalElements = data.totalElements ?? data.total ?? data.totalResults ?? null
    const totalPages    = data.totalPages    ?? (totalElements !== null ? Math.ceil(totalElements / PAGE_SIZE) : 1)

    if (hits.length < PAGE_SIZE || page + 1 >= totalPages) break
  }

  // Post-filter: keep only records where applicant name contains the search term
  const termLower = term.toLowerCase()
  return results.filter(r => (r.applicant || '').toLowerCase().includes(termLower))
}

/**
 * Fetch specific marks by application number.
 * Uses RSQL: applicationNumber=="{num}"
 */
async function fetchByNumbers(numbers, clientId, token, isSandbox) {
  const base    = isSandbox ? SANDBOX_BASE : PROD_BASE
  const results = []

  for (const num of numbers) {
    try {
      const params = new URLSearchParams({
        query:  `applicationNumber=="${num.trim()}"`,
        page:   '0',
        size:   '10',
        fields: FIELDS,
      })
      const url  = `${base}/trademarks?${params}`
      const data = await euipoFetch(url, clientId, token)
      const hits = data.trademarks ?? data.content ?? data.results ?? data.data ?? []
      hits.forEach(tm => results.push(normalise(tm)))
    } catch {
      // individual lookup failure — skip and continue
    }
  }
  return results
}

// ── Handler ────────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  const clientId     = process.env.EUIPO_CLIENT_ID     ?? ''
  const clientSecret = process.env.EUIPO_CLIENT_SECRET ?? ''
  const isSandbox    = (process.env.EUIPO_ENV ?? 'production') === 'sandbox'

  const envDebug = {
    EUIPO_CLIENT_ID:     clientId     ? `set (${clientId.slice(0, 4)}…)`     : 'NOT SET',
    EUIPO_CLIENT_SECRET: clientSecret ? `set (${clientSecret.slice(0, 4)}…)` : 'NOT SET',
    EUIPO_ENV:           process.env.EUIPO_ENV ?? '(unset — defaulting to production)',
    isSandbox,
    tokenEndpoint: isSandbox ? SANDBOX_TOKEN_URL : PROD_TOKEN_URL,
    searchBase:    isSandbox ? SANDBOX_BASE       : PROD_BASE,
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
    if (err.message.includes('OAuth2 token') || err.message.includes('401')) {
      tokenCache = { token: null, expiresAt: 0, env: null }
      return res.status(502).json({
        error:      'EUIPO authentication failed',
        detail:     err.message,
        debug:      envDebug,
        workaround: 'Verify EUIPO_CLIENT_ID and EUIPO_CLIENT_SECRET are correct.',
      })
    }
    if (err.message.includes('403')) {
      return res.status(403).json({
        error:  'EUIPO API access denied',
        detail: err.message,
        debug:  envDebug,
      })
    }
    if (err.message.includes('429')) {
      return res.status(429).json({
        error:  'EUIPO rate limit exceeded',
        detail: err.message,
        debug:  envDebug,
      })
    }
    return res.status(500).json({
      error:  err.message,
      debug:  envDebug,
    })
  }
}
