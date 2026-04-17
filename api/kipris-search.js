/**
 * Vercel serverless function: /api/kipris-search
 *
 * Fetches Korean trademark data from KIPRIS Plus
 * (Korean Intellectual Property Information Search — KIPO / KIPI).
 *
 * ── Authentication ────────────────────────────────────────────────────────
 * Requires KIPRIS_API_KEY set in Vercel environment variables.
 * Apply at: https://plus.kipris.or.kr  (free tier: 1 000 calls/month)
 * If the key is not set, returns { status: 'pending', results: [] }.
 *
 * ── API endpoint used ─────────────────────────────────────────────────────
 * POST/GET https://plus.kipris.or.kr/kipo-api/kipi/trademarkInfoSearchService/applicantNamesearchInfo
 *
 * Query parameters:
 *   applicantName  — applicant name to search (Korean or English)
 *   numOfRows      — records per page (max 500; we use 100)
 *   pageNo         — 1-based page number
 *   accessKey      — KIPRIS API key
 *
 * ── Response format ───────────────────────────────────────────────────────
 * XML:
 *   <response>
 *     <header><resultCode>E0000</resultCode><resultMsg>정상</resultMsg></header>
 *     <body>
 *       <count><totalCount>N</totalCount></count>
 *       <items>
 *         <item>
 *           <applicationNumber>4020220123456</applicationNumber>
 *           <trademarkName>야놀자</trademarkName>
 *           <applicantName>야놀자 주식회사</applicantName>
 *           <applicationDate>20220315</applicationDate>
 *           <publicationNumber>40-2022-0098765</publicationNumber>
 *           <publicationDate>20220920</publicationDate>
 *           <registrationNumber>4012345670000</registrationNumber>
 *           <registrationDate>20230110</registrationDate>
 *           <expirationDate>20330110</expirationDate>
 *           <registerStatus>등록</registerStatus>
 *           <markFeatureName>문자</markFeatureName>
 *           <asignProductMainCodeList>
 *             <asignProductMainCodeList>9</asignProductMainCodeList>
 *             <asignProductMainCodeList>42</asignProductMainCodeList>
 *           </asignProductMainCodeList>
 *         </item>
 *       </items>
 *     </body>
 *   </response>
 *
 * ── Number formats ────────────────────────────────────────────────────────
 *   Application:  4020220123456   → 40-2022-0123456  (prefix 40 = trademark)
 *   Registration: 4012345670000   → 40-1234567-0000
 *
 * ── Status mapping (Korean → dashboard) ──────────────────────────────────
 *   등록 / 존속 / 갱신  →  Active
 *   출원 / 공고         →  Pending
 *   소멸 / 취소 / 무효 / 포기 / 거절 / 실효 / 취하  →  Expired
 *
 * ── Kind-of-mark mapping ──────────────────────────────────────────────────
 *   문자  →  Word
 *   도형  →  Device
 *   결합  →  Combined
 *   입체  →  3D
 *   소리  →  Sound
 *   색채  →  Colour
 *   냄새  →  Scent
 */

export const config = { runtime: 'nodejs' }

// ── constants ─────────────────────────────────────────────────────────────────

const BASE_URL   = 'http://plus.kipris.or.kr/kipo-api/kipi/trademarkInfoSearchService/applicantNamesearchInfo'
const ROWS_PER_PAGE = 100
const MAX_RECORDS   = 500   // safety cap — most companies have <100 KR marks

// ── utilities ─────────────────────────────────────────────────────────────────

/** Fetch with 15-second hard timeout. */
async function fetchWithTimeout(url, ms = 15000) {
  const ctrl  = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: 'application/xml, text/xml, */*' },
    })
    clearTimeout(timer)
    return res
  } catch (err) {
    clearTimeout(timer)
    if (err.name === 'AbortError') throw new Error('KIPRIS request timed out after 15s')
    throw err
  }
}

/** Return first text content of `<name>…</name>`, or ''. */
function xmlTag(xml, name) {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'))
  return m ? m[1].replace(/<[^>]+>/g, '').trim() : ''
}

/**
 * Extract all <item>…</item> blocks from the response body.
 * KIPRIS nests items under <items><item>…</item></items>.
 */
function xmlItems(xml) {
  const out = []
  const re  = /<item>([\s\S]*?)<\/item>/gi
  let m
  while ((m = re.exec(xml)) !== null) out.push(m[1])
  return out
}

/** Convert YYYYMMDD → YYYY-MM-DD. */
function isoDate(raw) {
  if (!raw) return ''
  const s = raw.trim().replace(/\D/g, '')
  if (s.length === 8) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
  return ''
}

/** Map Korean registration status to dashboard vocabulary. */
function mapStatus(korean, expiryISO) {
  const s = (korean || '').trim()
  if (['등록', '존속', '갱신'].includes(s))                                         return 'Active'
  if (['출원', '공고', '출원공고', '심사중'].includes(s))                            return 'Pending'
  if (['소멸', '취소', '무효', '포기', '거절', '실효', '취하', '불등록'].includes(s)) return 'Expired'

  // Unknown Korean status — fall back to expiry date
  if (expiryISO) {
    const days = (new Date(expiryISO) - new Date()) / 86_400_000
    if (days < 0)   return 'Expired'
    if (days < 90)  return 'Expiring Soon'
    return 'Active'
  }
  return 'Active'
}

/**
 * Map KIPRIS markFeatureName (Korean) to dashboard vocabulary.
 * 문자=Word  도형=Device  결합=Combined  입체=3D  소리=Sound  색채=Colour  냄새=Scent
 */
function mapKind(raw) {
  const s = (raw || '').trim()
  if (s.includes('문자'))  return 'Word'
  if (s.includes('도형'))  return 'Device'
  if (s.includes('결합'))  return 'Combined'
  if (s.includes('입체'))  return '3D'
  if (s.includes('소리'))  return 'Sound'
  if (s.includes('색채'))  return 'Colour'
  if (s.includes('냄새'))  return 'Scent'
  if (!s)                  return 'Word'
  return s
}

/**
 * Format a raw KIPRIS application number.
 *   4020220123456 (13 digits, prefix 40) → 40-2022-0123456
 */
function fmtApp(raw) {
  if (!raw) return ''
  const s = raw.trim()
  if (/^\d{13}$/.test(s)) return `${s.slice(0, 2)}-${s.slice(2, 6)}-${s.slice(6)}`
  return s
}

/**
 * Format a raw KIPRIS registration number.
 *   4012345670000 (13 digits) → 40-1234567-0000
 */
function fmtReg(raw) {
  if (!raw) return ''
  const s = raw.trim()
  if (/^\d{13}$/.test(s)) return `${s.slice(0, 2)}-${s.slice(2, 9)}-${s.slice(9)}`
  return s
}

/**
 * Extract NCL class numbers from the nested <asignProductMainCodeList> block.
 * KIPRIS wraps the list in an outer tag of the same name:
 *   <asignProductMainCodeList>
 *     <asignProductMainCodeList>9</asignProductMainCodeList>
 *     <asignProductMainCodeList>42</asignProductMainCodeList>
 *   </asignProductMainCodeList>
 * We match only leaf instances (pure digit content).
 */
function parseNcl(item) {
  const codes = []
  const re    = /<asignProductMainCodeList>(\d+)<\/asignProductMainCodeList>/gi
  let m
  while ((m = re.exec(item)) !== null) {
    const n = parseInt(m[1], 10)
    if (!isNaN(n)) codes.push(n)
  }
  // Fallback: <fullText> sometimes carries a class code
  if (!codes.length) {
    const ft = xmlTag(item, 'fullText')
    if (ft && /^\d+$/.test(ft.trim())) codes.push(parseInt(ft.trim(), 10))
  }
  return [...new Set(codes)].sort((a, b) => a - b).join(', ')
}

/** Convert one <item> block into a dashboard trademark record. */
function parseItem(item, queryApplicant) {
  const rawApp   = xmlTag(item, 'applicationNumber')
  const rawReg   = xmlTag(item, 'registrationNumber')
  const statusKR = xmlTag(item, 'registerStatus') || xmlTag(item, 'applicationStatus')
  const expiry   = isoDate(xmlTag(item, 'expirationDate'))
  const status   = mapStatus(statusKR, expiry)
  const ncl      = parseNcl(item)
  const appNo    = fmtApp(rawApp)

  return {
    id:               `kipris-${rawApp || queryApplicant + Math.random().toString(36).slice(2, 7)}`,
    applicant:        xmlTag(item, 'applicantName') || queryApplicant,
    markName:         xmlTag(item, 'trademarkName') || '—',
    registry:         'KIPRIS',
    country:          'South Korea',
    serialNo:         appNo,
    regNo:            fmtReg(rawReg),
    kindOfMark:       mapKind(xmlTag(item, 'markFeatureName')),
    ncl,
    applicationDate:  isoDate(xmlTag(item, 'applicationDate')),
    publicationDate:  isoDate(xmlTag(item, 'publicationDate')),
    registrationDate: isoDate(xmlTag(item, 'registrationDate')),
    expiryDate:       expiry,
    status,
    source:           'live',
  }
}

// ── KIPRIS API caller ─────────────────────────────────────────────────────────

/** Fetch one page of results. Returns { totalCount, items: [rawXmlStrings] }. */
async function fetchPage(applicantName, accessKey, pageNo) {
  const url = `${BASE_URL}?applicantName=${encodeURIComponent(applicantName)}` +
              `&numOfRows=${ROWS_PER_PAGE}&pageNo=${pageNo}` +
              `&ServiceKey=${encodeURIComponent(accessKey)}`

  const res = await fetchWithTimeout(url)
  if (!res.ok) throw new Error(`KIPRIS returned HTTP ${res.status}`)

  const xml = await res.text()

  // Check API-level error — KIPRIS uses successYN=N for failures
  const successYN  = xmlTag(xml, 'successYN')
  const resultCode = xmlTag(xml, 'resultCode')
  if (successYN === 'N') {
    const msg = xmlTag(xml, 'resultMsg') || resultCode
    throw new Error(`KIPRIS API error: ${msg} (code ${resultCode})`)
  }

  const totalCount = parseInt(xmlTag(xml, 'totalCount') || '0', 10)
  const items      = xmlItems(xml)
  return { totalCount, items }
}

/** Fetch all pages for an applicant name, up to MAX_RECORDS. */
async function fetchAll(applicantName, accessKey) {
  const first    = await fetchPage(applicantName, accessKey, 1)
  const rawItems = [...first.items]
  const total    = Math.min(first.totalCount, MAX_RECORDS)

  if (total > ROWS_PER_PAGE) {
    const extraPages = Math.ceil((total - ROWS_PER_PAGE) / ROWS_PER_PAGE)
    for (let p = 2; p <= extraPages + 1; p++) {
      if (rawItems.length >= MAX_RECORDS) break
      try {
        const page = await fetchPage(applicantName, accessKey, p)
        rawItems.push(...page.items)
      } catch (err) {
        console.warn(`[kipris-search] page ${p} failed: ${err.message}`)
        break
      }
    }
  }

  return rawItems.slice(0, MAX_RECORDS)
}

// ── handler ───────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin',  '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET')     return res.status(405).json({ error: 'Method not allowed' })

  // ── Check for API key ──────────────────────────────────────────────────────
  const accessKey = process.env.KIPRIS_API_KEY
  if (!accessKey) {
    return res.status(200).json({
      status:  'pending',
      message: 'KIPRIS_API_KEY is not configured. Add it to Vercel environment variables.',
      results: [],
    })
  }

  // ── Validate query params ──────────────────────────────────────────────────
  const applicantName = (req.query.applicantName || '').trim()
  if (!applicantName) {
    return res.status(400).json({ error: 'Missing required parameter: applicantName' })
  }

  // ── Fetch & return ─────────────────────────────────────────────────────────
  try {
    const rawItems = await fetchAll(applicantName, accessKey)

    const results = rawItems
      .map(item => parseItem(item, applicantName))
      .filter(r => r.serialNo || r.markName !== '—')   // skip genuinely empty rows

    // 1-hour CDN cache — KIPRIS data updates daily
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=300')
    return res.status(200).json({ count: results.length, results })

  } catch (err) {
    console.error('[kipris-search]', err.message)
    return res.status(502).json({
      error:  'Failed to fetch data from KIPRIS.',
      detail: err.message,
    })
  }
}
