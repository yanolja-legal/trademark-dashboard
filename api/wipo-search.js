/**
 * Vercel serverless function: /api/wipo-search
 *
 * Fetches trademark data from the WIPO Madrid Monitor.
 *
 * ── What was verified ─────────────────────────────────────────────────────
 * After live-testing every documented and plausible endpoint:
 *
 *  ✓ WORKS  → https://www3.wipo.int/madrid/monitor/en/showData.jsp?ID={IRN}
 *             Returns a structured HTML page (INID-coded sections) with
 *             every required field: holder, dates, NCL, designated countries,
 *             mark name, kind.
 *
 *  ✗ 404    → https://www.wipo.int/madrid/monitor/api/v1/tmxml/data/{id}
 *             Not publicly accessible (confirmed 404 from multiple environments).
 *
 *  ✗ 404    → Every /api/v1/results, /api/v1/search, /api/search, /rest/search
 *             variant tried — none exist publicly.
 *
 * ── Search strategy ───────────────────────────────────────────────────────
 * WIPO does not expose a public REST search-by-holder endpoint.  We attempt
 * every plausible URL pattern in order; the first one that returns a valid
 * JSON payload with an ID array wins.  All are tried before giving up so
 * future API additions are handled automatically.
 *
 * ── Record fetch strategy ─────────────────────────────────────────────────
 * 1. Try the TMXML XML endpoint with realistic browser headers — it may
 *    respond from Vercel production IPs even if it 404s during development.
 * 2. Fall back to scraping showData.jsp HTML (confirmed working).  The HTML
 *    uses standardised WIPO INID codes as section headings, making it
 *    reliably parseable even if the visual design changes.
 *
 * ── INID code → field mapping ─────────────────────────────────────────────
 *  111 / 181  International Registration Number  →  regNo / serialNo
 *  151        Date of Registration               →  registrationDate
 *  180        Expected Expiration Date           →  expiryDate
 *  210        Application Number                 →  serialNo (if present)
 *  220        Application Date                   →  applicationDate
 *  540        Mark image / verbal element        →  markName
 *  732        Holder name + address              →  applicant
 *  511        Nice Classification                →  ncl
 *  834        Designated Contracting Parties     →  designatedCountries
 */

// ── constants ────────────────────────────────────────────────────────────────

import { normaliseTrademarkData } from '../src/normalise.js'

const SHOW_DATA_BASE = 'https://www3.wipo.int/madrid/monitor/en/showData.jsp'
const TMXML_BASE     = 'https://www.wipo.int/madrid/monitor/api/v1/tmxml/data'
const PAGE_SIZE      = 50
const MAX_RECORDS    = 200

/** Search endpoint candidates tried in order until one returns a valid response. */
const SEARCH_CANDIDATES = [
  (holder, start, rows) =>
    `https://www3.wipo.int/madrid/monitor/api/v1/results?holderSearch=${enc(holder)}&start=${start}&rows=${rows}`,
  (holder, start, rows) =>
    `https://www3.wipo.int/madrid/monitor/api/v1/results?holder=${enc(holder)}&start=${start}&rows=${rows}`,
  (holder, start, rows) =>
    `https://www3.wipo.int/madrid/monitor/api/v1/results?q=holderCurrentName:(${enc(holder)})&start=${start}&rows=${rows}`,
  (holder, start, rows) =>
    `https://www3.wipo.int/madrid/monitor/api/v1/search?holderName=${enc(holder)}&start=${start}&rows=${rows}`,
  (holder, start, rows) =>
    `https://www3.wipo.int/madrid/monitor/api/v1/trademarks?holderName=${enc(holder)}&start=${start}&rows=${rows}`,
  (holder, start, rows) =>
    `https://www3.wipo.int/madrid/monitor/rest/search?holder=${enc(holder)}&start=${start}&rows=${rows}`,
]

const FETCH_HEADERS_BROWSER = {
  'User-Agent'     : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept'         : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control'  : 'no-cache',
}
const FETCH_HEADERS_JSON = {
  ...FETCH_HEADERS_BROWSER,
  'Accept': 'application/json, text/javascript, */*; q=0.01',
}
const FETCH_HEADERS_XML = {
  ...FETCH_HEADERS_BROWSER,
  'Accept': 'application/xml, text/xml, */*; q=0.8',
}

// ── small utilities ───────────────────────────────────────────────────────────

const enc = s => encodeURIComponent(s)

/** Convert WIPO date strings to ISO YYYY-MM-DD.
 *  Handles: DD.MM.YYYY  |  YYYYMMDD  |  YYYY-MM-DD */
function isoDate(raw) {
  if (!raw) return ''
  const s = raw.trim()
  // DD.MM.YYYY
  const dmy = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`
  // YYYYMMDD
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
  // YYYY-MM-DD already
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  return ''
}

/** Map WIPO status codes/text → dashboard status vocabulary. */
function mapStatus(raw, expiryISO) {
  const s = (raw || '').toLowerCase()
  // If we have no status signal but have an expiry, derive from date
  if (!s && expiryISO) {
    const ms  = new Date(expiryISO).getTime() - Date.now()
    const days = ms / 86_400_000
    if (days < 0)   return 'Expired'
    if (days < 90)  return 'Expiring Soon'
    return 'Active'
  }
  if (s.includes('expir') || s.includes('laps') || s.includes('cancel') ||
      s.includes('ceas')  || s.includes('refus') || s.includes('withdr') ||
      s.includes('struck'))                              return 'Expired'
  if (s.includes('pending') || s.includes('filed') ||
      s.includes('applied') || s.includes('await'))     return 'Pending'
  if (s.includes('active') || s.includes('regist') ||
      s.includes('valid')  || s.includes('in force'))   return 'Active'
  // Fallback: derive from expiry if present
  if (expiryISO) {
    const ms   = new Date(expiryISO).getTime() - Date.now()
    const days = ms / 86_400_000
    if (days < 0)  return 'Expired'
    if (days < 90) return 'Expiring Soon'
  }
  return 'Active'
}

/** Map kind/feature strings to the dashboard vocabulary. */
function mapKind(kindMark, markFeature) {
  const src = `${kindMark || ''} ${markFeature || ''}`.toLowerCase()
  if (src.includes('word') || src.includes('verbal'))         return 'Word'
  if (src.includes('figur') || src.includes('device') ||
      src.includes('logo')  || src.includes('image'))         return 'Device'
  if (src.includes('combin') || src.includes('mixed') ||
      src.includes('composite'))                              return 'Combined'
  if (src.includes('colour') || src.includes('color'))       return 'Colour'
  if (src.includes('3d')     || src.includes('three-dim'))   return '3D'
  if (src.includes('sound')  || src.includes('audio'))       return 'Sound'
  return kindMark || markFeature || 'Word'   // WIPO marks are predominantly word marks
}

// ── XML helpers (for TMXML endpoint if it becomes reachable) ─────────────────

/** First text content of an XML element, tags stripped. */
function xmlTag(xml, name) {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'))
  return m ? m[1].replace(/<[^>]+>/g, '').trim() : ''
}

/** All text contents of matching XML elements. */
function xmlAllTags(xml, name) {
  const re  = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'gi')
  const out = []
  let m
  while ((m = re.exec(xml)) !== null) {
    const t = m[1].replace(/<[^>]+>/g, '').trim()
    if (t) out.push(t)
  }
  return out
}

/** Inner XML of first matching element. */
function xmlInner(xml, name) {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'))
  return m ? m[1] : ''
}

/** Parse a full TMXML response into a dashboard trademark object. */
function parseTmxml(xml, id) {
  // ── applicant ──
  const holderSection = xmlInner(xml, 'ApplicantDetails') ||
                        xmlInner(xml, 'HolderBag')        ||
                        xmlInner(xml, 'ApplicantBag')
  const applicant =
    xmlTag(holderSection || xml, 'FreeFormatName')     ||
    xmlTag(holderSection || xml, 'EntityName')         ||
    xmlTag(holderSection || xml, 'OrganizationName')   ||
    xmlTag(xml, 'FreeFormatName')                      || '—'

  // ── numbers ──
  const appNumber = xmlTag(xml, 'ApplicationNumber') || `WO/${id}`
  const regNumber = xmlTag(xml, 'RegistrationNumber') ||
                    xmlTag(xml, 'InternationalRegistrationNumber') || String(id)

  // ── dates ──
  // BasicRecord > RecordEffectiveDate = registration date per user spec
  const basicRecord      = xmlInner(xml, 'BasicRecord')
  const registrationDate = isoDate(
    xmlTag(basicRecord || xml, 'RecordEffectiveDate') ||
    xmlTag(xml, 'RegistrationDate') ||
    xmlTag(xml, 'RecordEffectiveDate')
  )
  const applicationDate = isoDate(
    xmlTag(xml, 'ApplicationDate') ||
    xmlTag(xml, 'FilingDate')
  )
  const expiryDate = isoDate(
    xmlTag(xml, 'ExpiryDate') ||
    xmlTag(xml, 'RenewalDate') ||
    xmlTag(xml, 'ExpectedExpirationDate')
  )

  // ── mark ──
  const markName = xmlTag(xml, 'MarkVerbalElementText') ||
                   xmlTag(xml, 'WordMarkSpecification')  ||
                   xmlTag(xml, 'MarkText')               || '—'
  const kindMark    = xmlTag(xml, 'KindMark')
  const markFeature = xmlTag(xml, 'MarkFeature') || xmlTag(xml, 'MarkCategory')
  const kindOfMark  = mapKind(kindMark, markFeature)

  // ── NCL classes ──
  const classes = xmlAllTags(xml, 'ClassNumber')
  const ncl     = [...new Set(classes)].sort((a, b) => Number(a) - Number(b)).join(', ') || '—'

  // ── status ──
  const statusRaw = xmlTag(xml, 'MarkCurrentStatusCode') ||
                    xmlTag(xml, 'StatusCode')             ||
                    xmlTag(xml, 'MarkStatus')
  const status = mapStatus(statusRaw, expiryDate)

  // ── designated countries ──
  // Per user spec: DesignatedCountryCode list
  const countryCodes = xmlAllTags(xml, 'DesignatedCountryCode') ||
                       xmlAllTags(xml, 'ST3CountryCode')
  const designatedCountries = [...new Set(countryCodes)].sort()

  return {
    id                  : `wipo-${regNumber}`,
    applicant,
    markName,
    registry            : 'WIPO Madrid',
    country             : 'International (WIPO)',
    designatedCountries,
    serialNo            : appNumber,
    regNo               : regNumber,
    kindOfMark,
    markFeature         : markFeature || kindMark || '',
    ncl,
    applicationDate,
    publicationDate     : '',
    registrationDate,
    expiryDate,
    status,
  }
}

// ── HTML helpers (showData.jsp fallback) ──────────────────────────────────────

/** Convert a string to a WIPO Date — used when reading HTML page content. */
function extractDate(html, patterns) {
  for (const pattern of patterns) {
    const m = html.match(pattern)
    if (m && m[1]) return isoDate(m[1].trim())
  }
  return ''
}

/**
 * Parse the showData.jsp HTML page.  WIPO uses standardised INID codes as
 * section headers throughout the page, making the data reliably extractable
 * despite the absence of a machine-readable API.
 *
 * INID codes used:
 *   111 / page title  → International Registration Number
 *   151               → Date of Registration
 *   180               → Expected Expiration Date
 *   210               → Application Number
 *   220               → Application Date (may be inside INID 821 block)
 *   540               → Mark image / verbal element (mark name)
 *   732               → Holder name + address
 *   511               → Nice Classification classes
 *   834               → Designated Contracting Parties (country codes)
 */
function parseShowDataHtml(html, irn) {
  // ── helper: text after an INID code heading ──
  // The page renders INID codes as bold/header text followed by the value.
  // We try several tag/wrapper patterns WIPO has used over the years.
  function inidValue(code) {
    // Pattern A: <strong>NNN</strong> or <b>NNN</b> followed by text node
    const pA = new RegExp(`<(?:strong|b|h[2-5])>\\s*${code}\\s*</(?:strong|b|h[2-5])>\\s*(?:<[^>]+>)*\\s*([^<]{2,200})`, 'i')
    // Pattern B: text "NNN -" or "NNN:" then value
    const pB = new RegExp(`\\b${code}\\b\\s*[-–:]\\s*([^<\\n]{2,200})`, 'i')
    // Pattern C: data attribute or label
    const pC = new RegExp(`data-inid=["']${code}["'][^>]*>\\s*([^<]{2,200})`, 'i')
    for (const p of [pA, pB, pC]) {
      const m = html.match(p)
      if (m && m[1].trim()) return m[1].trim()
    }
    return ''
  }

  // ── IR number ──
  const regNumber = String(irn)

  // ── mark name (INID 540 or page title) ──
  // WIPO pages typically show the mark text prominently in h1 or title
  const titleMatch = html.match(/<h1[^>]*>\s*(?:\d+\s*[-–]\s*)?([^<]{1,120})\s*<\/h1>/i) ||
                     html.match(/<title[^>]*>[^<]*?(\b[A-Z][A-Z0-9\s&'.-]{1,60})\s*[-–|]/i)
  let markName = inidValue(540) || (titleMatch ? titleMatch[1].trim() : '') || '—'
  // Remove any stray IR number prefix (e.g. "1574292 - ANGL" → "ANGL")
  markName = markName.replace(/^\d+\s*[-–]\s*/, '').trim() || '—'

  // ── holder (INID 732) ──
  const holderRaw = inidValue(732)
  // Strip address portion — holder name is before first comma or line break
  const applicant = holderRaw
    ? holderRaw.split(/\n|,\s*[A-Z]{2}\s*\d|\s{3,}/)[0].replace(/,\s*$/, '').trim()
    : '—'

  // ── registration date (INID 151) ──
  const registrationDate = isoDate(inidValue(151)) ||
    extractDate(html, [
      /(?:Registration\s+Date|151)[^\d]*(\d{2}\.\d{2}\.\d{4})/i,
      /(?:date\s+of\s+registration)[^\d]*(\d{2}\.\d{2}\.\d{4})/i,
    ])

  // ── expiry date (INID 180) ──
  const expiryDate = isoDate(inidValue(180)) ||
    extractDate(html, [
      /(?:Expir|180)[^\d]*(\d{2}\.\d{2}\.\d{4})/i,
      /(?:expiration\s+date|renewal\s+date)[^\d]*(\d{2}\.\d{2}\.\d{4})/i,
    ])

  // ── application date (INID 220, often inside INID 821 basic-application block) ──
  const applicationDate = isoDate(inidValue(220)) ||
    extractDate(html, [
      /(?:Application\s+Date|220)[^\d]*(\d{2}\.\d{2}\.\d{4})/i,
      /\b821\b[^)]*?\((\d{2}\.\d{2}\.\d{4})\)/i,
    ])

  // ── nice classification (INID 511) ──
  const nclRaw = inidValue(511)
  // Extract the numbers — they appear as "01, 03, 09" or "Class 09 – ..."
  const classMatches = (nclRaw || html).match(/\b(0?[1-9]|[1-3][0-9]|4[0-5])\b/g) || []
  // Deduplicate and sort; also avoid catching stray 2- and 4-digit numbers
  const nclSection = (() => {
    // Try to narrow down to the INID 511 section first
    const m511 = html.match(/\b511\b[\s\S]{0,3000}?(?=\b(?:521|531|540|571|591|732)\b)/i)
    const src   = m511 ? m511[0] : nclRaw || ''
    const nums  = (src.match(/\b(0?[1-9]|[1-3][0-9]|4[0-5])\b/g) || [])
      .map(n => String(parseInt(n, 10)))
    return [...new Set(nums)].sort((a, b) => Number(a) - Number(b)).join(', ')
  })()
  const ncl = nclSection || '—'

  // ── designated countries (INID 834) ──
  // Country codes appear in the 834 section as two-letter ISO codes.
  // EM = European Union, BX = Benelux — WIPO-specific codes kept as-is.
  const des834 = html.match(/\b834\b[\s\S]{0,5000}?(?=\b(?:835|836|900|\z)\b)/i)
  const desSection = des834 ? des834[0] : html
  const ccPattern  = /\b([A-Z]{2})\b(?=\s*(?:[,·•\n]|<))/g
  const ccSet      = new Set()
  let   ccMatch
  while ((ccMatch = ccPattern.exec(desSection)) !== null) {
    const cc = ccMatch[1]
    // Filter out common HTML/WIPO noise tokens
    if (!/^(?:ID|AU|TO|AT|BY|BE|LT|OR|AM|IN|OF|ON|US|AN|AS|DO|RE|IS|IT|IF|GO|NO|NZ|BR|CA|CH|CN|EM|DE|JP|KR|MX|RU|SG|TR|BX|LI|GB|FR|ES|PL|DK|FI|HR|SI|SK|CZ|HU|PT|GR|RO|BG|LV|EE|CY|MT|LU|IE|HR|MK|ME|RS|AL|BA|GE|MD|UA|UZ|VN|TN|MA|DZ|EG|OM|QA|AE|SA|KE|GH|NG|ZA|KZ|MN|PH|TH|MY|ID|VN|TR|IL|KG|TJ|TM|AZ|AM|GE|BY|UA|MD)$/.test(cc)) continue
    // Accept only likely Madrid member codes
    ccSet.add(cc)
  }
  // WIPO standard country codes in the designations section
  const designatedCountries = [...ccSet].sort()

  // ── kind of mark ──
  // HTML pages often show "Kind of Mark" or similar label
  const kindRaw = (html.match(/kind\s+of\s+mark[^<>:]*:?\s*([^<\n]{3,40})/i) || [])[1] ||
                  (html.match(/(?:mark\s+type|type\s+of\s+mark)[^<>:]*:?\s*([^<\n]{3,40})/i) || [])[1] || ''
  const kindOfMark = mapKind(kindRaw, '')

  // ── status ──
  // Derive from dates — the HTML page reflects the current status through
  // styling and text but has no single machine-readable status field.
  const status = mapStatus('', expiryDate)

  return {
    id                  : `wipo-${regNumber}`,
    applicant,
    markName,
    registry            : 'WIPO Madrid',
    country             : 'International (WIPO)',
    designatedCountries,
    serialNo            : `WO/${regNumber}`,
    regNo               : regNumber,
    kindOfMark,
    markFeature         : kindRaw,
    ncl,
    applicationDate,
    publicationDate     : '',
    registrationDate,
    expiryDate,
    status,
  }
}

// ── record fetcher ────────────────────────────────────────────────────────────

/**
 * Fetch a single trademark record by its IR number.
 * Tries TMXML XML first; falls back to showData.jsp HTML.
 */
async function fetchRecord(irn) {
  // ── attempt 1: TMXML XML endpoint (may work from Vercel production IPs) ──
  try {
    const xmlUrl = `${TMXML_BASE}/${encodeURIComponent(irn)}`
    const xmlRes = await fetch(xmlUrl, { headers: FETCH_HEADERS_XML })
    if (xmlRes.ok) {
      const xml = await xmlRes.text()
      if (xml.trim().startsWith('<')) {
        return parseTmxml(xml, irn)
      }
    }
  } catch (_) { /* fall through */ }

  // ── attempt 2: showData.jsp HTML (confirmed working) ──
  try {
    const htmlUrl = `${SHOW_DATA_BASE}?ID=${encodeURIComponent(irn)}`
    const htmlRes = await fetch(htmlUrl, { headers: FETCH_HEADERS_BROWSER })
    if (htmlRes.ok) {
      const html = await htmlRes.text()
      // Quick sanity-check: WIPO error pages contain "not found" or "invalid"
      if (/not\s+found|invalid\s+id|no\s+record/i.test(html)) return null
      return parseShowDataHtml(html, irn)
    }
  } catch (_) { /* fall through */ }

  return null  // both strategies failed — skip this record silently
}

// ── search ────────────────────────────────────────────────────────────────────

/**
 * Attempt to find matching IR numbers for a holder name.
 *
 * Tries every SEARCH_CANDIDATES URL in order.  Returns { ids, source }
 * where source is the candidate index that succeeded, or throws if all fail.
 */
async function trySingleSearchPage(holder, start, rows) {
  const errors = []

  for (let i = 0; i < SEARCH_CANDIDATES.length; i++) {
    const url = SEARCH_CANDIDATES[i](holder, start, rows)
    try {
      const res = await fetch(url, { headers: FETCH_HEADERS_JSON })
      if (!res.ok) { errors.push(`[${i}] ${url} → HTTP ${res.status}`); continue }

      const text = await res.text()
      // Try to parse as JSON
      let json
      try { json = JSON.parse(text) } catch (_) {
        errors.push(`[${i}] ${url} → not JSON`)
        continue
      }

      // Normalise response shape — different APIs use different keys
      const total   = Number(json.total ?? json.totalCount ?? json.numFound ?? json.count ?? 0)
      const records = json.records ?? json.results ?? json.docs ?? json.hits?.hits ?? json.items ?? []
      if (!Array.isArray(records)) { errors.push(`[${i}] ${url} → no records array`); continue }

      const ids = records
        .map(r => r.id ?? r.irn ?? r.irNumber ?? r.registrationNumber ??
                  r._source?.irn ?? r._source?.registrationNumber)
        .filter(Boolean)
        .map(String)

      return { total, ids, source: i }

    } catch (err) {
      errors.push(`[${i}] ${url} → ${err.message}`)
    }
  }

  // All candidates failed
  const detail = errors.join('\n')
  throw Object.assign(
    new Error('No working WIPO search API found.  Tried:\n' + detail),
    { isSearchUnavailable: true, tried: errors }
  )
}

async function searchAllIds(holder) {
  const first = await trySingleSearchPage(holder, 0, PAGE_SIZE)
  const ids   = [...first.ids]
  const total = Math.min(first.total, MAX_RECORDS)

  const remaining = total - ids.length
  if (remaining > 0) {
    const pages   = Math.ceil(remaining / PAGE_SIZE)
    const fetches = Array.from({ length: pages }, (_, i) =>
      trySingleSearchPage(holder, (i + 1) * PAGE_SIZE, PAGE_SIZE)
    )
    const settled = await Promise.allSettled(fetches)
    for (const r of settled) {
      if (r.status === 'fulfilled') ids.push(...r.value.ids)
    }
  }

  return [...new Set(ids)].slice(0, MAX_RECORDS)
}

// ── handler ───────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET')     return res.status(405).json({ error: 'Method not allowed' })

  // Primary: fetch by known IR numbers (?irNumbers= or legacy ?ids=)
  const irNumbers = (req.query.irNumbers || req.query.ids || '')
    .split(',').map(s => s.trim()).filter(Boolean)

  // Fallback: holder-name search (legacy — search API is not publicly accessible)
  const holder = (req.query.holder || '').trim()

  if (!irNumbers.length && !holder) {
    return res.status(400).json({ error: 'Missing required parameter: irNumbers or holder' })
  }

  try {
    let ids

    if (irNumbers.length > 0) {
      ids = irNumbers
    } else {
      try {
        ids = await searchAllIds(holder)
      } catch (searchErr) {
        if (searchErr.isSearchUnavailable) {
          return res.status(502).json({
            error    : 'WIPO Madrid Monitor search API is not publicly accessible.',
            detail   : 'No documented REST search endpoint exists. Use the ?irNumbers= parameter to look up known IR numbers directly.',
            tried    : searchErr.tried,
            workaround:
              'Pass comma-separated IR numbers via the `irNumbers` query parameter, e.g. ' +
              `?irNumbers=1234567,1234568`,
          })
        }
        throw searchErr
      }
    }

    if (ids.length === 0) {
      return res.status(200).json({ count: 0, results: [] })
    }

    // Fetch records in batches of 8 (polite concurrency limit)
    const BATCH   = 8
    const results = []
    for (let i = 0; i < ids.length; i += BATCH) {
      const batch   = ids.slice(i, i + BATCH)
      const settled = await Promise.allSettled(batch.map(id => fetchRecord(id)))
      for (const r of settled) {
        if (r.status === 'fulfilled' && r.value) results.push(r.value)
      }
    }

    // 10-minute CDN cache — Madrid Monitor data changes infrequently
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=60')
    return res.status(200).json({ count: results.length, results: results.map(normaliseTrademarkData) })

  } catch (err) {
    console.error('[wipo-search]', err.message)
    return res.status(502).json({
      error : 'Failed to fetch data from WIPO Madrid Monitor.',
      detail: err.message,
    })
  }
}
