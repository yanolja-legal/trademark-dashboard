/**
 * Vercel serverless function: /api/wipo-search
 *
 * Fetches WIPO Madrid trademark records via the unofficial e-Madrid Monitor flow.
 *
 *  Step 1: POST select.jsp with the holder query → { qi, tot }
 *  Step 2: For each NO in 1..tot, GET getData.jsp?qi=…&NO=NO&TOT=tot → one record
 *
 * ⚠️ These endpoints are not publicly documented. WIPO can change or block them
 *    without notice. Use ?debug=true to inspect raw responses for diagnostics.
 *    If this stops working, fall back to manual CSV upload in the API Setup tab.
 *
 * Field mapping (per spec):
 *  HOL → applicant; BRAND → markName; ID → serialNo (IRN);
 *  MARK_TYPE → kindOfMark; IDATE → applicationDate; ST → status (both via
 *  normalise.js); designations[] → designatedCountries: [{code,status,regNo}].
 *  registry is fixed to 'WIPO Madrid'.
 */

import { normaliseTrademarkData } from '../src/normalise.js'

// ── constants ────────────────────────────────────────────────────────────────

const SELECT_URL  = 'https://www3.wipo.int/madrid/monitor/jsp/select.jsp'
const GETDATA_URL = 'https://www3.wipo.int/madrid/monitor/jsp/getData.jsp'
const MAX_RECORDS    = 100
const TIMEOUT_MS     = 15_000
const PARALLEL_LIMIT = 5

const HEADERS = {
  'User-Agent'     : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept'         : 'application/json, text/javascript, */*; q=0.01',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer'        : 'https://www3.wipo.int/madrid/monitor/en/',
  'X-Requested-With': 'XMLHttpRequest',
}

// ── helpers ───────────────────────────────────────────────────────────────────

const enc = s => encodeURIComponent(s)

/** Convert WIPO date strings (DD.MM.YYYY | YYYYMMDD | YYYY-MM-DD) to ISO. */
function isoDate(raw) {
  if (!raw) return ''
  const s = String(raw).trim()
  const dmy = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/)
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  return ''
}

/** Read the first defined field from an object across alternative keys. */
function pick(obj, ...keys) {
  for (const k of keys) {
    if (obj && obj[k] !== undefined && obj[k] !== null && obj[k] !== '') return obj[k]
  }
  return ''
}

/** fetch() wrapped with a configurable AbortController timeout. */
async function fetchT(url, opts = {}) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal })
    return res
  } finally { clearTimeout(timer) }
}

/** Try to parse JSON; if not JSON, return the raw text inside a wrapper. */
async function readBody(res) {
  const text = await res.text()
  try { return { json: JSON.parse(text), raw: text } }
  catch { return { json: null, raw: text } }
}

// ── Step 1: select.jsp → query token ─────────────────────────────────────────

async function getQueryToken(holder) {
  const form = new URLSearchParams()
  form.append('HOL', holder)
  form.append('LANG', 'en')
  form.append('STATUS', 'Active')
  const res = await fetchT(SELECT_URL, {
    method : 'POST',
    headers: { ...HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' },
    body   : form.toString(),
  })
  if (!res.ok) throw new Error(`select.jsp returned HTTP ${res.status}`)
  const { json, raw } = await readBody(res)
  if (!json) throw new Error(`select.jsp returned non-JSON (first 200 chars: ${raw.slice(0, 200)})`)
  const qi  = pick(json, 'qi', 'QI', 'queryId')
  const tot = parseInt(pick(json, 'tot', 'TOT', 'total'), 10) || 0
  return { qi, tot, raw: json }
}

// ── Step 2: getData.jsp → one record ─────────────────────────────────────────

async function fetchRecord(qi, no, tot) {
  const url = `${GETDATA_URL}?qi=${enc(qi)}&LANG=en&NO=${no}&TOT=${tot}&DES=1`
  const res = await fetchT(url, { headers: HEADERS })
  if (!res.ok) throw new Error(`getData.jsp NO=${no} returned HTTP ${res.status}`)
  const { json, raw } = await readBody(res)
  if (!json) throw new Error(`getData.jsp NO=${no} returned non-JSON (first 200 chars: ${raw.slice(0, 200)})`)
  return json
}

// ── Step 3 + 4: map a raw WIPO record → dashboard record ─────────────────────

function mapRecord(raw, holderHint) {
  const id         = pick(raw, 'ID', 'IRN', 'irn')
  if (!id) return null
  const irn        = String(id).replace(/^ROM\./i, '').trim()

  const designations = (raw.designations || raw.DES || []).map(d => ({
    code  : pick(d, 'country', 'CC', 'code'),
    status: pick(d, 'status', 'ST'),
    regNo : pick(d, 'regNo', 'REG', 'registrationNo'),
  })).filter(d => d.code)

  return normaliseTrademarkData({
    id              : `wipo-${irn}`,
    applicant       : pick(raw, 'HOL', 'holder') || holderHint || '',
    markName        : pick(raw, 'BRAND', 'mark', 'markName') || '—',
    registry        : 'WIPO Madrid',
    country         : 'International',
    serialNo        : irn,
    regNo           : irn,
    kindOfMark      : pick(raw, 'MARK_TYPE', 'markType', 'kind'),
    ncl             : pick(raw, 'NCL', 'classes', 'niceClasses'),
    applicationDate : isoDate(pick(raw, 'IDATE', 'applicationDate')),
    publicationDate : '',
    registrationDate: isoDate(pick(raw, 'RDATE', 'registrationDate')),
    expiryDate      : isoDate(pick(raw, 'EDATE', 'expiryDate')),
    status          : pick(raw, 'ST', 'status'),
    designatedCountries: designations,
    source          : 'wipo',
  })
}

// ── handler ──────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET')     return res.status(405).json({ error: 'Method not allowed' })

  const holder = (req.query.holder || '').trim()
  const debug  = req.query.debug === 'true'

  if (!holder) {
    return res.status(400).json({ error: 'Missing required query parameter: holder' })
  }

  try {
    const { qi, tot, raw: selectRaw } = await getQueryToken(holder)

    if (debug) {
      return res.status(200).json({ debug: true, step: 'select.jsp', qi, tot, raw: selectRaw })
    }
    if (!qi || !tot) {
      return res.status(200).json({ count: 0, results: [] })
    }

    const total = Math.min(tot, MAX_RECORDS)
    const records = []
    for (let i = 1; i <= total; i += PARALLEL_LIMIT) {
      const batch = []
      for (let j = i; j < i + PARALLEL_LIMIT && j <= total; j++) {
        batch.push(fetchRecord(qi, j, total).catch(err => ({ __error: err.message, __no: j })))
      }
      records.push(...await Promise.all(batch))
    }

    const errors = records.filter(r => r.__error)
    const valid  = records.filter(r => !r.__error)
    const mapped = valid.map(r => mapRecord(r, holder)).filter(Boolean)

    return res.status(200).json({
      count  : mapped.length,
      results: mapped,
      ...(errors.length ? { warnings: errors } : {}),
    })

  } catch (err) {
    return res.status(502).json({
      error : 'WIPO fetch failed',
      detail: err.message,
      hint  : 'These endpoints are unofficial and may have changed. Try ?debug=true to inspect the raw response.',
    })
  }
}
