/**
 * /api/euipo-test
 *
 * Diagnostic endpoint — runs the full EUIPO connection test step by step
 * and returns a structured JSON report so developers can pinpoint failures
 * without reading server logs.
 *
 * Returns:
 *   {
 *     step1_env_vars:   "present" | "missing: CLIENT_ID" | "missing: CLIENT_SECRET" | "missing: both"
 *     step2_token_url:  string
 *     step2_token:      "success" | "failed: {error}"
 *     step3_search_url: string | null
 *     step3_search:     "success" | "skipped (token failed)" | "failed: {error}"
 *     result_count:     number | null
 *     isSandbox:        boolean
 *     timestamp:        ISO string
 *   }
 */

export const config = { runtime: 'nodejs' }

const SANDBOX_TOKEN_URL = 'https://auth-sandbox.euipo.europa.eu/oidc/accessToken'
const PROD_TOKEN_URL    = 'https://auth.euipo.europa.eu/oidc/accessToken'
const SANDBOX_BASE      = 'https://api-sandbox.euipo.europa.eu/trademark-search'
const PROD_BASE         = 'https://api.euipo.europa.eu/trademark-search'

const TEST_SEARCH_TERM  = 'Yanolja'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(204).end()

  const report = {
    step1_env_vars:   null,
    step2_token_url:  null,
    step2_token:      null,
    step3_search_url: null,
    step3_search:     null,
    result_count:     null,
    isSandbox:        null,
    timestamp:        new Date().toISOString(),
  }

  // ── Step 1: Check env vars ─────────────────────────────────────────────────

  const clientId     = process.env.EUIPO_CLIENT_ID     ?? ''
  const clientSecret = process.env.EUIPO_CLIENT_SECRET ?? ''
  const isSandbox    = (process.env.EUIPO_ENV ?? 'production') === 'sandbox'

  report.isSandbox = isSandbox

  const missingId     = !clientId
  const missingSecret = !clientSecret

  if (missingId && missingSecret) {
    report.step1_env_vars = 'missing: both EUIPO_CLIENT_ID and EUIPO_CLIENT_SECRET'
  } else if (missingId) {
    report.step1_env_vars = 'missing: EUIPO_CLIENT_ID'
  } else if (missingSecret) {
    report.step1_env_vars = 'missing: EUIPO_CLIENT_SECRET'
  } else {
    report.step1_env_vars = 'present'
  }

  if (missingId || missingSecret) {
    report.step2_token  = 'skipped (env vars missing)'
    report.step3_search = 'skipped (env vars missing)'
    return res.status(200).json(report)
  }

  // ── Step 2: Request OAuth2 token ───────────────────────────────────────────

  const tokenUrl = isSandbox ? SANDBOX_TOKEN_URL : PROD_TOKEN_URL
  report.step2_token_url = tokenUrl

  let token = null

  try {
    const tokenRes = await fetch(tokenUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'client_credentials',
        client_id:     clientId,
        client_secret: clientSecret,
        scope:         'uid',
      }),
    })

    const rawBody = await tokenRes.text().catch(() => '(unreadable)')

    if (!tokenRes.ok) {
      report.step2_token = `failed: HTTP ${tokenRes.status} — ${rawBody.slice(0, 300)}`
      report.step3_search = 'skipped (token failed)'
      return res.status(200).json(report)
    }

    let parsed
    try {
      parsed = JSON.parse(rawBody)
    } catch {
      report.step2_token  = `failed: response not JSON — ${rawBody.slice(0, 200)}`
      report.step3_search = 'skipped (token failed)'
      return res.status(200).json(report)
    }

    if (!parsed.access_token) {
      report.step2_token  = `failed: missing access_token in response — keys: ${Object.keys(parsed).join(', ')}`
      report.step3_search = 'skipped (token failed)'
      return res.status(200).json(report)
    }

    token = parsed.access_token
    report.step2_token = `success (expires_in=${parsed.expires_in ?? '?'}s)`

  } catch (err) {
    report.step2_token  = `failed: network error — ${err.message}`
    report.step3_search = 'skipped (token failed)'
    return res.status(200).json(report)
  }

  // ── Step 3: Test trademark search ──────────────────────────────────────────

  const base   = isSandbox ? SANDBOX_BASE : PROD_BASE
  const rsql   = `applicants.name=="*${TEST_SEARCH_TERM}*"`
  const params = new URLSearchParams({
    query:  rsql,
    page:   '0',
    size:   '5',
    fields: 'applicationNumber,applicants,status',
  })
  const searchUrl = `${base}/trademarks?${params}`
  report.step3_search_url = searchUrl

  try {
    const searchRes = await fetch(searchUrl, {
      headers: {
        Authorization:    `Bearer ${token}`,
        'X-IBM-Client-Id': clientId,
        Accept:           'application/json',
      },
    })

    const rawBody = await searchRes.text().catch(() => '(unreadable)')

    if (!searchRes.ok) {
      report.step3_search = `failed: HTTP ${searchRes.status} — ${rawBody.slice(0, 300)}`
      return res.status(200).json(report)
    }

    let parsed
    try {
      parsed = JSON.parse(rawBody)
    } catch {
      report.step3_search = `failed: response not JSON — ${rawBody.slice(0, 200)}`
      return res.status(200).json(report)
    }

    const hits = parsed.trademarks ?? parsed.content ?? parsed.results ?? parsed.data ?? []
    const total = parsed.totalElements ?? parsed.total ?? parsed.totalResults ?? hits.length

    report.step3_search  = `success — totalElements: ${total}, page hits: ${hits.length}`
    report.result_count  = total

  } catch (err) {
    report.step3_search = `failed: network error — ${err.message}`
  }

  return res.status(200).json(report)
}
