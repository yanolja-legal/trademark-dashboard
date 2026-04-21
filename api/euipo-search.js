/**
 * Vercel serverless function: /api/euipo-search
 *
 * Searches EUIPO for EU trademarks by applicant name.
 * Auth: OAuth2 Client Credentials (token cached at module level).
 * Search: RSQL query  applicants.name==*{name}*
 * Paginate: up to 5 pages × 100 results = 500 max records.
 */

export const config = { runtime: 'nodejs' }

const TOKEN_URL  = 'https://euipo.europa.eu/cas-server-webapp/oidc/accessToken'
const API_BASE   = 'https://api.euipo.europa.eu/trademark-search'
const PAGE_SIZE  = 100
const MAX_PAGES  = 5
const TIMEOUT_MS = 25000

// Module-level token cache — reused across warm Vercel instances
let _token = null, _tokenExpiry = 0

// ── helpers ───────────────────────────────────────────────────────────────────

async function fetchWithTimeout(url, options = {}) {
  const ctrl  = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal })
    clearTimeout(timer)
    return res
  } catch (err) {
    clearTimeout(timer)
    if (err.name === 'AbortError') throw new Error(`EUIPO request timed out after ${TIMEOUT_MS / 1000}s`)
    throw err
  }
}

async function getToken(clientId, clientSecret) {
  if (_token && Date.now() < _tokenExpiry - 60_000) return _token

  const res = await fetchWithTimeout(TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      grant_type:    'client_credentials',
      client_id:     clientId,
      client_secret: clientSecret,
      scope:         'uid',
    }),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error(`EUIPO token error: ${data.error_description || JSON.stringify(data)}`)

  _token       = data.access_token
  _tokenExpiry = Date.now() + (data.expires_in ?? 3600) * 1000
  return _token
}

async function fetchPage(token, clientId, rsqlQuery, page) {
  const params = new URLSearchParams({
    query: rsqlQuery,
    page:  String(page),
    size:  String(PAGE_SIZE),
  })
  const res = await fetchWithTimeout(`${API_BASE}/trademarks?${params}`, {
    headers: {
      Authorization:     `Bearer ${token}`,
      'X-IBM-Client-Id': clientId,
      Accept:            'application/json',
    },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`EUIPO HTTP ${res.status}: ${body.slice(0, 300)}`)
  }
  return res.json()
}

// ── mappers ───────────────────────────────────────────────────────────────────

function mapStatus(s) {
  if (!s) return 'Pending'
  if (s === 'REGISTERED' || s === 'ACCEPTED') return 'Active'
  if (['EXPIRED','CANCELLED','SURRENDERED','WITHDRAWN','REFUSED','REMOVED_FROM_REGISTER'].includes(s)) return 'Expired'
  if (s === 'OPPOSITION_PENDING' || s === 'CANCELLATION_PENDING') return 'Opposed'
  return 'Pending'
}

function mapFeature(f) {
  const map = { WORD:'Word', FIGURATIVE:'Figurative', SHAPE_3D:'3D Mark',
    COLOUR:'Colour', SOUND:'Sound', HOLOGRAM:'Hologram',
    POSITION:'Position', PATTERN:'Pattern', MOTION:'Motion',
    MULTIMEDIA:'Multimedia', OTHER:'Other' }
  return map[f] || f || 'Other'
}

function parseItem(tm, queryApplicant) {
  const applicant = tm.applicants?.[0]?.name || queryApplicant
  const ncl       = (tm.niceClasses || []).sort((a, b) => a - b).join(', ')
  return {
    id:               `euipo-${tm.applicationNumber}`,
    applicant,
    markName:         tm.wordMarkSpecification?.verbalElement || '—',
    registry:         'EUIPO',
    country:          'European Union',
    serialNo:         tm.applicationNumber || '',
    regNo:            tm.applicationNumber || '',
    kindOfMark:       mapFeature(tm.markFeature),
    ncl,
    applicationDate:  tm.applicationDate  || '',
    publicationDate:  '',
    registrationDate: tm.registrationDate || '',
    expiryDate:       tm.expiryDate       || '',
    status:           mapStatus(tm.status),
    source:           'live',
  }
}

// ── handler ───────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET')     return res.status(405).json({ error: 'Method not allowed' })

  const clientId     = process.env.EUIPO_CLIENT_ID
  const clientSecret = process.env.EUIPO_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    return res.status(200).json({
      status:  'pending',
      message: 'EUIPO_CLIENT_ID and EUIPO_CLIENT_SECRET are not configured.',
      results: [],
    })
  }

  // Debug mode — tests token + one search call
  if (req.query.debug === 'true') {
    try {
      const token     = await getToken(clientId, clientSecret)
      const searchUrl = `${API_BASE}/trademarks?` + new URLSearchParams({ query: 'applicants.name==*Yanolja*', page: '0', size: '5' })
      const searchRes = await fetchWithTimeout(searchUrl, {
        headers: { Authorization: `Bearer ${token}`, 'X-IBM-Client-Id': clientId, Accept: 'application/json' },
      })
      const searchBody = await searchRes.text()
      return res.status(200).json({
        tokenOk: true, searchUrl,
        searchStatus: searchRes.status,
        searchBody: searchBody.slice(0, 1000),
      })
    } catch (err) {
      return res.status(200).json({ error: err.message })
    }
  }

  const applicantName = (req.query.applicantName || '').trim()
  if (!applicantName) return res.status(400).json({ error: 'Missing required parameter: applicantName' })

  try {
    const token        = await getToken(clientId, clientSecret)
    const rsql         = `applicants.name==*${applicantName}*`
    const first        = await fetchPage(token, clientId, rsql, 0)
    const allItems     = [...first.trademarks]
    const pagesToFetch = Math.min(first.totalPages - 1, MAX_PAGES - 1)

    for (let p = 1; p <= pagesToFetch; p++) {
      try {
        const page = await fetchPage(token, clientId, rsql, p)
        allItems.push(...page.trademarks)
      } catch (err) {
        console.warn(`[euipo-search] page ${p} failed: ${err.message}`)
        break
      }
    }

    const results = allItems
      .map(tm => parseItem(tm, applicantName))
      .filter(r => r.serialNo || r.markName !== '—')

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=300')
    return res.status(200).json({ count: results.length, results })

  } catch (err) {
    console.error('[euipo-search]', err.message)
    return res.status(502).json({ error: 'Failed to fetch data from EUIPO.', detail: err.message })
  }
}
