/**
 * Vercel serverless function: /api/ilpo-search
 *
 * Israeli trademark search via the data.gov.il CKAN open-data API.
 *
 * ── Data source ───────────────────────────────────────────────────────────────
 *  Provider:  Israel Ministry of Justice / ILPO
 *  Portal:    https://data.gov.il  (Israeli government open-data — CKAN)
 *  Auth:      None required
 *  Freshness: Updated daily (automated)
 *  Coverage:  All national and Madrid-Protocol international registrations
 *             designating Israel
 *
 * ── Resources used ────────────────────────────────────────────────────────────
 *  TM_RESOURCE  (main trademark register)
 *    6284d4a9-fdd4-45c9-a1d6-58143c7d8127
 *
 *  HOLD_RESOURCE  (holders & licensees — owner names per mark)
 *    d4a365c7-357a-4172-8815-1a6650e848e2
 *
 * ── Why two datasets? ─────────────────────────────────────────────────────────
 *  For Madrid-Protocol international registrations (the majority of Yanolja /
 *  Go Global Travel marks in Israel), the main dataset stores the IR number in
 *  the owner-name field rather than a human-readable name.  The holders dataset
 *  always has the actual English owner name and links back to the national mark
 *  number.  So the search is a two-step join:
 *    Step 1 — search HOLD_RESOURCE by English owner name → collect mark numbers
 *    Step 2 — fetch those mark records from TM_RESOURCE (SQL IN query)
 *  Additionally, TM_RESOURCE is searched directly (for national marks where the
 *  owner name is stored inline and for marks whose name matches the holder name).
 *
 * ── Expiry / renewal note ────────────────────────────────────────────────────
 *  Israeli trademarks are valid for 10 years from the application date and renew
 *  in 10-year increments.  There is a 6-month (180-day) grace period after the
 *  expiry date during which renewal can still be filed (with a late fee).
 *
 * ── Bypass ───────────────────────────────────────────────────────────────────
 *  ?trademarkNumbers=12345,67890  — fetches those specific ILPO mark numbers
 *  directly, skipping the holder-name search step.
 *
 * ── Field mapping (Hebrew → dashboard) ───────────────────────────────────────
 *  מספר הסימן          → serialNo / regNo
 *  תיאור סימן אנגלית  → markName (English; falls back to Hebrew)
 *  מצב                → status
 *  תאריך בקשה         → applicationDate   (DD/MM/YYYY)
 *  תאריך רישום        → registrationDate  (DD/MM/YYYY)
 *  תאריך תום תוקף    → expiryDate        (DD/MM/YYYY)
 *  סוגי ניצה לבקשה   → ncl
 *  דמות               → kindOfMark  (כן=Device, לא=Word)
 *  שם בעל הסימן באנגלית → applicant (may be IR number for intl marks)
 */

// ── constants ─────────────────────────────────────────────────────────────────

import { normaliseTrademarkData } from '../src/normalise.js'

const CKAN_BASE     = 'https://data.gov.il/api/3/action'
const TM_RESOURCE   = '6284d4a9-fdd4-45c9-a1d6-58143c7d8127'
const HOLD_RESOURCE = 'd4a365c7-357a-4172-8815-1a6650e848e2'
const PAGE_LIMIT    = 200
const MAX_RECORDS   = 300

// Hebrew field names — verbatim from the dataset schema
const F = {
  tmNo       : 'מספר הסימן',
  markNameEn : 'תיאור סימן אנגלית',
  markNameHe : 'תיאור סימן עברית',
  ownerEn    : 'שם בעל הסימן באנגלית',
  ownerHe    : 'שם בעל הסימן בעברית',
  status     : 'מצב',
  appDate    : 'תאריך בקשה',
  regDate    : 'תאריך רישום',
  expiryDate : 'תאריך תום תוקף',
  ncl        : 'סוגי ניצה לבקשה',
  isDevice   : 'דמות',
  regType    : 'סוג רישום',
  isIntl     : 'לאומי/בינלאומי',
  intlNo     : 'מספר הסימן הבינלאומי',
}
const F_HOLD = {
  tmNo   : 'מספר סימן לאומי',
  nameEn : 'שם לקוח באנגלית',
  nameHe : 'שם לקוח בעברית',
}

const BROWSER_HEADERS = {
  'User-Agent'     : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept'         : 'application/json, */*; q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
}

const enc = s => encodeURIComponent(s)

// ── date helpers ──────────────────────────────────────────────────────────────

/** Convert DD/MM/YYYY (or YYYY-MM-DD) to ISO YYYY-MM-DD. */
function isoDate(raw) {
  if (!raw) return ''
  const s = String(raw).trim()
  const dmy = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  return ''
}

// ── status / kind mapping ─────────────────────────────────────────────────────

/**
 * Map Hebrew ILPO status text to the dashboard status vocabulary.
 * Known status values (from live data):
 *   רשום          = Registered
 *   ממתין לבחינה  = Awaiting examination
 *   בבחינה        = Under examination
 *   מפורסם        = Published for opposition
 *   קובל          = Received / accepted (pending)
 *   בוטל          = Cancelled
 *   סורב          = Refused
 *   נמחק          = Deleted
 *   פג תוקף      = Expired
 */
function mapStatus(raw, expiryISO) {
  const s = (raw || '').trim()

  // Derived from date if clearly expired
  if (expiryISO) {
    const ms = new Date(expiryISO).getTime() - Date.now()
    if (ms < -180 * 86_400_000) return 'Expired'   // past 6-month grace
    if (ms < 0)                  return 'Expiring Soon'  // in grace period
    if (ms < 90 * 86_400_000)   return 'Expiring Soon'
  }

  // Hebrew matches
  if (s === 'רשום')                                               return 'Active'
  if (s === 'בוטל' || s === 'סורב' || s === 'נמחק' ||
      s === 'פג תוקף')                                           return 'Expired'
  if (s.includes('התנגד') || s.includes('ערר') ||
      s.includes('התנגדות'))                                     return 'Opposed'
  // Pending: everything in-process (examination, publication, received, etc.)
  return 'Pending'
}

function mapKind(isDevice, regType) {
  if ((isDevice || '').trim() === 'כן')             return 'Device'
  const t = (regType || '').toLowerCase()
  if (t.includes('קולקטיבי') || t.includes('collective')) return 'Collective'
  if (t.includes('הסמכה')    || t.includes('certif'))      return 'Cert.'
  return 'Word'
}

// ── record parser ─────────────────────────────────────────────────────────────

function parseRecord(r, holderHint) {
  const tmNo      = String(r[F.tmNo] || '').trim()
  if (!tmNo) return null

  const markName  = (r[F.markNameEn] || r[F.markNameHe] || '—').trim()
  const ownerEn   = (r[F.ownerEn]    || '').trim()
  const ownerHe   = (r[F.ownerHe]    || '').trim()
  // ownerEn may be an IR number for international marks — prefer holderHint in that case
  const isNumeric = /^\d+$/.test(ownerEn)
  const applicant = (!isNumeric && ownerEn) ? ownerEn : holderHint || ownerEn || ownerHe || '—'

  const appDate   = isoDate(r[F.appDate])
  const regDate   = isoDate(r[F.regDate])
  const expDate   = isoDate(r[F.expiryDate])
  const rawStatus = (r[F.status] || '').trim()
  const status    = mapStatus(rawStatus, expDate)

  // NCL classes: "9; 35; 43" → "9, 35, 43" (sorted, deduped)
  const nclRaw = (r[F.ncl] || '').trim()
  const ncl    = nclRaw
    ? [...new Set(nclRaw.split(/[;,\s]+/)
        .map(n => parseInt(n.trim(), 10))
        .filter(n => !isNaN(n) && n > 0)
        .map(String))]
      .sort((a, b) => Number(a) - Number(b))
      .join(', ')
    : '—'

  return {
    id              : `ilpo-${tmNo}`,
    applicant,
    markName,
    registry        : 'ILPO',
    country         : 'Israel',
    serialNo        : tmNo,
    regNo           : tmNo,    // Israel uses one number for both application and registration
    kindOfMark      : mapKind(r[F.isDevice], r[F.regType]),
    ncl,
    applicationDate : appDate,
    publicationDate : '',
    registrationDate: regDate,
    expiryDate      : expDate,
    status,
    rawStatus,
  }
}

// ── CKAN fetch helpers ────────────────────────────────────────────────────────

async function ckanGet(action, params) {
  const url = new URL(`${CKAN_BASE}/${action}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v))
  const res = await fetch(url.toString(), { headers: BROWSER_HEADERS })
  if (!res.ok) throw new Error(`data.gov.il CKAN returned HTTP ${res.status} for ${action}`)
  const json = await res.json()
  if (!json.success) {
    throw new Error(json.error?.message || `CKAN ${action} error`)
  }
  return json.result
}

/** Full-text search a CKAN resource.  Returns { total, records }. */
async function ckanSearch(resourceId, q, offset = 0) {
  return ckanGet('datastore_search', {
    resource_id: resourceId,
    q,
    limit : PAGE_LIMIT,
    offset,
  })
}

/**
 * Fetch specific marks by their trademark numbers using CKAN SQL.
 * Uses PostgreSQL ANY() to avoid building a large IN clause.
 */
async function fetchMarksByNumbers(tmNos) {
  if (tmNos.length === 0) return []

  // Build: WHERE "מספר הסימן"::text = ANY(ARRAY['1','2',...])
  const arrayLiteral = `ARRAY[${tmNos.map(n => `'${String(n).replace(/'/g, "''")}'`).join(',')}]`
  const sql = `SELECT * FROM "${TM_RESOURCE}" WHERE "${F.tmNo}"::text = ANY(${arrayLiteral}) LIMIT ${MAX_RECORDS}`

  try {
    const result = await ckanGet('datastore_search_sql', { sql })
    return result.records || []
  } catch (sqlErr) {
    // datastore_search_sql may be disabled — fall back to individual filter lookups
    console.warn('[ilpo-search] SQL fallback triggered:', sqlErr.message)
    const BATCH = 10
    const all   = []
    for (let i = 0; i < tmNos.length; i += BATCH) {
      const slice = tmNos.slice(i, i + BATCH)
      const settled = await Promise.allSettled(slice.map(async no => {
        try {
          const r = await ckanGet('datastore_search', {
            resource_id: TM_RESOURCE,
            filters    : JSON.stringify({ [F.tmNo]: no }),
            limit      : 1,
          })
          return r.records?.[0] || null
        } catch { return null }
      }))
      for (const r of settled) if (r.status === 'fulfilled' && r.value) all.push(r.value)
    }
    return all
  }
}

// ── two-step holder search ────────────────────────────────────────────────────

/**
 * Search the holders dataset by applicant name.
 * Returns an array of trademark numbers (`מספר סימן לאומי`) belonging to
 * holders whose English name includes the search term.
 */
async function holderNamesToTmNos(holder) {
  const tmNos = []
  let offset  = 0

  // Normalise: lower-case for matching
  const lcHolder = holder.toLowerCase()

  while (tmNos.length < MAX_RECORDS) {
    const result = await ckanSearch(HOLD_RESOURCE, holder, offset)
    const records = result.records || []
    if (records.length === 0) break

    for (const r of records) {
      const nameEn = (r[F_HOLD.nameEn] || '').toLowerCase()
      const nameHe = (r[F_HOLD.nameHe] || '').trim()
      if (nameEn.includes(lcHolder) || nameHe.includes(holder)) {
        const no = String(r[F_HOLD.tmNo] || '').trim()
        if (no) tmNos.push(no)
      }
    }

    if (records.length < PAGE_LIMIT) break   // no more pages
    offset += PAGE_LIMIT
    if (offset >= Math.min(result.total, MAX_RECORDS * 3)) break
  }

  return [...new Set(tmNos)]
}

// ── main search ───────────────────────────────────────────────────────────────

async function searchByHolder(holder) {
  const seen    = new Set()
  const results = []

  function addRecord(raw, hint) {
    const rec = parseRecord(raw, hint)
    if (!rec || seen.has(rec.serialNo)) return
    seen.add(rec.serialNo)
    results.push(rec)
  }

  // ── Step 1: holders dataset → trademark numbers ──────────────────────────
  let tmNosFromHolders = []
  try {
    tmNosFromHolders = await holderNamesToTmNos(holder)
  } catch (e) {
    console.warn('[ilpo-search] holders lookup failed:', e.message)
  }

  // ── Step 2: fetch those mark details from main dataset ───────────────────
  if (tmNosFromHolders.length > 0) {
    try {
      const marks = await fetchMarksByNumbers(tmNosFromHolders)
      for (const r of marks) addRecord(r, holder)
    } catch (e) {
      console.warn('[ilpo-search] mark fetch failed:', e.message)
    }
  }

  // ── Step 3: direct full-text search on main dataset ───────────────────────
  // Catches national marks where the owner name is stored inline, and marks
  // whose mark name itself contains the holder name (e.g. "YANOLJA" marks).
  try {
    let offset = 0
    while (results.length < MAX_RECORDS) {
      const result = await ckanSearch(TM_RESOURCE, holder, offset)
      const records = result.records || []
      if (records.length === 0) break

      const lcHolder = holder.toLowerCase()
      for (const r of records) {
        const nameEn  = (r[F.ownerEn]    || '').toLowerCase()
        const nameHe  = (r[F.ownerHe]    || '').trim()
        const markEn  = (r[F.markNameEn] || '').toLowerCase()
        // Include if owner name contains holder (exact-ish) OR mark name matches
        const ownerMatch = !(/^\d+$/.test(nameEn)) && nameEn.includes(lcHolder)
        const markMatch  = markEn.includes(lcHolder)
        if (ownerMatch || markMatch) addRecord(r, holder)
      }

      if (records.length < PAGE_LIMIT) break
      offset += PAGE_LIMIT
      if (offset >= Math.min(result.total, MAX_RECORDS * 2)) break
    }
  } catch (e) {
    console.warn('[ilpo-search] main dataset search failed:', e.message)
  }

  return results.slice(0, MAX_RECORDS)
}

// ── bypass: direct lookup by trademark numbers ────────────────────────────────

async function fetchByTrademarkNumbers(tmNos, holderHint) {
  const marks = await fetchMarksByNumbers(tmNos.slice(0, MAX_RECORDS))
  return marks
    .map(r => parseRecord(r, holderHint))
    .filter(Boolean)
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

  // ?trademarkNumbers= bypass: comma-separated Israeli mark numbers
  const knownNos = (req.query.trademarkNumbers || '')
    .split(',').map(s => s.trim()).filter(Boolean)

  try {
    let results

    if (knownNos.length > 0) {
      results = await fetchByTrademarkNumbers(knownNos, holder)
    } else {
      results = await searchByHolder(holder)
    }

    // 10-minute CDN cache — data.gov.il updates daily
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=60')
    return res.status(200).json({
      count   : results.length,
      results : results.map(normaliseTrademarkData),
    })

  } catch (err) {
    console.error('[ilpo-search]', err.message)

    const bypass =
      `Supply known ILPO trademark numbers directly: ?holder=${enc(holder)}&trademarkNumbers=12345,67890`

    return res.status(502).json({
      error     : 'Failed to fetch data from ILPO / data.gov.il.',
      detail    : err.message,
      workaround: bypass,
      note      : 'The Israeli trademark register is published at https://data.gov.il as a CKAN open-data resource. '
                + 'Verify the resource ID (6284d4a9-fdd4-45c9-a1d6-58143c7d8127) is still current if this error persists.',
    })
  }
}
