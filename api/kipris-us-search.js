/**
 * Vercel serverless function: /api/kipris-us-search
 *
 * Fetches USPTO trademark data via KIPRIS Foreign Trademark Search.
 * Reuses KIPRIS_API_KEY environment variable.
 *
 * Endpoint:
 *   GET http://plus.kipris.or.kr/openapi/rest/ForeignTradeMarkAdvencedSearchService/freeSearch
 *
 * Key parameters:
 *   free             — search term (applicant / mark name)
 *   collectionValues — country code: US
 *   currentPage      — page number (1-based)
 *   docsCount        — records per page (max 500)
 *   accessKey        — KIPRIS API key
 */

import { normaliseTrademarkData } from '../src/normalise.js'

export const config = { runtime: 'nodejs' }

const BASE_URL      = 'http://plus.kipris.or.kr/openapi/rest/ForeignTradeMarkAdvencedSearchService/freeSearch'
const ROWS_PER_PAGE = 100
const MAX_RECORDS   = 500
const TIMEOUT_MS    = 25000

const USPTO_NAME_MAP = [
  { contains: 'YANOLJA',  english: 'Yanolja Co., Ltd.' },
  { contains: 'RIGHTREZ', english: 'RightRez, Inc.'    },
  { contains: 'INNSOFT',  english: 'Innsoft, Inc.'     },
]

// Only keep results whose applicant matched one of our known entities
const KNOWN_APPLICANTS = new Set(USPTO_NAME_MAP.map(m => m.english))

function mapApplicantName(name) {
  if (!name) return name
  const upper = name.toUpperCase()
  const match = USPTO_NAME_MAP.find(m => upper.includes(m.contains))
  return match ? match.english : name
}

async function fetchWithTimeout(url, ms = TIMEOUT_MS) {
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
    if (err.name === 'AbortError') throw new Error('KIPRIS US request timed out after 25s')
    throw err
  }
}

function xmlTag(xml, name) {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'))
  return m ? m[1].replace(/<[^>]+>/g, '').trim() : ''
}

function xmlItems(xml) {
  const out = []
  const re  = /<searchResult>([\s\S]*?)<\/searchResult>/gi
  let m
  while ((m = re.exec(xml)) !== null) out.push(m[1])
  return out
}

function isoDate(raw) {
  if (!raw) return ''
  const s = raw.trim().replace(/\D/g, '')
  if (s.length === 8) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
  return ''
}

function parseItem(item) {
  const appNo      = xmlTag(item, 'applicationNumber')
  const regNo      = xmlTag(item, 'registrationNumber')
  const applicant  = xmlTag(item, 'applicant') || xmlTag(item, 'rightHolder')

  return {
    id:               `uspto-${appNo || Math.random().toString(36).slice(2, 9)}`,
    applicant:        mapApplicantName(applicant),
    markName:         xmlTag(item, 'tradeMarkName') || '—',
    registry:         'USPTO',
    country:          'United States',
    serialNo:         appNo,
    regNo:            regNo,
    kindOfMark:       xmlTag(item, 'tradeMarkType') || '',
    ncl:              xmlTag(item, 'niceCode') || xmlTag(item, 'tradeMarkClassificationCode') || '',
    applicationDate:  isoDate(xmlTag(item, 'applicationDate')),
    publicationDate:  '',
    registrationDate: isoDate(xmlTag(item, 'registrationDate')),
    expiryDate:       '',
    status:           regNo ? 'Active' : 'Pending',
    source:           'live',
  }
}

async function fetchPage(searchTerm, accessKey, pageNo) {
  const url = `${BASE_URL}?free=${encodeURIComponent(searchTerm)}` +
              `&collectionValues=US&currentPage=${pageNo}&docsCount=${ROWS_PER_PAGE}` +
              `&accessKey=${encodeURIComponent(accessKey)}`
  const res = await fetchWithTimeout(url)
  if (!res.ok) throw new Error(`KIPRIS US returned HTTP ${res.status}`)
  const xml       = await res.text()
  const resultMsg = xmlTag(xml, 'resultMsg')
  if (resultMsg && resultMsg.includes('ERROR')) throw new Error(`KIPRIS US error: ${resultMsg}`)
  const totalCount = parseInt(xmlTag(xml, 'totalSearchCount') || '0', 10)
  const items      = xmlItems(xml)
  return { totalCount, items }
}

async function fetchAll(searchTerm, accessKey) {
  const first    = await fetchPage(searchTerm, accessKey, 1)
  const rawItems = [...first.items]
  const total    = Math.min(first.totalCount, MAX_RECORDS)

  if (total > ROWS_PER_PAGE) {
    const extraPages = Math.ceil((total - ROWS_PER_PAGE) / ROWS_PER_PAGE)
    for (let p = 2; p <= extraPages + 1; p++) {
      if (rawItems.length >= MAX_RECORDS) break
      try {
        const page = await fetchPage(searchTerm, accessKey, p)
        rawItems.push(...page.items)
      } catch (err) {
        console.warn(`[kipris-us-search] page ${p} failed: ${err.message}`)
        break
      }
    }
  }
  return rawItems.slice(0, MAX_RECORDS)
}

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
  if (!applicantName) return res.status(400).json({ error: 'Missing required parameter: applicantName' })

  try {
    const rawItems = await fetchAll(applicantName, accessKey)
    const results  = rawItems
      .map(item => parseItem(item))
      .filter(r => (r.serialNo || r.markName !== '—') && KNOWN_APPLICANTS.has(r.applicant))

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=300')
    return res.status(200).json({ count: results.length, results: results.map(normaliseTrademarkData) })

  } catch (err) {
    console.error('[kipris-us-search]', err.message)
    return res.status(502).json({
      error:  'Failed to fetch USPTO data from KIPRIS.',
      detail: err.message,
    })
  }
}
