/**
 * Vercel serverless function: /api/wipo-search
 *
 * Queries the WIPO Madrid Monitor for trademarks by holder name.
 *
 * Search endpoint  : https://www3.wipo.int/madrid/monitor/api/v1/results
 * Individual record: https://www.wipo.int/madrid/monitor/api/v1/tmxml/data/{id}
 *
 * No API key required — fully public.
 */

const SEARCH_BASE = 'https://www3.wipo.int/madrid/monitor/api/v1/results'
const RECORD_BASE = 'https://www.wipo.int/madrid/monitor/api/v1/tmxml/data'
const PAGE_SIZE   = 50
const MAX_RECORDS = 200   // cap to avoid overwhelming the API

// ── helpers ──────────────────────────────────────────────────────────────────

/** Extract the text content of the first matching XML tag. */
function tag(xml, name) {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'))
  return m ? m[1].replace(/<[^>]+>/g, '').trim() : ''
}

/** Extract the text content of every matching XML tag. */
function allTags(xml, name) {
  const re  = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'gi')
  const out = []
  let m
  while ((m = re.exec(xml)) !== null) {
    const text = m[1].replace(/<[^>]+>/g, '').trim()
    if (text) out.push(text)
  }
  return out
}

/** Extract the full inner XML of the first matching element. */
function innerXml(xml, name) {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'))
  return m ? m[1] : ''
}

/** Convert WIPO date string (YYYYMMDD or YYYY-MM-DD) to ISO YYYY-MM-DD. */
function isoDate(str) {
  if (!str) return ''
  const s = str.replace(/-/g, '')
  if (s.length !== 8) return ''
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
}

/** Map a WIPO status code to the dashboard status vocabulary. */
function mapStatus(code) {
  const c = (code || '').toLowerCase()
  if (c.includes('registered') || c.includes('active'))   return 'Active'
  if (c.includes('pending') || c.includes('filed'))       return 'Pending'
  if (c.includes('expir') || c.includes('laps') ||
      c.includes('cancel') || c.includes('ceas') ||
      c.includes('refus') || c.includes('withdr'))        return 'Expired'
  return 'Active'  // fallback
}

/** Derive a dashboard kindOfMark value from WIPO KindMark / MarkFeature. */
function mapKind(kindMark, markFeature) {
  const src = ((kindMark || '') + ' ' + (markFeature || '')).toLowerCase()
  if (src.includes('word') || src.includes('verbal'))       return 'Word'
  if (src.includes('figur') || src.includes('device') ||
      src.includes('logo'))                                  return 'Device'
  if (src.includes('combin') || src.includes('mixed'))      return 'Combined'
  if (src.includes('colour') || src.includes('color'))      return 'Colour'
  if (src.includes('3d') || src.includes('three'))          return '3D'
  if (src.includes('sound'))                                return 'Sound'
  return kindMark || markFeature || '—'
}

// ── search ────────────────────────────────────────────────────────────────────

/**
 * Fetch one page of search results from the Madrid Monitor.
 * Returns { total, ids } where ids is an array of IR number strings.
 */
async function fetchSearchPage(holder, start) {
  const params = new URLSearchParams({
    holderSearch : holder,
    start        : String(start),
    rows         : String(PAGE_SIZE),
  })
  const url = `${SEARCH_BASE}?${params}`

  const res = await fetch(url, {
    headers: {
      Accept        : 'application/json, text/javascript, */*',
      'User-Agent'  : 'trademark-dashboard/1.0',
    },
  })

  if (!res.ok) {
    throw new Error(`WIPO search HTTP ${res.status} — URL: ${url}`)
  }

  const json = await res.json()

  // Tolerate a few different response shapes
  const total   = json.total ?? json.totalCount ?? json.numFound ?? 0
  const records = json.records ?? json.results ?? json.docs ?? []
  const ids     = records.map(r => r.id ?? r.irNumber ?? r.registrationNumber).filter(Boolean)

  return { total: Number(total), ids }
}

/** Collect all matching IR IDs for a holder name, respecting MAX_RECORDS. */
async function searchAllIds(holder) {
  const first = await fetchSearchPage(holder, 0)
  const ids   = [...first.ids]
  const total = Math.min(first.total, MAX_RECORDS)

  const remaining = total - ids.length
  if (remaining > 0) {
    const pages = Math.ceil(remaining / PAGE_SIZE)
    const fetches = []
    for (let i = 1; i <= pages; i++) {
      fetches.push(fetchSearchPage(holder, i * PAGE_SIZE))
    }
    const results = await Promise.allSettled(fetches)
    for (const r of results) {
      if (r.status === 'fulfilled') ids.push(...r.value.ids)
    }
  }

  // Deduplicate
  return [...new Set(ids)].slice(0, MAX_RECORDS)
}

// ── record fetch + XML parse ──────────────────────────────────────────────────

/** Fetch and parse one TMXML record by its IR number / WO ID. */
async function fetchRecord(id) {
  const url = `${RECORD_BASE}/${encodeURIComponent(id)}`

  const res = await fetch(url, {
    headers: {
      Accept       : 'application/xml, text/xml, */*',
      'User-Agent' : 'trademark-dashboard/1.0',
    },
  })

  if (!res.ok) return null   // skip missing records silently

  const xml = await res.text()

  // ── holder / applicant ──
  // TMXML uses <HolderBag><Holder>…<FreeFormatName> or <EntityName>
  const holderBag = innerXml(xml, 'HolderBag')
  const applicant = tag(holderBag, 'FreeFormatName') ||
                    tag(holderBag, 'EntityName')     ||
                    tag(holderBag, 'OrganizationName') ||
                    tag(xml, 'FreeFormatName')       ||
                    tag(xml, 'EntityName')           ||
                    '—'

  // ── registration / application numbers ──
  const irNumber  = tag(xml, 'RegistrationNumber') || id
  const appNumber = tag(xml, 'ApplicationNumber')  || `WO/${id}`

  // ── dates (YYYYMMDD → YYYY-MM-DD) ──
  const applicationDate  = isoDate(tag(xml, 'FilingDate')       || tag(xml, 'ApplicationDate'))
  const registrationDate = isoDate(tag(xml, 'RegistrationDate') || tag(xml, 'RecordDate'))
  const expiryDate       = isoDate(tag(xml, 'ExpiryDate')       || tag(xml, 'RenewalDate'))

  // ── mark name ──
  const markName = tag(xml, 'MarkVerbalElementText') ||
                   tag(xml, 'WordMarkSpecification')  ||
                   tag(xml, 'MarkText')               ||
                   '—'

  // ── kind + feature ──
  const kindMark   = tag(xml, 'KindMark')
  const markFeature = tag(xml, 'MarkFeature') || tag(xml, 'MarkCategory')
  const kindOfMark  = mapKind(kindMark, markFeature)

  // ── NCL classes ──
  const classNumbers = allTags(xml, 'ClassNumber')
  const ncl          = [...new Set(classNumbers)].sort((a, b) => Number(a) - Number(b)).join(', ') || '—'

  // ── status ──
  const statusCode = tag(xml, 'MarkCurrentStatusCode') ||
                     tag(xml, 'StatusCode')            ||
                     tag(xml, 'MarkStatus')
  const status = mapStatus(statusCode)

  // ── designated countries ──
  const countryCodes       = allTags(xml, 'ST3CountryCode')
  const designatedCountries = [...new Set(countryCodes)].sort()

  return {
    id               : `wipo-${irNumber}`,
    applicant,
    markName,
    registry         : 'WIPO Madrid',
    country          : 'International (WIPO)',
    designatedCountries,           // extra field, shown as tooltip
    serialNo         : appNumber,
    regNo            : irNumber,
    kindOfMark,
    markFeature      : markFeature || kindMark || '',
    ncl,
    applicationDate,
    publicationDate  : '',         // not in TMXML
    registrationDate,
    expiryDate,
    status,
  }
}

// ── handler ───────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  // CORS — allow any origin so the local Vite dev server can call us
  res.setHeader('Access-Control-Allow-Origin',  '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const holder = (req.query.holder || '').trim()
  if (!holder) {
    return res.status(400).json({ error: 'Missing required query parameter: holder' })
  }

  try {
    const ids = await searchAllIds(holder)

    if (ids.length === 0) {
      return res.status(200).json({ count: 0, results: [] })
    }

    // Fetch records in parallel, in batches of 10 to be polite
    const BATCH = 10
    const results = []
    for (let i = 0; i < ids.length; i += BATCH) {
      const batch = ids.slice(i, i + BATCH)
      const fetched = await Promise.allSettled(batch.map(id => fetchRecord(id)))
      for (const r of fetched) {
        if (r.status === 'fulfilled' && r.value) results.push(r.value)
      }
    }

    // 10-minute cache — WIPO data doesn't change frequently
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=60')

    return res.status(200).json({ count: results.length, results })
  } catch (err) {
    console.error('[wipo-search] error:', err.message)
    return res.status(502).json({
      error   : 'Failed to fetch data from WIPO Madrid Monitor',
      detail  : err.message,
    })
  }
}
