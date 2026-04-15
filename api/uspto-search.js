/**
 * Vercel serverless function: /api/uspto-search
 *
 * Retrieves USPTO trademark records for a given owner/applicant name.
 *
 * ── What live testing established ────────────────────────────────────────────
 *
 *  ✓ WORKS (with API key)
 *    https://tsdrapi.uspto.gov/ts/cd/casestatus/sn{SERIAL}/info.xml
 *    Returns TMXML with all required fields.
 *    Requires header:  USPTO-API-KEY: <key>
 *    Free key at:      https://developer.uspto.gov  (register → "Get API Key")
 *    Set env var:      USPTO_API_KEY=your_key_here
 *    NOTE: The premise that TSDR is "keyless for individual lookups" is
 *    incorrect — every request returns HTTP 401 without the key.
 *
 *  ✗ NOT ACCESSIBLE
 *    tmsearch.uspto.gov  — JavaScript SPA; returns only a page title when
 *    fetched server-side.  No documented REST search endpoint exists for
 *    owner-name queries.
 *
 *    tess2.uspto.gov — deprecated, redirects to the web UI.
 *
 * ── Two-step design ───────────────────────────────────────────────────────────
 *  Step 1 — find serial numbers for the owner name.
 *    Tries six plausible search endpoint patterns in order.  All may fail
 *    (they did during local testing), but the Vercel production environment
 *    uses different IPs/headers that may succeed.  If all fail the caller
 *    receives a structured 502 with a ?serialNumbers= bypass option.
 *
 *  Step 2 — fetch full TSDR case status for each serial number.
 *    Uses the confirmed TSDR API endpoint with the USPTO_API_KEY env var.
 *    If the env var is absent the request is sent keyless first (in case
 *    USPTO makes a subset of records public in future).
 *
 * ── Section 8 / 15 compliance logic ──────────────────────────────────────────
 *  Registrations require affidavit maintenance or they lapse:
 *    Section 8   Declaration of Use — due in year 5–6 after registration,
 *                then every 10 years (6-month grace period each time).
 *    Section 15  Incontestability — optional, available after 5 years of use.
 *  Both are derived from the MarkEventBag in the TSDR XML.
 *  Records with a due/overdue affidavit carry a `maintenanceAlert` payload
 *  that the Portfolio table renders as a warning badge.
 *
 * ── TSDR XML field mapping ────────────────────────────────────────────────────
 *  ApplicationNumber                     → serialNo
 *  RegistrationNumber                    → regNo
 *  MarkVerbalElementText                 → markName
 *  MarkCurrentStatusExternalDescriptionText → status text
 *  MarkFeatureText / StandardCharacterClaimCode → kindOfMark
 *  ICClassNumber (inside ClassificationBag > Classification) → ncl
 *  ApplicationDate                       → applicationDate
 *  PublicationDate                       → publicationDate
 *  RegistrationDate                      → registrationDate
 *  MarkEventBag > MarkEvent              → maintenance + office action events
 *  ApplicantBag > Applicant > ApplicantNameText → applicant
 */

// ── constants ─────────────────────────────────────────────────────────────────

const TSDR_BASE   = 'https://tsdrapi.uspto.gov/ts/cd/casestatus'
const PAGE_SIZE   = 50
const MAX_RECORDS = 200

/** Search endpoint candidates — tried in order until one returns a valid JSON
 *  array of serial numbers.  The first candidate that succeeds is reused for
 *  subsequent pages. */
const SEARCH_CANDIDATES = [
  // New trademark search system (React SPA; underlying API unknown — best guesses)
  (owner, start, rows) =>
    `https://tmsearch.uspto.gov/search/search-results?query=ownerSearch%3A%22${enc(owner)}%22&rows=${rows}&start=${start}`,
  (owner, start, rows) =>
    `https://tmsearch.uspto.gov/search/search-results?query=owner%3A%22${enc(owner)}%22&rows=${rows}&start=${start}&type=owner`,
  (owner, start, rows) =>
    `https://tmsearch.uspto.gov/api/search?ownerName=${enc(owner)}&rows=${rows}&start=${start}`,
  // TSDR owner-search path (not documented but worth trying)
  (owner, start, rows) =>
    `${TSDR_BASE}/owner/${enc(owner)}/info.xml?start=${start}&rows=${rows}`,
  // USPTO developer API (trademark v1)
  (owner, start, rows) =>
    `https://developer.uspto.gov/trademark/v1/owner/${enc(owner)}?rows=${rows}&start=${start}`,
  // Assignment search sometimes contains serial numbers
  (owner, start, rows) =>
    `https://developer.uspto.gov/trademark/v1/application?assignee=${enc(owner)}&rows=${rows}&start=${start}`,
]

const BROWSER_HEADERS = {
  'User-Agent'     : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept'         : 'application/json, application/xml, text/html, */*; q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control'  : 'no-cache',
}

// ── helpers ───────────────────────────────────────────────────────────────────

const enc = s => encodeURIComponent(s)

/** ISO YYYY-MM-DD from common USPTO date formats (YYYYMMDD, YYYY-MM-DD). */
function isoDate(raw) {
  if (!raw) return ''
  const s = raw.replace(/[^0-9]/g, '')
  if (s.length === 8) return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`
  return raw.includes('-') ? raw.slice(0, 10) : ''
}

/** First text content of named XML element (strips child tags). */
function xmlTag(xml, name) {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'))
  return m ? m[1].replace(/<[^>]+>/g, '').trim() : ''
}

/** All text contents of named XML element. */
function xmlAll(xml, name) {
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'gi')
  const out = []
  let m
  while ((m = re.exec(xml)) !== null) {
    const t = m[1].replace(/<[^>]+>/g, '').trim()
    if (t) out.push(t)
  }
  return out
}

/** Inner XML of first named element. */
function xmlInner(xml, name) {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'))
  return m ? m[1] : ''
}

/** Map TSDR status text → dashboard vocabulary. */
function mapStatus(text) {
  const t = (text || '').toLowerCase()
  if (t.includes('registered'))                                    return 'Active'
  if (t.includes('publish') || t.includes('notice of allowance')) return 'Pending'
  if (t.includes('filed') || t.includes('pending') ||
      t.includes('examination') || t.includes('await'))           return 'Pending'
  if (t.includes('abandon') || t.includes('cancel') ||
      t.includes('expired') || t.includes('dead'))                return 'Expired'
  if (t.includes('oppos') || t.includes('refus'))                 return 'Opposed'
  return 'Active'
}

/** Map TSDR mark feature to dashboard kind vocabulary. */
function mapKind(featureText, stdCharCode) {
  const t = (featureText || '').toLowerCase()
  if (stdCharCode === 'TRUE' || t.includes('word') || t.includes('standard')) return 'Word'
  if (t.includes('design') || t.includes('figur') || t.includes('logo'))      return 'Device'
  if (t.includes('combin') || t.includes('composite'))                         return 'Combined'
  if (t.includes('color')  || t.includes('colour'))                            return 'Colour'
  if (t.includes('3d')     || t.includes('three-dim'))                         return '3D'
  if (t.includes('sound')  || t.includes('audio'))                             return 'Sound'
  // TSDR feature codes: WD=word, DM=design+word, DD=design only
  if (featureText === 'WD') return 'Word'
  if (featureText === 'DM') return 'Combined'
  if (featureText === 'DD') return 'Device'
  return featureText || 'Word'
}

// ── Section 8 / 15 compliance ─────────────────────────────────────────────────

/**
 * Inspect a trademark's registration date and event history to determine
 * whether Section 8 and/or Section 15 affidavits are due or overdue.
 *
 * Returns null if no action needed, or a `maintenanceAlert` object:
 *   { types: string[], status: 'due'|'overdue', message: string }
 */
function calcMaintenanceAlert(registrationDateISO, events) {
  if (!registrationDateISO) return null

  const regDate  = new Date(registrationDateISO)
  const now      = new Date()
  const msPerYear = 365.25 * 24 * 3600 * 1000
  const yearsOld  = (now - regDate) / msPerYear

  // ── Determine what has already been filed ──
  const evtTexts = events.map(e => (e.description || '').toUpperCase())
  const sec8Filed = evtTexts.some(t => /SECTION\s*8/.test(t) && /ACCEPT/.test(t))
  const sec15Filed = evtTexts.some(t => /SECTION\s*15/.test(t) && /ACCEPT/.test(t))

  const alerts = []

  // ── Section 8 window analysis ──
  // First window: years 5–6 (grace to 6.5)
  // Renewal windows: every 10 years thereafter (years 9–10, grace to 10.5)
  if (!sec8Filed) {
    const windowStart = Math.floor(yearsOld / 10) * 10 + 5
    const windowEnd   = windowStart + 1
    const graceEnd    = windowEnd + 0.5

    if (yearsOld >= windowStart && yearsOld < windowEnd) {
      alerts.push({ type: 'section8', status: 'due',
        message: `Section 8 declaration due (year ${Math.floor(yearsOld)} of registration)` })
    } else if (yearsOld >= windowEnd && yearsOld < graceEnd) {
      alerts.push({ type: 'section8', status: 'due',
        message: `Section 8 in grace period — expires at ${(windowStart + graceEnd).toFixed(0)} years` })
    } else if (yearsOld >= graceEnd && yearsOld < windowStart + 10) {
      alerts.push({ type: 'section8', status: 'overdue',
        message: 'Section 8 not filed — registration at risk of cancellation' })
    }
  }

  // ── Section 15 window ──
  // Available after 5 years of continuous use; not required but critical
  if (!sec15Filed && yearsOld >= 5) {
    alerts.push({ type: 'section15', status: 'due',
      message: 'Section 15 incontestability available (5+ years of use)' })
  }

  if (alerts.length === 0) return null

  const types      = alerts.map(a => a.type)
  const anyOverdue = alerts.some(a => a.status === 'overdue')
  const messages   = alerts.map(a => a.message)

  return {
    types,
    status  : anyOverdue ? 'overdue' : 'due',
    message : messages.join(' | '),
  }
}

/**
 * Check whether there are pending office actions in the event history.
 * Looks for events that opened an office action without a subsequent response.
 */
function detectPendingOfficeActions(events) {
  const issued   = /OFFICE\s*ACTION\s*(ISSUED|MAILED|SENT)|NON[-\s]FINAL|FINAL\s*REFUSAL/i
  const resolved = /RESPONSE\s*RECEIVED|AMENDMENT\s*FILED|ALLOWED|ABANDON|REGISTERED/i

  let lastOA = -1
  let lastResolved = -1

  events.forEach((e, i) => {
    if (issued.test(e.description))   lastOA       = i
    if (resolved.test(e.description)) lastResolved = i
  })

  return lastOA > lastResolved
}

// ── TSDR XML parser ───────────────────────────────────────────────────────────

function parseTsdrXml(xml, serial) {
  // ── applicant ──
  const applicantBag = xmlInner(xml, 'ApplicantBag')
  const applicant    = xmlTag(applicantBag, 'ApplicantNameText') ||
                       xmlTag(xml, 'ApplicantNameText') ||
                       xmlTag(xml, 'OwnerName') || '—'

  // ── numbers ──
  const serialNo = xmlTag(xml, 'ApplicationNumber')  || serial
  const regNo    = xmlTag(xml, 'RegistrationNumber') || ''

  // ── mark name ──
  const markName = xmlTag(xml, 'MarkVerbalElementText') ||
                   xmlTag(xml, 'MarkText')              || '—'

  // ── kind of mark ──
  const featureCode = xmlTag(xml, 'MarkFeatureCode') || xmlTag(xml, 'MarkFeatureText')
  const stdChar     = xmlTag(xml, 'StandardCharacterClaimCode')
  const kindOfMark  = mapKind(featureCode, stdChar)

  // ── dates ──
  const applicationDate  = isoDate(xmlTag(xml, 'ApplicationDate')  || xmlTag(xml, 'FilingDate'))
  const publicationDate  = isoDate(xmlTag(xml, 'PublicationDate'))
  const registrationDate = isoDate(xmlTag(xml, 'RegistrationDate'))

  // Expiry/cancellation date — USPTO uses 10-year renewal cycles
  // Computed as registrationDate + 10 years if not explicit
  let expiryDate = isoDate(xmlTag(xml, 'ExpirationDate') || xmlTag(xml, 'CancellationDate'))
  if (!expiryDate && registrationDate) {
    const d = new Date(registrationDate)
    d.setFullYear(d.getFullYear() + 10)
    expiryDate = d.toISOString().slice(0, 10)
  }

  // ── NCL classes ──
  // TSDR uses ICClassNumber inside ClassificationBag > Classification
  const classificationBag = xmlInner(xml, 'ClassificationBag')
  let classNumbers = xmlAll(classificationBag, 'ICClassNumber')
  if (classNumbers.length === 0) classNumbers = xmlAll(xml, 'ClassNumber')
  const ncl = [...new Set(classNumbers.map(n => String(parseInt(n, 10))))]
    .sort((a, b) => Number(a) - Number(b))
    .join(', ') || '—'

  // ── current status ──
  const statusText = xmlTag(xml, 'MarkCurrentStatusExternalDescriptionText') ||
                     xmlTag(xml, 'MarkCurrentStatusCode')
  const status = mapStatus(statusText)

  // ── events (for compliance + office action detection) ──
  const eventBag  = xmlInner(xml, 'MarkEventBag')
  const eventEls  = eventBag.match(/<MarkEvent>[\s\S]*?<\/MarkEvent>/gi) || []
  const events    = eventEls.map(el => ({
    description: xmlTag(el, 'MarkEventDescriptionText') || xmlTag(el, 'MarkEventCode'),
    date        : isoDate(xmlTag(el, 'MarkEventDate')),
  }))

  // ── compliance analysis ──
  const maintenanceAlert      = calcMaintenanceAlert(registrationDate, events)
  const pendingOfficeAction   = detectPendingOfficeActions(events)

  return {
    id                   : `uspto-${serialNo}`,
    applicant,
    markName,
    registry             : 'USPTO',
    country              : 'United States',
    serialNo,
    regNo,
    kindOfMark,
    ncl,
    applicationDate,
    publicationDate,
    registrationDate,
    expiryDate,
    status,
    // Extra USPTO-specific fields (used by the dashboard table)
    maintenanceAlert,      // null | { types, status, message }
    pendingOfficeAction,   // boolean
    rawStatusText        : statusText,
  }
}

// ── TSDR fetcher ──────────────────────────────────────────────────────────────

async function fetchTsdrRecord(serial) {
  const url = `${TSDR_BASE}/sn${serial}/info.xml`

  // Build header set — try with key if env var is set, always include it if present
  const apiKey    = process.env.USPTO_API_KEY || ''
  const headers   = { ...BROWSER_HEADERS, Accept: 'application/xml, text/xml, */*' }
  if (apiKey) headers['USPTO-API-KEY'] = apiKey

  // Attempt 1: with (or without) key as configured
  let res = await fetch(url, { headers })

  // Attempt 2: if we got 401 and had no key, there's nothing more we can do;
  // if we had a key and still got 401, the key is wrong — surface the error.
  if (res.status === 401) {
    const body = await res.text().catch(() => '')
    throw Object.assign(
      new Error(`TSDR 401 for sn${serial}. ${apiKey ? 'API key may be invalid.' : 'Set USPTO_API_KEY env var (free at developer.uspto.gov).'} Body: ${body.slice(0,200)}`),
      { isAuthError: true, serial }
    )
  }

  if (!res.ok) return null   // 404 = serial not found — skip silently

  const xml = await res.text()
  if (!xml.trim().startsWith('<')) return null   // not XML

  try {
    return parseTsdrXml(xml, serial)
  } catch (parseErr) {
    console.warn(`[uspto-search] parse error for sn${serial}:`, parseErr.message)
    return null
  }
}

// ── search ────────────────────────────────────────────────────────────────────

/**
 * Try each SEARCH_CANDIDATE URL until one returns a valid JSON payload with
 * an array of serial numbers.  Returns { serials, candidateIndex, total }.
 * Throws a structured error if all candidates fail.
 */
async function trySingleSearchPage(owner, start, rows) {
  const errors   = []
  const apiKey   = process.env.USPTO_API_KEY || ''
  const hdrs     = { ...BROWSER_HEADERS }
  if (apiKey) hdrs['USPTO-API-KEY'] = apiKey

  for (let i = 0; i < SEARCH_CANDIDATES.length; i++) {
    const url = SEARCH_CANDIDATES[i](owner, start, rows)
    try {
      const res = await fetch(url, { headers: hdrs })
      if (!res.ok) { errors.push(`[${i}] ${url} → HTTP ${res.status}`); continue }

      const text = await res.text()
      let json
      try { json = JSON.parse(text) } catch (_) {
        errors.push(`[${i}] ${url} → not JSON`); continue
      }

      // Normalise various response shapes
      const total   = Number(json.total ?? json.totalCount ?? json.numFound ?? json.count ?? 0)
      const records = json.records ?? json.results ?? json.docs ?? json.hits?.hits ?? json.items ?? []
      if (!Array.isArray(records) || records.length === 0) {
        errors.push(`[${i}] ${url} → empty records array`); continue
      }

      // Extract serial numbers — field names differ per API
      const serials = records
        .map(r => r.serialNumber ?? r.applicationNumber ?? r.serial ??
                  r._source?.serialNumber ?? r.fields?.serialNumber?.[0])
        .filter(Boolean)
        .map(String)
        .map(s => s.replace(/\D/g, ''))   // strip non-digits
        .filter(s => s.length >= 7)

      if (serials.length === 0) {
        errors.push(`[${i}] ${url} → records present but no serial numbers found`); continue
      }

      return { serials, candidateIndex: i, total }

    } catch (err) {
      errors.push(`[${i}] ${url} → ${err.message}`)
    }
  }

  // All candidates exhausted
  throw Object.assign(
    new Error('No USPTO search API responded with serial numbers.'),
    { isSearchUnavailable: true, tried: errors }
  )
}

async function searchAllSerials(owner) {
  const first   = await trySingleSearchPage(owner, 0, PAGE_SIZE)
  const serials = [...first.serials]
  const total   = Math.min(first.total, MAX_RECORDS)
  const ci      = first.candidateIndex

  const remaining = total - serials.length
  if (remaining > 0) {
    const pages   = Math.ceil(remaining / PAGE_SIZE)
    // Use the same winning candidate for subsequent pages
    const fetches = Array.from({ length: pages }, (_, k) => {
      const url = SEARCH_CANDIDATES[ci](owner, (k + 1) * PAGE_SIZE, PAGE_SIZE)
      return fetch(url, { headers: BROWSER_HEADERS })
        .then(r => r.ok ? r.json() : null)
        .then(j => {
          if (!j) return []
          const records = j.records ?? j.results ?? j.docs ?? j.hits?.hits ?? j.items ?? []
          return records
            .map(r => r.serialNumber ?? r.applicationNumber ?? r.serial ?? '')
            .map(String).map(s => s.replace(/\D/g, '')).filter(s => s.length >= 7)
        })
        .catch(() => [])
    })
    const settled = await Promise.allSettled(fetches)
    for (const r of settled) if (r.status === 'fulfilled') serials.push(...r.value)
  }

  return [...new Set(serials)].slice(0, MAX_RECORDS)
}

// ── handler ───────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET')     return res.status(405).json({ error: 'Method not allowed' })

  const owner = (req.query.owner || '').trim()
  if (!owner) {
    return res.status(400).json({ error: 'Missing required query parameter: owner' })
  }

  // ?serialNumbers=76044902,76044903  bypasses Step 1 for direct TSDR lookups
  const knownSerials = (req.query.serialNumbers || '')
    .split(',').map(s => s.trim().replace(/\D/g, '')).filter(s => s.length >= 7)

  // ── Step 1: find serial numbers ──────────────────────────────────────────
  let serials

  if (knownSerials.length > 0) {
    serials = knownSerials
  } else {
    try {
      serials = await searchAllSerials(owner)
    } catch (searchErr) {
      if (searchErr.isSearchUnavailable) {
        return res.status(502).json({
          error     : 'USPTO trademark search is not accessible as a public REST API.',
          detail    : 'tmsearch.uspto.gov is a JavaScript SPA; its underlying search endpoint could not be reached server-side.',
          tried     : searchErr.tried,
          workaround: `Supply known serial numbers directly via the ?serialNumbers= parameter, e.g.: ?owner=${enc(owner)}&serialNumbers=76044902,87654321`,
          apiKeyNote: process.env.USPTO_API_KEY
            ? 'USPTO_API_KEY is set — TSDR record fetching will work once serial numbers are supplied.'
            : 'USPTO_API_KEY is NOT set — set it to enable TSDR record fetching (free key at developer.uspto.gov).',
        })
      }
      throw searchErr
    }
  }

  if (serials.length === 0) {
    return res.status(200).json({ count: 0, results: [] })
  }

  // ── Step 2: fetch TSDR case status for each serial ───────────────────────
  const BATCH   = 5    // TSDR rate limit — conservative concurrency
  const results = []
  let authError = null

  for (let i = 0; i < serials.length && !authError; i += BATCH) {
    const batch   = serials.slice(i, i + BATCH)
    const settled = await Promise.allSettled(batch.map(s => fetchTsdrRecord(s)))
    for (const r of settled) {
      if (r.status === 'fulfilled' && r.value) {
        results.push(r.value)
      } else if (r.status === 'rejected' && r.reason?.isAuthError) {
        // Stop on first auth error — all remaining will fail the same way
        authError = r.reason.message
        break
      }
    }
  }

  if (authError) {
    return res.status(502).json({
      error     : 'TSDR API authentication failed.',
      detail    : authError,
      workaround: 'Add your free USPTO API key as the USPTO_API_KEY environment variable in Vercel project settings.',
      results   : results,   // Return any records that were already fetched
      count     : results.length,
    })
  }

  // 10-minute CDN cache — TSDR data changes infrequently
  res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=60')
  return res.status(200).json({ count: results.length, results })
}
