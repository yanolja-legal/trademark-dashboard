/**
 * Vercel serverless function: /api/ipindia-search
 *
 * Retrieves trademark records from IP India for a given applicant/holder name.
 *
 * ── Registry notes ────────────────────────────────────────────────────────────
 *  URL:  https://tmrsearch.ipindia.gov.in/ESEARCH/
 *  Auth: None required — publicly accessible
 *  Speed: 10–30 seconds per request due to registry infrastructure
 *
 * ── Access strategy ───────────────────────────────────────────────────────────
 *  IP India uses ASP.NET WebForms.  The only publicly accessible search is the
 *  HTML form at the ESEARCH URL.  No documented REST API exists.
 *
 *  Step 1 — GET the form page to extract ASP.NET tokens and session cookie:
 *    __VIEWSTATE, __VIEWSTATEGENERATOR, __EVENTVALIDATION
 *  Step 2 — POST back with applicant name in the search type = "Applicant Name"
 *    field, preserving the session cookie from Step 1.
 *  Step 3 — Parse the GridView HTML table in the response.
 *
 *  The form field names vary across deployments.  We detect them dynamically
 *  from the page HTML (look for the <select> with an "Applicant" option, and
 *  the first non-captcha text input).  If detection fails we try fixed fallbacks.
 *
 * ── Bypass ────────────────────────────────────────────────────────────────────
 *  ?applicationNumbers=1234567,2345678  — skips the search step; fetches each
 *  application's detail page directly at
 *  https://tmrsearch.ipindia.gov.in/eSearch/Application_View.aspx?AppNo=XXXXXXX
 *
 * ── Status mapping ────────────────────────────────────────────────────────────
 *  "Registered"                          → Active
 *  "Accepted [& Advertised]"             → Pending
 *  "Advertised Before Acceptance"        → Pending
 *  "Formalities Chk Pass"                → Pending
 *  "Send Back for Examination"           → Pending
 *  "Objected"                            → Opposed + ipIndiaAlert (OBJECTED)
 *  "Opposed"                             → Opposed + ipIndiaAlert (OPPOSED)
 *  "Abandoned" / "Removed" / "Refused"   → Expired
 *
 *  Records flagged with ipIndiaAlert require active monitoring — India has
 *  notorious trademark backlogs and status changes happen without notice.
 */

// ── constants ─────────────────────────────────────────────────────────────────

import { normaliseTrademarkData } from '../src/normalise.js'

const ESEARCH_URL    = 'https://tmrsearch.ipindia.gov.in/ESEARCH/'
const DETAIL_BASE    = 'https://tmrsearch.ipindia.gov.in/eSearch/Application_View.aspx'
const TIMEOUT_MS     = 35_000    // IP India can be very slow
const MAX_RECORDS    = 200

const BROWSER_HEADERS = {
  'User-Agent'     : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept'         : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control'  : 'no-cache',
}

const enc = s => encodeURIComponent(s)

// ── date helpers ──────────────────────────────────────────────────────────────

/** ISO YYYY-MM-DD from DD/MM/YYYY, DD-MM-YYYY, or YYYY-MM-DD. */
function isoDate(raw) {
  if (!raw) return ''
  const s = raw.trim()
  const dmy  = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (dmy)  return `${dmy[3]}-${dmy[2]}-${dmy[1]}`
  const dmy2 = s.match(/^(\d{2})-(\d{2})-(\d{4})$/)
  if (dmy2) return `${dmy2[3]}-${dmy2[2]}-${dmy2[1]}`
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  return ''
}

// ── status / kind mapping ─────────────────────────────────────────────────────

function mapStatus(raw) {
  const s = (raw || '').toLowerCase().trim()
  if (s.includes('registered'))                                         return 'Active'
  if (s.includes('objected') || s.includes('oppos'))                   return 'Opposed'
  if (s.includes('abandon') || s.includes('remov') ||
      s.includes('refus')   || s.includes('expir') ||
      s.includes('cancel'))                                             return 'Expired'
  // Anything else (accepted, advertised, formalities, send back, etc.) → Pending
  return 'Pending'
}

function mapKind(raw) {
  const s = (raw || '').toLowerCase()
  if (s.includes('word') || s.includes('verbal'))                      return 'Word'
  if (s.includes('device') || s.includes('logo') || s.includes('figur')) return 'Device'
  if (s.includes('combin') || s.includes('composite'))                 return 'Combined'
  if (s.includes('colour') || s.includes('color'))                     return 'Colour'
  if (s.includes('3d'))                                                 return '3D'
  if (s.includes('sound'))                                              return 'Sound'
  return 'Word'   // most IP India marks are word marks
}

/**
 * Build an ipIndiaAlert object for Objected / Opposed marks.
 * Returns null for all other statuses.
 */
function buildAlert(rawStatus) {
  const s = (rawStatus || '').toLowerCase().trim()
  if (s.includes('objected')) {
    return {
      rawStatus: 'Objected',
      message  : 'Examiner has raised objections. A response is required within the statutory deadline. '
               + 'IP India has significant processing backlogs — status changes occur without proactive notice.',
    }
  }
  if (s.includes('oppos')) {
    return {
      rawStatus: 'Opposed',
      message  : 'A third-party opposition has been filed. The proceeding is pending resolution. '
               + 'IP India opposition proceedings can take years — active monitoring is critical as '
               + 'hearing notices and decisions are not always communicated promptly.',
    }
  }
  return null
}

// ── HTML form extraction ──────────────────────────────────────────────────────

/** Extract all hidden <input> fields as { name: value }. */
function extractHiddenFields(html) {
  const re  = /<input[^>]+type=["']hidden["'][^>]*>/gi
  const out = {}
  let m
  while ((m = re.exec(html)) !== null) {
    const nm = m[0].match(/\bname=["']([^"']+)["']/)
    const vl = m[0].match(/\bvalue=["']([^"']*?)["']/)
    if (nm) out[nm[1]] = vl ? vl[1] : ''
  }
  return out
}

/**
 * Extract <select> elements.
 * Returns { [name]: { currentValue, applicantOptionValue } }
 * applicantOptionValue is the <option> value for "Applicant Name" or null.
 */
function extractSelects(html) {
  const re  = /<select[^>]+name=["']([^"']+)["'][^>]*>([\s\S]*?)<\/select>/gi
  const out = {}
  let m
  while ((m = re.exec(html)) !== null) {
    const name = m[1]
    const body = m[2]
    const selM = body.match(/<option[^>]+selected[^>]*value=["']([^"']*)["']/i) ||
                 body.match(/<option[^>]+value=["']([^"']*)["'][^>]*selected/i)
    const appM = body.match(/<option[^>]+value=["']([^"']*)["'][^>]*>[^<]*[Aa]pplicant[^<]*</i)
    out[name] = {
      currentValue        : selM ? selM[1] : '',
      applicantOptionValue: appM ? appM[1] : null,
    }
  }
  return out
}

/** Return names of all non-hidden, non-captcha text inputs. */
function extractTextInputNames(html) {
  const re  = /<input[^>]+type=["'](?:text|search)["'][^>]*>/gi
  const out = []
  let m
  while ((m = re.exec(html)) !== null) {
    const nm = m[0].match(/\bname=["']([^"']+)["']/)
    if (nm && !/captcha|email|phone|mobile/i.test(nm[1])) out.push(nm[1])
  }
  return out
}

/** Return { name, value } for the first submit button on the page. */
function extractSubmitButton(html) {
  const m = html.match(/<input[^>]+type=["']submit["'][^>]+name=["']([^"']+)["'][^>]*value=["']([^"']+)["']/i) ||
            html.match(/<input[^>]+name=["']([^"']+)["'][^>]*type=["']submit["'][^>]*value=["']([^"']+)["']/i)
  return m ? { name: m[1], value: m[2] } : { name: 'Button1', value: 'Search' }
}

/** Parse session cookies from the Set-Cookie header string. */
function parseCookies(header) {
  return (header || '').split(/,(?=[^;]+=[^;]+;|[^;]+=)/g)
    .map(c => c.trim().split(';')[0].trim())
    .filter(c => c.includes('='))
    .join('; ')
}

// ── HTML results table parser ─────────────────────────────────────────────────

/**
 * Parse the IP India GridView results table from an HTML page.
 * Detects column order from the header row so column additions/reorderings
 * are handled automatically.
 */
function parseTable(html, defaultApplicant) {
  // Find a table that looks like the trademark results table
  const tables = [...html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi)]
  let headerCols = null
  let dataRows   = []

  for (const tableMatch of tables) {
    const body = tableMatch[1]
    if (!/(application\s*no|class|applicant|tm\s+applied)/i.test(body)) continue

    // Parse header row (th elements)
    const hRow = body.match(/<tr[^>]*>([\s\S]*?<\/th>[\s\S]*?)<\/tr>/i)
    if (!hRow) continue

    const headers = [...hRow[1].matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)]
      .map(h => h[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim().toLowerCase())
    if (headers.length < 4) continue

    headerCols = headers

    // Parse data rows (rows that contain td elements, not th)
    const allRows = [...body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
    for (const row of allRows) {
      if (!row[1].includes('<td')) continue
      const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
        .map(c => c[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim())
      if (cells.length >= 4) dataRows.push(cells)
    }

    break
  }

  if (!headerCols || dataRows.length === 0) return []

  // Column index finder — checks multiple keyword variants
  function col(...kws) {
    for (const kw of kws) {
      const i = headerCols.findIndex(h => h.includes(kw.toLowerCase()))
      if (i >= 0) return i
    }
    return -1
  }

  const iAppNo    = col('application no', 'app. no', 'app no', 'appno')
  const iClass    = col('class')
  const iApp      = col('applicant')
  const iName     = col('tm applied', 'trade mark', 'tm name', 'word mark', 'mark')
  const iStatus   = col('status')
  const iAppDate  = col('date of application', 'app. date', 'app date')
  const iValidUpto= col('valid up to', 'valid upto', 'expiry')
  const iType     = col('type', 'tm type', 'kind')

  const results = []

  for (const cells of dataRows) {
    const appNo = iAppNo >= 0 ? cells[iAppNo] : ''
    if (!appNo || !/\d{5,}/.test(appNo)) continue  // skip pager / summary rows

    const cleanNo  = appNo.replace(/\D/g, '') || appNo
    const rawStatus= iStatus    >= 0 ? cells[iStatus]    : ''
    const appDate  = iAppDate   >= 0 ? cells[iAppDate]   : ''
    const validUpto= iValidUpto >= 0 ? cells[iValidUpto] : ''
    const tmType   = iType      >= 0 ? cells[iType]      : ''
    const cls      = iClass     >= 0 ? cells[iClass]     : ''
    const applicant= iApp       >= 0 ? cells[iApp]       : defaultApplicant
    const tmName   = iName      >= 0 ? cells[iName]      : '—'

    results.push({
      id              : `ipindia-${cleanNo}`,
      applicant       : (applicant || defaultApplicant || '—').slice(0, 200),
      markName        : tmName  || '—',
      registry        : 'IP India',
      country         : 'India',
      serialNo        : cleanNo,
      regNo           : cleanNo,
      kindOfMark      : mapKind(tmType),
      ncl             : cls ? String(parseInt(cls, 10) || cls) : '—',
      applicationDate : isoDate(appDate),
      publicationDate : '',
      registrationDate: '',
      expiryDate      : isoDate(validUpto),
      status          : mapStatus(rawStatus),
      ipIndiaAlert    : buildAlert(rawStatus),
      rawStatus       : rawStatus.trim(),
    })
  }

  return results.slice(0, MAX_RECORDS)
}

// ── individual application detail page parser ─────────────────────────────────

function parseDetailPage(html, appNo, holderHint) {
  // IP India detail pages use labeled td pairs: "Label:" | "Value"
  function labelValue(label) {
    const re = new RegExp(
      `${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^<]*<\/(?:td|th|span|div|label)[^>]*>\\s*<(?:td|th|span|div)[^>]*>([^<]{1,300})`,
      'i'
    )
    const m = html.match(re)
    if (m && m[1].trim()) return m[1].replace(/&nbsp;/g, ' ').trim()
    // Fallback: "Label: value" in plain text
    const m2 = html.match(new RegExp(`${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[:\\s]*([^\\n<]{1,200})`, 'i'))
    return m2 ? m2[1].replace(/&nbsp;/g, ' ').trim() : ''
  }

  const tmName    = labelValue('TM Applied For') || labelValue('Trade Mark')   || '—'
  const applicant = (labelValue('Applicant')     || holderHint || '—').split(/\n/)[0].trim()
  const cls       = labelValue('Class')
  const appDate   = isoDate(labelValue('Date Of Application') || labelValue('Application Date'))
  const rawStatus = labelValue('Status')         || ''
  const regNo     = labelValue('Registration Number') || labelValue('Reg. No.') || appNo
  const validUpto = isoDate(labelValue('Valid Up To') || labelValue('Expiry Date'))
  const tmType    = labelValue('Type Of TM')     || labelValue('Mark Type')    || ''

  return {
    id              : `ipindia-${appNo}`,
    applicant,
    markName        : tmName,
    registry        : 'IP India',
    country         : 'India',
    serialNo        : appNo,
    regNo,
    kindOfMark      : mapKind(tmType),
    ncl             : cls ? String(parseInt(cls, 10) || cls) : '—',
    applicationDate : appDate,
    publicationDate : '',
    registrationDate: '',
    expiryDate      : validUpto,
    status          : mapStatus(rawStatus),
    ipIndiaAlert    : buildAlert(rawStatus),
    rawStatus       : rawStatus.trim(),
  }
}

// ── fetch with abort-controller timeout ───────────────────────────────────────

async function fetchT(url, opts = {}) {
  const ctrl = new AbortController()
  const tid  = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal })
  } finally {
    clearTimeout(tid)
  }
}

// ── applicant name search (form POST) ─────────────────────────────────────────

async function searchByApplicant(holder) {
  // ── Step 1: load the search form ──
  const getRes = await fetchT(ESEARCH_URL, { headers: BROWSER_HEADERS })
  if (!getRes.ok) {
    throw new Error(`IP India search page returned HTTP ${getRes.status}`)
  }

  const formHtml = await getRes.text()
  const cookies  = parseCookies(getRes.headers.get('set-cookie') || '')

  if (/captcha/i.test(formHtml)) {
    throw Object.assign(
      new Error('IP India search requires CAPTCHA — automated access is blocked.'),
      { isCaptchaError: true }
    )
  }

  // ── Step 2: extract form components ──
  const hidden    = extractHiddenFields(formHtml)
  const selects   = extractSelects(formHtml)
  const textNames = extractTextInputNames(formHtml)
  const submit    = extractSubmitButton(formHtml)

  // Find the select whose options include "Applicant [Name]"
  let typeField   = null
  let appOptValue = null
  for (const [name, info] of Object.entries(selects)) {
    if (info.applicantOptionValue !== null) {
      typeField   = name
      appOptValue = info.applicantOptionValue
      break
    }
  }

  // Pick the search text field: prefer names that hint at a search input
  const searchField = textNames.find(n => /search|query|text|name|tm/i.test(n)) || textNames[0]

  if (!searchField) {
    throw Object.assign(
      new Error('Could not identify the search text field in the IP India form.'),
      { isFormParseError: true }
    )
  }

  // ── Step 3: build POST body ──
  const formData = { ...hidden }
  if (typeField && appOptValue) formData[typeField] = appOptValue
  formData[searchField] = holder
  if (submit.name) formData[submit.name] = submit.value
  // These are required by ASP.NET even if empty
  if (!formData['__EVENTTARGET'])   formData['__EVENTTARGET']   = ''
  if (!formData['__EVENTARGUMENT']) formData['__EVENTARGUMENT'] = ''

  const postHeaders = {
    ...BROWSER_HEADERS,
    'Content-Type': 'application/x-www-form-urlencoded',
    'Referer'     : ESEARCH_URL,
    ...(cookies ? { Cookie: cookies } : {}),
  }

  const postRes = await fetchT(ESEARCH_URL, {
    method : 'POST',
    headers: postHeaders,
    body   : new URLSearchParams(formData).toString(),
  })

  if (!postRes.ok) {
    throw new Error(`IP India search POST returned HTTP ${postRes.status}`)
  }

  const resultHtml = await postRes.text()

  // Detect zero-results page
  if (/no\s+record|no\s+result|0\s+record|not\s+found/i.test(resultHtml) &&
      !/<td[^>]*>\s*\d{5,}\s*<\/td>/i.test(resultHtml)) {
    return []
  }

  // Detect form-re-display (POST didn't work — field names mismatch)
  if (!/<td[^>]*>\s*\d{5,}\s*<\/td>/i.test(resultHtml) &&
      !/gridview/i.test(resultHtml)) {
    throw Object.assign(
      new Error(
        'IP India returned the search form instead of results. '
        + 'The form field names on this deployment may differ from expected values.'
      ),
      { isFormParseError: true }
    )
  }

  return parseTable(resultHtml, holder)
}

// ── bypass: fetch individual applications by number ───────────────────────────

async function fetchByApplicationNumbers(appNos, holderHint) {
  const BATCH   = 4
  const results = []

  for (let i = 0; i < Math.min(appNos.length, MAX_RECORDS); i += BATCH) {
    const batch   = appNos.slice(i, i + BATCH)
    const settled = await Promise.allSettled(batch.map(async no => {
      const url = `${DETAIL_BASE}?AppNo=${enc(no)}`
      const res = await fetchT(url, { headers: BROWSER_HEADERS })
      if (!res.ok) return null
      const html = await res.text()
      if (/not\s+found|invalid|no\s+record/i.test(html)) return null
      return parseDetailPage(html, no, holderHint)
    }))
    for (const r of settled) {
      if (r.status === 'fulfilled' && r.value) results.push(r.value)
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

  const holder = (req.query.holder || '').trim()
  if (!holder) {
    return res.status(400).json({ error: 'Missing required query parameter: holder' })
  }

  // ?applicationNumbers= bypass: comma-separated Indian application numbers
  const knownNos = (req.query.applicationNumbers || '')
    .split(',').map(s => s.trim().replace(/\D/g, '')).filter(s => s.length >= 5)

  try {
    let results

    if (knownNos.length > 0) {
      results = await fetchByApplicationNumbers(knownNos, holder)
    } else {
      results = await searchByApplicant(holder)
    }

    // 5-minute CDN cache — balance freshness against slow registry
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60')
    return res.status(200).json({ count: results.length, results: results.map(normaliseTrademarkData) })

  } catch (err) {
    console.error('[ipindia-search]', err.message)

    const bypass = `Supply known application numbers directly: ?holder=${enc(holder)}&applicationNumbers=1234567,2345678`

    if (err.isCaptchaError) {
      return res.status(502).json({
        error     : 'IP India search requires CAPTCHA verification — automated access is blocked.',
        detail    : err.message,
        workaround: bypass,
      })
    }

    if (err.isFormParseError) {
      return res.status(502).json({
        error     : 'IP India form structure could not be parsed — the portal layout may have changed.',
        detail    : err.message,
        workaround: bypass,
      })
    }

    if (err.name === 'AbortError') {
      return res.status(504).json({
        error     : `IP India did not respond within ${TIMEOUT_MS / 1000} seconds.`,
        detail    : 'The IP India registry is known for slow response times (10–30 s). Try again later.',
        workaround: bypass,
      })
    }

    return res.status(502).json({
      error     : 'Failed to fetch data from IP India.',
      detail    : err.message,
      workaround: bypass,
    })
  }
}
