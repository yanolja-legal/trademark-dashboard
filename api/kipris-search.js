/**
 * Vercel serverless function: /api/kipris-search
 *
 * Fetches Korean trademark data from KIPRIS Plus.
 * Requires KIPRIS_API_KEY in Vercel environment variables.
 *
 * ── Endpoint ──────────────────────────────────────────────────────────────
 * GET http://plus.kipris.or.kr/openapi/rest/trademarkInfoSearchService/applicantNamesearchInfo
 *
 * Key input parameters:
 *   applicantName  — applicant name (Korean)
 *   application    — include filed marks        (true/false)
 *   registration   — include registered marks   (true/false)
 *   refused        — include refused marks       (true/false)
 *   expiration     — include expired marks       (true/false)
 *   withdrawal     — include withdrawn marks     (true/false)
 *   publication    — include published marks     (true/false)
 *   cancel         — include cancelled marks     (true/false)
 *   abandonment    — include abandoned marks     (true/false)
 *   docsStart      — page number (1-based)
 *   docsCount      — records per page (max 500)
 *   accessKey      — KIPRIS API key
 *
 * ── Response XML structure ────────────────────────────────────────────────
 *   <response>
 *     <header><successYN>Y</successYN></header>
 *     <body>
 *       <items>
 *         <TotalSearchCount>N</TotalSearchCount>
 *         <TradeMarkInfo>
 *           <ApplicationNumber>4020220123456</ApplicationNumber>
 *           <Title>야놀자</Title>
 *           <ApplicantName>야놀자 주식회사</ApplicantName>
 *           <ApplicationDate>20220315</ApplicationDate>
 *           <PublicNumber>...</PublicNumber>
 *           <PublicDate>20220920</PublicDate>
 *           <RegistrationNumber>4012345670000</RegistrationNumber>
 *           <RegistrationDate>20230110</RegistrationDate>
 *           <ApplicationStatus>등록</ApplicationStatus>
 *           <GoodClassificationCode>G0901G4201</GoodClassificationCode>
 *           <ViennaCode>...</ViennaCode>
 *         </TradeMarkInfo>
 *       </items>
 *     </body>
 *   </response>
 */

export const config = { runtime: 'nodejs' }

// ── constants ─────────────────────────────────────────────────────────────────

const BASE_URL      = 'http://plus.kipris.or.kr/openapi/rest/trademarkInfoSearchService/applicantNamesearchInfo'
const ROWS_PER_PAGE = 100
const MAX_RECORDS   = 500

// Boolean filter params — all statuses and all mark types set to true
const STATUS_PARAMS = 'application=true&registration=true&refused=true' +
                      '&expiration=true&withdrawal=true&publication=true' +
                      '&cancel=true&abandonment=true' +
                      '&trademark=true&serviceMark=true&trademarkServiceMark=true' +
                      '&businessEmblem=true&collectiveMark=true&geoOrgMark=true' +
                      '&internationalMark=true&certMark=true&geoCertMark=true' +
                      '&character=true&compositionCharacter=true&figure=true' +
                      '&figureComposition=true&sound=true&fragrance=true' +
                      '&color=true&colorMixed=true&dimension=true' +
                      '&hologram=true&motion=true&visual=true&invisible=true'

// ── utilities ─────────────────────────────────────────────────────────────────

async function fetchWithTimeout(url, ms = 25000) {
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

/** Return first text content of <name>…</name>, or ''. */
function xmlTag(xml, name) {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'))
  return m ? m[1].replace(/<[^>]+>/g, '').trim() : ''
}

/** Extract all <TradeMarkInfo>…</TradeMarkInfo> blocks. */
function xmlItems(xml) {
  const out = []
  const re  = /<TradeMarkInfo>([\s\S]*?)<\/TradeMarkInfo>/gi
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

/** Map Korean ApplicationStatus to dashboard vocabulary. */
function mapStatus(korean) {
  const s = (korean || '').trim()
  if (['등록', '존속', '갱신'].some(v => s.includes(v)))                               return 'Active'
  if (['출원', '공고', '출원공고', '심사중'].some(v => s.includes(v)))                  return 'Pending'
  if (['소멸', '취소', '무효', '포기', '거절', '실효', '취하', '불등록'].some(v => s.includes(v))) return 'Expired'
  return 'Active'
}

/**
 * Derive kind-of-mark from ViennaCode and ApplicationNumber prefix.
 *   ViennaCode present → Device or Combined
 *   Prefix 41 → Service Mark
 *   Default → Word
 */
function mapKind(viennaCode, appNo) {
  if (viennaCode && viennaCode.trim()) return 'Device'
  const prefix = (appNo || '').slice(0, 2)
  if (prefix === '41') return 'Service Mark'
  return 'Word'
}

/**
 * Parse NCL class numbers from GoodClassificationCode.
 * KIPRIS format: concatenated 4-char codes e.g. "G0901G4201"
 * where G + 2-digit class + 2-digit subclass.
 * Falls back to parsing any standalone 1-2 digit numbers.
 */
function parseNcl(raw) {
  if (!raw) return ''
  const s = raw.trim()
  const codes = []

  // Primary: KIPRIS format G{class:2}{sub:2} e.g. G0901 → class 9
  const re1 = /G(\d{2})\d{2}/gi
  let m
  while ((m = re1.exec(s)) !== null) {
    const n = parseInt(m[1], 10)
    if (n >= 1 && n <= 45) codes.push(n)
  }

  // Fallback: plain numbers separated by spaces/commas
  if (!codes.length) {
    s.split(/[\s,;]+/).forEach(t => {
      const n = parseInt(t.trim(), 10)
      if (n >= 1 && n <= 45) codes.push(n)
    })
  }

  return [...new Set(codes)].sort((a, b) => a - b).join(', ')
}

/** Format application number: 4020220123456 → 40-2022-0123456 */
function fmtApp(raw) {
  if (!raw) return ''
  const s = raw.trim()
  if (/^\d{13}$/.test(s)) return `${s.slice(0, 2)}-${s.slice(2, 6)}-${s.slice(6)}`
  return s
}

/** Format registration number: 4012345670000 → 40-1234567-0000 */
function fmtReg(raw) {
  if (!raw) return ''
  const s = raw.trim()
  if (/^\d{13}$/.test(s)) return `${s.slice(0, 2)}-${s.slice(2, 9)}-${s.slice(9)}`
  return s
}

// Maps partial Korean applicant names (as they appear in KIPRIS) to English entity names
const KIPRIS_NAME_MAP = [
  { contains: '야놀자 클라우드', english: 'Yanolja Cloud Pte. Ltd.' },
  { contains: '놀유니버스',     english: 'Nol Universe Co., Ltd.'  },
  { contains: '야놀자',         english: 'Yanolja Co., Ltd.'       },
]

function mapApplicantName(koreanName) {
  if (!koreanName) return koreanName
  const match = KIPRIS_NAME_MAP.find(m => koreanName.includes(m.contains))
  return match ? match.english : koreanName
}

/** Convert one <TradeMarkInfo> block into a dashboard trademark record. */
function parseItem(item, queryApplicant) {
  const rawApp    = xmlTag(item, 'ApplicationNumber')
  const rawReg    = xmlTag(item, 'RegistrationNumber')
  const statusKR  = xmlTag(item, 'ApplicationStatus')
  const viennaCode = xmlTag(item, 'ViennaCode')
  const appNo     = fmtApp(rawApp)

  const koreanApplicant = xmlTag(item, 'ApplicantName') || xmlTag(item, 'RegistrationRightholderName') || queryApplicant

  return {
    id:               `kipris-${rawApp || queryApplicant + Math.random().toString(36).slice(2, 7)}`,
    applicant:        mapApplicantName(koreanApplicant),
    markName:         xmlTag(item, 'Title') || '—',
    registry:         'KIPRIS',
    country:          'South Korea',
    serialNo:         appNo,
    regNo:            fmtReg(rawReg),
    kindOfMark:       mapKind(viennaCode, rawApp),
    ncl:              parseNcl(xmlTag(item, 'GoodClassificationCode')),
    applicationDate:  isoDate(xmlTag(item, 'ApplicationDate')),
    publicationDate:  isoDate(xmlTag(item, 'PublicDate')),
    registrationDate: isoDate(xmlTag(item, 'RegistrationDate')),
    expiryDate:       '',
    status:           mapStatus(statusKR),
    source:           'live',
  }
}

// ── KIPRIS API caller ─────────────────────────────────────────────────────────

/** Fetch one page of results. Returns { totalCount, items: [rawXmlStrings] }. */
async function fetchPage(applicantName, accessKey, pageNo) {
  const url = `${BASE_URL}?applicantName=${encodeURIComponent(applicantName)}` +
              `&${STATUS_PARAMS}` +
              `&docsStart=${pageNo}&docsCount=${ROWS_PER_PAGE}` +
              `&accessKey=${encodeURIComponent(accessKey)}`

  const res = await fetchWithTimeout(url)
  if (!res.ok) throw new Error(`KIPRIS returned HTTP ${res.status}`)

  const xml = await res.text()

  const resultCode = xmlTag(xml, 'resultCode')
  const resultMsg  = xmlTag(xml, 'resultMsg')
  if (resultMsg && resultMsg.includes('ERROR')) {
    throw new Error(`KIPRIS API error: ${resultMsg} (code ${resultCode})`)
  }

  const totalCount = parseInt(xmlTag(xml, 'TotalSearchCount') || '0', 10)
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

  const accessKey = process.env.KIPRIS_API_KEY
  if (!accessKey) {
    return res.status(200).json({
      status:  'pending',
      message: 'KIPRIS_API_KEY is not configured. Add it to Vercel environment variables.',
      results: [],
    })
  }

  const applicantName = (req.query.applicantName || '').trim()
  if (!applicantName) {
    return res.status(400).json({ error: 'Missing required parameter: applicantName' })
  }

  // Debug mode — returns raw KIPRIS XML for inspection
  if (req.query.debug === 'true') {
    const url = `${BASE_URL}?applicantName=${encodeURIComponent(applicantName)}&${STATUS_PARAMS}` +
                `&docsStart=1&docsCount=5&accessKey=${encodeURIComponent(accessKey)}`
    const debugRes = await fetchWithTimeout(url)
    const xml      = await debugRes.text()
    return res.status(200).json({ url: url.replace(encodeURIComponent(accessKey), '***KEY***'), xml })
  }

  try {
    const rawItems = await fetchAll(applicantName, accessKey)
    const results  = rawItems
      .map(item => parseItem(item, applicantName))
      .filter(r => r.serialNo || r.markName !== '—')

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
