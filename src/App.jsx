import React, { useState, useMemo, useRef, useCallback } from 'react'
import { Shield, Bell, BarChart2, Settings, Database, RefreshCw, Building2 } from 'lucide-react'
import { differenceInDays, parseISO, format, isValid } from 'date-fns'
import Portfolio  from './components/Portfolio'
import ByEntity   from './components/ByEntity'
import Alerts     from './components/Alerts'
import Analytics  from './components/Analytics'
import ApiSetup   from './components/ApiSetup'
import { SUBSIDIARIES } from './subsidiaries'
import { REGISTRIES }   from './registries'
import { KNOWN_MARKS }  from './knownMarks'

// ── constants ──────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'portfolio', label: 'Portfolio',  icon: Database  },
  { id: 'entity',    label: 'By Entity',  icon: Building2 },
  { id: 'alerts',    label: 'Alerts',     icon: Bell      },
  { id: 'analytics', label: 'Analytics',  icon: BarChart2 },
  { id: 'api',       label: 'API Setup',  icon: Settings  },
]

const INITIAL_STATUS = Object.fromEntries(
  REGISTRIES.map(r => [r.id, { status: 'idle', count: 0, error: null, lastFetched: null }])
)

const CACHE_RESULTS   = 'tm-cache-results'
const CACHE_TIMESTAMP = 'tm-cache-timestamp'
const CACHE_REGISTRY  = 'tm-cache-registry-status'

// ── helpers ────────────────────────────────────────────────────────────────────

/** Returns true if a trademark record has any flag that requires attention. */
function hasFlag(t) {
  if (t.ipIndiaAlert)        return true
  if (t.ilpoExpiryAlert)     return true
  if (t.pendingOfficeAction) return true
  if (t.status === 'Opposed') return true
  if (t.expiryDate) {
    try {
      const d = parseISO(t.expiryDate)
      if (isValid(d) && differenceInDays(d, new Date()) >= 0 && differenceInDays(d, new Date()) <= 90) return true
    } catch { /* skip */ }
  }
  return false
}

/** fetch() wrapped with a 15-second AbortController timeout. */
async function fetchWithTimeout(url, ms = 15000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timer)
    return res
  } catch (err) {
    clearTimeout(timer)
    if (err.name === 'AbortError') throw new Error('Timed out after 15s — marked unavailable')
    throw err
  }
}

// ── App ────────────────────────────────────────────────────────────────────────

export default function App() {
  const [activeTab,      setActiveTab]      = useState('portfolio')
  const [liveResults,    setLiveResults]    = useState(() => {
    try { const c = localStorage.getItem(CACHE_RESULTS);   return c ? JSON.parse(c) : [] } catch { return [] }
  })
  const [csvResults,     setCsvResults]     = useState([]) // IP India + ILPO uploaded CSVs
  const [registryStatus, setRegistryStatus] = useState(() => {
    try { const c = localStorage.getItem(CACHE_REGISTRY);  return c ? JSON.parse(c) : INITIAL_STATUS } catch { return INITIAL_STATUS }
  })
  const [lastUpdated,    setLastUpdated]    = useState(() => {
    try { const ts = localStorage.getItem(CACHE_TIMESTAMP); return ts ? new Date(ts) : null } catch { return null }
  })
  const [progress,       setProgress]       = useState(null) // { current, total, msg } | null
  const fetchCountRef  = useRef(0)
  const isFetchingRef  = useRef(false)

  // ── Combined deduped data ──────────────────────────────────────────────────

  const combined = useMemo(() => {
    const all  = [...liveResults, ...csvResults]
    const seen = new Set()
    return all.filter(t => {
      if (seen.has(t.id)) return false
      seen.add(t.id)
      return true
    })
  }, [liveResults, csvResults])

  // ── CSV upload handler (IP India / ILPO) ──────────────────────────────────

  const handleCsvUpload = useCallback((registryId, rows) => {
    setCsvResults(prev => {
      const reg = REGISTRIES.find(r => r.id === registryId)
      // Remove old rows for this registry, then append new ones
      const filtered = prev.filter(r => r.registry !== reg?.value)
      return [...filtered, ...rows]
    })
    setRegistryStatus(prev => ({
      ...prev,
      [registryId]: {
        ...prev[registryId],
        status:      'ok',
        count:       rows.length,
        error:       null,
        lastFetched: new Date().toISOString(),
      },
    }))
  }, [])

  // ── Fetch all registries sequentially (one entity at a time) ─────────────────

  const fetchAll = useCallback(async () => {
    if (isFetchingRef.current) return
    isFetchingRef.current = true

    const activeSubs = SUBSIDIARIES.filter(s => s.active)
    const fetchRegs  = REGISTRIES.filter(r => r.fetchStrategy === 'numbers' || r.fetchStrategy === 'holder')
    const csvRegs    = REGISTRIES.filter(r => r.fetchStrategy === 'csv')
    const noneRegs   = REGISTRIES.filter(r => r.fetchStrategy === 'none')

    // 1 step per numbers-registry; 1 step per (holder-registry × subsidiary)
    const total = fetchRegs.reduce((acc, reg) =>
      acc + (reg.fetchStrategy === 'holder' ? activeSubs.length : 1), 0)

    fetchCountRef.current = 0
    setLiveResults([])
    setProgress({ current: 0, total: Math.max(total, 1), msg: 'Starting fetch…' })

    setRegistryStatus(prev => {
      const next = { ...prev }
      fetchRegs.forEach(r => {
        next[r.id] = { status: 'loading', count: 0, error: null, lastFetched: prev[r.id]?.lastFetched ?? null }
      })
      csvRegs.forEach(r => {
        next[r.id] = { ...prev[r.id], status: prev[r.id]?.count > 0 ? 'ok' : 'csv' }
      })
      noneRegs.forEach(r => {
        next[r.id] = { ...prev[r.id], status: 'pending' }
      })
      return next
    })

    const allNewResults  = []
    const statusUpdates  = {}

    for (const reg of fetchRegs) {
      const regResults = []
      let hasPending   = false
      let lastError    = null

      if (reg.fetchStrategy === 'numbers') {
        const allNumbers = []
        activeSubs.forEach(sub => {
          const marks = KNOWN_MARKS[sub.name]
          if (marks) ;(marks[reg.knownMarksKey] ?? []).forEach(n => allNumbers.push(String(n)))
        })

        if (allNumbers.length === 0) {
          fetchCountRef.current++
          const st = { status: 'no-marks', count: 0, error: `No ${reg.label} numbers configured in knownMarks.js`, lastFetched: null }
          statusUpdates[reg.id] = st
          setRegistryStatus(prev => ({ ...prev, [reg.id]: st }))
          setProgress({ current: fetchCountRef.current, total: Math.max(total, 1), msg: `${reg.label}: no numbers configured` })
          continue
        }

        const stepN = fetchCountRef.current + 1
        setProgress({ current: fetchCountRef.current, total: Math.max(total, 1), msg: `Fetching ${reg.label}… (${stepN} of ${total})` })

        try {
          const url  = `${reg.apiPath}?${reg.queryParam}=${encodeURIComponent(allNumbers.join(','))}`
          const res  = await fetchWithTimeout(url)
          const json = await res.json()
          if (json.status === 'pending') hasPending = true
          else if (!res.ok) lastError = json.error || `HTTP ${res.status}`
          else ;(json.results ?? []).forEach(r => regResults.push(r))
        } catch (err) {
          lastError = err.message
        }

        fetchCountRef.current++
        setProgress({ current: fetchCountRef.current, total: Math.max(total, 1), msg: `${reg.label}: ${regResults.length} marks fetched` })

      } else if (reg.fetchStrategy === 'holder') {
        for (const sub of activeSubs) {
          const stepN = fetchCountRef.current + 1
          setProgress({
            current: fetchCountRef.current,
            total:   Math.max(total, 1),
            msg:     `Fetching ${sub.shortName} from ${reg.label}… (${stepN} of ${total})`,
          })

          try {
            const url  = `${reg.apiPath}?${reg.queryParam}=${encodeURIComponent(sub.name)}`
            const res  = await fetchWithTimeout(url)
            const json = await res.json()
            if (json.status === 'pending') hasPending = true
            else if (!res.ok) lastError = json.error || `HTTP ${res.status}`
            else ;(json.results ?? []).forEach(r => regResults.push(r))
          } catch (err) {
            lastError = err.message
          }

          fetchCountRef.current++
        }
        setProgress({ current: fetchCountRef.current, total: Math.max(total, 1), msg: `${reg.label}: ${regResults.length} marks fetched` })
      }

      if (regResults.length > 0) {
        allNewResults.push(...regResults)
        setLiveResults(prev => {
          const existingIds = new Set(prev.map(r => r.id))
          return [...prev, ...regResults.filter(r => !existingIds.has(r.id))]
        })
      }

      const st = {
        status:      hasPending                            ? 'pending'
                   : lastError && regResults.length === 0 ? 'error'
                   : 'ok',
        count:       regResults.length,
        error:       lastError,
        lastFetched: hasPending ? null : new Date().toISOString(),
      }
      statusUpdates[reg.id] = st
      setRegistryStatus(prev => ({ ...prev, [reg.id]: st }))
    }

    const now = new Date()
    setLastUpdated(now)
    setProgress(null)
    isFetchingRef.current = false

    // Persist to localStorage so next page load shows cached data immediately
    try {
      localStorage.setItem(CACHE_RESULTS,   JSON.stringify(allNewResults))
      localStorage.setItem(CACHE_TIMESTAMP, now.toISOString())
      localStorage.setItem(CACHE_REGISTRY,  JSON.stringify({ ...INITIAL_STATUS, ...statusUpdates }))
    } catch { /* ignore storage quota errors */ }
  }, [])

  // ── Per-registry per-entity refresh ───────────────────────────────────────

  const fetchRegistryForEntity = useCallback(async (regId, subId) => {
    if (isFetchingRef.current) return
    const reg = REGISTRIES.find(r => r.id === regId)
    const sub = SUBSIDIARIES.find(s => s.id === subId)
    if (!reg || !sub) return
    if (reg.fetchStrategy !== 'numbers' && reg.fetchStrategy !== 'holder') return

    setRegistryStatus(prev => ({
      ...prev,
      [reg.id]: { ...prev[reg.id], status: 'loading' },
    }))

    const results = []
    let lastError = null

    try {
      if (reg.fetchStrategy === 'numbers') {
        // numbers registries are not entity-scoped — re-fetch all known numbers
        const activeSubs = SUBSIDIARIES.filter(s => s.active)
        const allNumbers = []
        activeSubs.forEach(s => {
          const marks = KNOWN_MARKS[s.name]
          if (marks) ;(marks[reg.knownMarksKey] ?? []).forEach(n => allNumbers.push(String(n)))
        })
        if (allNumbers.length > 0) {
          const url = `${reg.apiPath}?${reg.queryParam}=${encodeURIComponent(allNumbers.join(','))}`
          const res = await fetchWithTimeout(url)
          const json = await res.json()
          if (!res.ok) lastError = json.error || `HTTP ${res.status}`
          else ;(json.results ?? []).forEach(r => results.push(r))
        }
        setLiveResults(prev => {
          const filtered = prev.filter(r => r.registry !== reg.value)
          const existingIds = new Set(filtered.map(r => r.id))
          return [...filtered, ...results.filter(r => !existingIds.has(r.id))]
        })
      } else {
        // holder: fetch just this one entity
        const url = `${reg.apiPath}?${reg.queryParam}=${encodeURIComponent(sub.name)}`
        const res = await fetchWithTimeout(url)
        const json = await res.json()
        if (!res.ok) lastError = json.error || `HTTP ${res.status}`
        else ;(json.results ?? []).forEach(r => results.push(r))
        setLiveResults(prev => {
          const filtered = prev.filter(r => !(r.registry === reg.value && r.applicant === sub.name))
          const existingIds = new Set(filtered.map(r => r.id))
          return [...filtered, ...results.filter(r => !existingIds.has(r.id))]
        })
      }
    } catch (err) {
      lastError = err.message
    }

    setRegistryStatus(prev => ({
      ...prev,
      [reg.id]: {
        ...prev[reg.id],
        status:      lastError && results.length === 0 ? 'error' : 'ok',
        error:       lastError,
        lastFetched: new Date().toISOString(),
      },
    }))
  }, [])

  // ── Derived stats ──────────────────────────────────────────────────────────

  const stats = {
    total:     combined.length,
    active:    combined.filter(t => t.status === 'Active').length,
    pending:   combined.filter(t => t.status === 'Pending').length,
    countries: new Set(combined.map(t => t.country)).size,
  }

  const alertCount   = combined.filter(hasFlag).length
  const isRefreshing = progress !== null

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-navy-900 text-slate-200 font-sans">

      {/* ── Header ── */}
      <header className="border-b border-navy-500 bg-navy-800 px-6 py-4">
        <div className="max-w-screen-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-accent-blue/10 border border-accent-blue/20">
              <Shield className="w-6 h-6 text-accent-blue" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">Yanolja IP Trackers</h1>
              <p className="text-xs text-slate-400">makes IP 10x easier</p>
            </div>
          </div>

          <div className="flex items-center gap-5">
            <div className="hidden sm:grid grid-cols-4 gap-5 text-center">
              {[
                { label: 'Total',     value: stats.total,     color: 'text-accent-blue'  },
                { label: 'Active',    value: stats.active,    color: 'text-accent-green' },
                { label: 'Pending',   value: stats.pending,   color: 'text-yellow-400'   },
                { label: 'Countries', value: stats.countries, color: 'text-purple-400'   },
              ].map(s => (
                <div key={s.label}>
                  <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider">{s.label}</p>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <div className="text-right hidden md:block">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider">Last updated</p>
                <p className={`text-xs font-mono ${lastUpdated ? 'text-accent-green' : 'text-slate-400'}`}>
                  {lastUpdated
                    ? format(lastUpdated, 'yyyy-MM-dd HH:mm') + ' UTC'
                    : isRefreshing ? 'Fetching…' : '—'
                  }
                </p>
              </div>
              <button
                onClick={fetchAll}
                disabled={isRefreshing}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-blue/10 border border-accent-blue/30 text-accent-blue text-sm hover:bg-accent-blue/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                {isRefreshing ? 'Refreshing…' : 'Refresh All'}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ── Tab bar ── */}
      <nav className="border-b border-navy-500 bg-navy-800/40 px-6 sticky top-0 z-20 backdrop-blur-sm">
        <div className="max-w-screen-2xl mx-auto flex">
          {TABS.map(tab => {
            const Icon     = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-5 py-4 text-sm font-medium border-b-2 transition-colors
                  ${isActive
                    ? 'border-accent-blue text-accent-blue'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-navy-400'
                  }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
                {tab.id === 'alerts' && alertCount > 0 && (
                  <span className="ml-0.5 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
                    {alertCount}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </nav>

      {/* ── Content ── */}
      <main className="max-w-screen-2xl mx-auto px-6 py-6">
        {activeTab === 'portfolio' && (
          <Portfolio
            data={combined}
            registryStatus={registryStatus}
            progress={progress}
            lastUpdated={lastUpdated}
            onRefresh={fetchAll}
            onCsvUpload={handleCsvUpload}
          />
        )}
        {activeTab === 'entity'    && (
          <ByEntity
            data={combined}
            registryStatus={registryStatus}
            lastUpdated={lastUpdated}
            onRefreshRegistryForEntity={fetchRegistryForEntity}
            isRefreshing={isRefreshing}
          />
        )}
        {activeTab === 'alerts'    && <Alerts    data={combined} />}
        {activeTab === 'analytics' && <Analytics data={combined} />}
        {activeTab === 'api'       && <ApiSetup  registryStatus={registryStatus} />}
      </main>
    </div>
  )
}
