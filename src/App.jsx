import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { Shield, Bell, BarChart2, Settings, Database, RefreshCw, Building2 } from 'lucide-react'
import { differenceInDays, parseISO, format, isValid } from 'date-fns'
import Portfolio  from './components/Portfolio'
import ByEntity   from './components/ByEntity'
import Alerts     from './components/Alerts'
import Analytics  from './components/Analytics'
import ApiSetup   from './components/ApiSetup'
import { trademarks }   from './data/sampleData'
import { SUBSIDIARIES } from './subsidiaries'
import { REGISTRIES }   from './registries'

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

// ── helpers ────────────────────────────────────────────────────────────────────

/** Returns true if a trademark record has any flag that requires attention. */
function hasFlag(t) {
  if (t.maintenanceAlert)    return true
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

// ── App ────────────────────────────────────────────────────────────────────────

export default function App() {
  const [activeTab,      setActiveTab]      = useState('portfolio')
  const [liveResults,    setLiveResults]    = useState([])
  const [registryStatus, setRegistryStatus] = useState(INITIAL_STATUS)
  const [lastUpdated,    setLastUpdated]    = useState(null)
  const [progress,       setProgress]       = useState(null) // { current, total, msg } | null
  const fetchCountRef  = useRef(0)
  const isFetchingRef  = useRef(false)

  // ── Combined deduped data ──────────────────────────────────────────────────

  const combined = useMemo(() => {
    const all  = [...trademarks, ...liveResults]
    const seen = new Set()
    return all.filter(t => {
      if (seen.has(t.id)) return false
      seen.add(t.id)
      return true
    })
  }, [liveResults])

  // ── Auto-fetch all registries × all subsidiaries ───────────────────────────

  const fetchAll = useCallback(async () => {
    if (isFetchingRef.current) return
    isFetchingRef.current = true

    const activeSubs = SUBSIDIARIES.filter(s => s.active)
    const apiRegs    = REGISTRIES.filter(r => r.apiPath)
    const total      = activeSubs.length * apiRegs.length

    fetchCountRef.current = 0
    setLiveResults([])
    setProgress({ current: 0, total, msg: 'Starting search across all registries…' })

    // Initialise registry statuses
    setRegistryStatus(prev => {
      const next = { ...prev }
      REGISTRIES.forEach(r => {
        next[r.id] = {
          status:      r.apiPath ? 'loading' : 'pending',
          count:       0,
          error:       null,
          lastFetched: prev[r.id]?.lastFetched ?? null,
        }
      })
      return next
    })

    // Fetch all registries in parallel; within each registry all subsidiaries in parallel
    await Promise.allSettled(
      apiRegs.map(async reg => {
        const regResults = []
        let hasPending   = false
        let lastError    = null

        await Promise.allSettled(
          activeSubs.map(async sub => {
            try {
              const url  = `${reg.apiPath}?${reg.queryParam}=${encodeURIComponent(sub.name)}`
              const res  = await fetch(url)
              const json = await res.json()

              if (json.status === 'pending') {
                hasPending = true
              } else if (!res.ok) {
                lastError = json.workaround
                  ? `${json.error} — ${json.workaround}`
                  : (json.error || `HTTP ${res.status}`)
              } else {
                ;(json.results ?? []).forEach(r => regResults.push(r))
              }
            } catch (err) {
              lastError = err.message
            } finally {
              const n = ++fetchCountRef.current
              setProgress({
                current: n,
                total,
                msg:     `Fetching ${sub.shortName} from ${reg.label}… (${n} of ${total})`,
              })
            }
          })
        )

        // Flush registry results into combined state
        if (regResults.length > 0) {
          setLiveResults(prev => {
            const existingIds = new Set(prev.map(r => r.id))
            return [...prev, ...regResults.filter(r => !existingIds.has(r.id))]
          })
        }

        setRegistryStatus(prev => ({
          ...prev,
          [reg.id]: {
            status:      hasPending                              ? 'pending'
                       : lastError && regResults.length === 0   ? 'error'
                       : 'ok',
            count:       regResults.length,
            error:       lastError,
            lastFetched: hasPending
              ? prev[reg.id]?.lastFetched
              : new Date().toISOString(),
          },
        }))
      })
    )

    setLastUpdated(new Date())
    setProgress(null)
    isFetchingRef.current = false
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

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
          />
        )}
        {activeTab === 'entity'    && (
          <ByEntity
            data={combined}
            registryStatus={registryStatus}
            lastUpdated={lastUpdated}
          />
        )}
        {activeTab === 'alerts'    && <Alerts    data={combined} />}
        {activeTab === 'analytics' && <Analytics data={combined} />}
        {activeTab === 'api'       && <ApiSetup  registryStatus={registryStatus} />}
      </main>
    </div>
  )
}
