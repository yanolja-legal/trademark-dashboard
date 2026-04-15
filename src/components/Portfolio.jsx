import React, { useState, useMemo, useCallback } from 'react'
import {
  Search, ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
  X, Globe, Loader2, AlertTriangle, ShieldAlert, Clock,
} from 'lucide-react'
import { differenceInDays, parseISO, format, isValid } from 'date-fns'

// ── constants ─────────────────────────────────────────────────────────────────

const STATUS_STYLES = {
  'Active':        'bg-green-500/10 text-green-400 border-green-500/20',
  'Pending':       'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  'Expiring Soon': 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  'Opposed':       'bg-red-500/10 text-red-400 border-red-500/20',
  'Expired':       'bg-slate-500/10 text-slate-400 border-slate-500/20',
}

/** Registry badge colours */
const REGISTRY_STYLES = {
  'WIPO Madrid' : 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  'USPTO'       : 'bg-sky-500/10 text-sky-400 border-sky-500/20',
  'IP India'    : 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  'ILPO'        : 'bg-teal-500/10 text-teal-400 border-teal-500/20',
  'EUIPO'       : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
}
const REGISTRY_DEFAULT = 'bg-accent-blue/10 text-accent-blue border-accent-blue/20'

const COLUMNS = [
  { key: 'applicant',        label: 'Applicant',     w: '160px' },
  { key: 'markName',         label: 'Mark Name',     w: '160px' },
  { key: 'registry',         label: 'Registry',      w: '95px'  },
  { key: 'country',          label: 'Country',       w: '160px' },
  { key: 'serialNo',         label: 'Serial No.',    w: '130px' },
  { key: 'regNo',            label: 'Reg. No.',      w: '120px' },
  { key: 'kindOfMark',       label: 'Kind',          w: '95px'  },
  { key: 'ncl',              label: 'NCL',           w: '80px'  },
  { key: 'applicationDate',  label: 'App. Date',     w: '110px' },
  { key: 'publicationDate',  label: 'Pub. Date',     w: '110px' },
  { key: 'registrationDate', label: 'Reg. Date',     w: '110px' },
  { key: 'expiryDate',       label: 'Expiry Date',   w: '130px' },
  { key: 'status',           label: 'Status',        w: '200px' },
]

const PAGE_SIZE = 10

// ── pure helpers ──────────────────────────────────────────────────────────────

function fmt(str) {
  if (!str) return '—'
  try {
    const d = parseISO(str)
    return isValid(d) ? format(d, 'dd MMM yyyy') : str
  } catch { return str }
}

// ── sub-components ────────────────────────────────────────────────────────────

function ExpiryCell({ dateStr }) {
  if (!dateStr) return <span className="text-slate-500">—</span>
  const d = parseISO(dateStr)
  if (!isValid(d)) return <span className="text-slate-500">—</span>
  const days     = differenceInDays(d, new Date())
  const expired  = days < 0
  const critical = days >= 0 && days <= 90
  const upcoming = days > 90 && days <= 180
  return (
    <span className={expired ? 'text-red-400' : critical ? 'text-orange-400 font-medium' : upcoming ? 'text-yellow-400' : 'text-slate-300'}>
      {fmt(dateStr)}
      {critical && !expired && (
        <span className="ml-1.5 text-[10px] font-bold px-1 py-0.5 rounded bg-orange-500/15 border border-orange-500/25">
          {days}d
        </span>
      )}
    </span>
  )
}

/** Globe icon with hover tooltip listing WIPO designated countries. */
function DesignatedCountriesTooltip({ countries }) {
  const [open, setOpen] = useState(false)
  if (!countries || countries.length === 0) return null
  return (
    <span className="relative inline-flex items-center ml-1.5">
      <button
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="text-accent-blue hover:text-accent-blue-bright transition-colors"
        aria-label={`${countries.length} designated countries`}
      >
        <Globe className="w-3.5 h-3.5" />
      </button>
      {open && (
        <div className="absolute left-5 top-0 z-50 w-56 p-3 rounded-lg bg-navy-700 border border-navy-400 shadow-xl text-xs text-slate-300 leading-relaxed">
          <p className="font-semibold text-white mb-1.5 text-[11px] uppercase tracking-wider">
            Designated countries ({countries.length})
          </p>
          <p className="font-mono">{countries.join(', ')}</p>
        </div>
      )}
    </span>
  )
}

/**
 * Warning badge shown in the Status cell for USPTO records where a Section 8
 * or Section 15 affidavit is due or overdue — the critical compliance flag.
 *
 * `maintenanceAlert` shape: { types: string[], status: 'due'|'overdue', message: string }
 */
function MaintenanceBadge({ alert }) {
  const [open, setOpen] = useState(false)
  if (!alert) return null

  const isOverdue = alert.status === 'overdue'
  const label     = alert.types.map(t => t === 'section8' ? 'Sec.8' : 'Sec.15').join('+')
  const badgeCls  = isOverdue
    ? 'bg-red-500/15 text-red-400 border-red-500/30'
    : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
  const iconCls   = isOverdue ? 'text-red-400' : 'text-amber-400'

  return (
    <span className="relative inline-flex items-center">
      <button
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border ${badgeCls}`}
        aria-label={alert.message}
      >
        <ShieldAlert className={`w-2.5 h-2.5 ${iconCls}`} />
        {label} {isOverdue ? 'OVERDUE' : 'DUE'}
      </button>
      {open && (
        <div className="absolute bottom-full left-0 mb-1.5 z-50 w-64 p-3 rounded-lg bg-navy-700 border border-navy-400 shadow-xl text-xs text-slate-300 leading-relaxed pointer-events-none">
          <p className={`font-semibold mb-1 text-[11px] uppercase tracking-wider ${isOverdue ? 'text-red-400' : 'text-amber-400'}`}>
            {isOverdue ? 'Compliance Overdue' : 'Compliance Due'}
          </p>
          <p>{alert.message}</p>
        </div>
      )}
    </span>
  )
}

/**
 * Warning badge for IP India marks that are Objected or Opposed.
 * India has notorious backlogs — status changes happen without notice.
 *
 * `alert` shape: { rawStatus: 'Objected'|'Opposed', message: string }
 */
function IPIndiaWarningBadge({ alert }) {
  const [open, setOpen] = useState(false)
  if (!alert) return null

  const isOpposed = alert.rawStatus === 'Opposed'
  const badgeCls  = isOpposed
    ? 'bg-red-500/15 text-red-400 border-red-500/30'
    : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
  const labelCls  = isOpposed ? 'text-red-400' : 'text-amber-400'
  const label     = isOpposed ? 'OPPOSED' : 'OBJECTED'

  return (
    <span className="relative inline-flex items-center">
      <button
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border ${badgeCls}`}
        aria-label={alert.message}
      >
        <AlertTriangle className="w-2.5 h-2.5" />
        {label}
      </button>
      {open && (
        <div className="absolute bottom-full left-0 mb-1.5 z-50 w-64 p-3 rounded-lg bg-navy-700 border border-navy-400 shadow-xl text-xs text-slate-300 leading-relaxed pointer-events-none">
          <p className={`font-semibold mb-1 text-[11px] uppercase tracking-wider ${labelCls}`}>
            IP India — Active Monitoring Required
          </p>
          <p>{alert.message}</p>
        </div>
      )}
    </span>
  )
}

/**
 * Expiry warning badge for ILPO marks within 180 days of expiry.
 * Israel's renewal grace period is exactly 6 months — this is the critical window.
 *
 * `alert` shape: { daysLeft: number, graceRemaining: number|null, message: string }
 */
function ILPOExpiryBadge({ alert }) {
  const [open, setOpen] = useState(false)
  if (!alert) return null

  const inGrace   = alert.daysLeft < 0
  const isUrgent  = alert.daysLeft <= 30
  const badgeCls  = inGrace || isUrgent
    ? 'bg-red-500/15 text-red-400 border-red-500/30'
    : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
  const labelCls  = inGrace || isUrgent ? 'text-red-400' : 'text-amber-400'
  const label     = inGrace
    ? `GRACE ${alert.graceRemaining}d`
    : `RENEW ${alert.daysLeft}d`

  return (
    <span className="relative inline-flex items-center">
      <button
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border ${badgeCls}`}
        aria-label={alert.message}
      >
        <AlertTriangle className="w-2.5 h-2.5" />
        {label}
      </button>
      {open && (
        <div className="absolute bottom-full left-0 mb-1.5 z-50 w-64 p-3 rounded-lg bg-navy-700 border border-navy-400 shadow-xl text-xs text-slate-300 leading-relaxed pointer-events-none">
          <p className={`font-semibold mb-1 text-[11px] uppercase tracking-wider ${labelCls}`}>
            ILPO — {inGrace ? '6-Month Grace Period Active' : 'Renewal Due Soon'}
          </p>
          <p>{alert.message}</p>
        </div>
      )}
    </span>
  )
}

/** Office action warning icon with tooltip. */
function OfficeActionBadge({ pending }) {
  const [open, setOpen] = useState(false)
  if (!pending) return null
  return (
    <span className="relative inline-flex items-center">
      <button
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border bg-orange-500/15 text-orange-400 border-orange-500/30"
        aria-label="Pending office action"
      >
        <AlertTriangle className="w-2.5 h-2.5" />
        OA
      </button>
      {open && (
        <div className="absolute bottom-full left-0 mb-1.5 z-50 w-52 p-3 rounded-lg bg-navy-700 border border-navy-400 shadow-xl text-xs text-slate-300 leading-relaxed pointer-events-none">
          <p className="font-semibold text-orange-400 mb-1 text-[11px] uppercase tracking-wider">Pending Office Action</p>
          <p>A USPTO office action requires a response. Check TSDR for details.</p>
        </div>
      )}
    </span>
  )
}

// ── reusable live-search bar ──────────────────────────────────────────────────

/**
 * Generic live-search bar that POSTs to an /api/* endpoint.
 * Props:
 *   label       string    — left label text
 *   placeholder string    — input placeholder
 *   apiPath     string    — e.g. "/api/wipo-search"
 *   queryParam  string    — query param name, e.g. "holder" or "owner"
 *   loadingMsg  string    — spinner message
 *   onResults   fn([])    — called with result array
 *   onLoading   fn(bool)  — loading state up
 *   onError     fn(str|null)
 */
function LiveSearchBar({
  label, placeholder, apiPath, queryParam, loadingMsg,
  onResults, onLoading, onError,
}) {
  const [input,      setInput]      = useState('')
  const [loading,    setLoading]    = useState(false)
  const [lastQuery,  setLastQuery]  = useState('')
  const [resultInfo, setResultInfo] = useState(null)

  async function handleSearch(e) {
    e.preventDefault()
    const q = input.trim()
    if (!q || q === lastQuery) return

    setLoading(true)
    onLoading(true)
    onError(null)

    try {
      const res  = await fetch(`${apiPath}?${queryParam}=${encodeURIComponent(q)}`)
      const json = await res.json()

      if (!res.ok) {
        // Surface the workaround if the API returned one
        const detail = json.workaround ? `${json.error} — ${json.workaround}` : (json.error || `HTTP ${res.status}`)
        throw new Error(detail)
      }

      // Credentials-pending state (e.g. EUIPO not yet configured) — not a real error
      if (json.status === 'pending') {
        onError(`PENDING:${json.message}`)
        onResults([])
        setLoading(false)
        onLoading(false)
        return
      }

      setLastQuery(q)
      setResultInfo({ count: json.count, query: q })
      onResults(json.results ?? [])
    } catch (err) {
      onError(`${label} search failed: ${err.message}`)
      onResults([])
    } finally {
      setLoading(false)
      onLoading(false)
    }
  }

  function handleClear() {
    setInput('')
    setLastQuery('')
    setResultInfo(null)
    onResults([])
    onError(null)
  }

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-navy-800 border border-navy-500">
      <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">
        {label}
      </span>
      <form onSubmit={handleSearch} className="flex items-center gap-2 flex-1">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder={placeholder}
            value={input}
            onChange={e => setInput(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-navy-700 border border-navy-500 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-accent-blue/50 transition-colors"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-blue/10 border border-accent-blue/30 text-accent-blue text-sm font-medium hover:bg-accent-blue/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
        >
          {loading
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Searching…</>
            : `Search ${label.split(' ')[0]}`
          }
        </button>
        {resultInfo && (
          <button
            type="button"
            onClick={handleClear}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-navy-500 text-slate-400 text-xs hover:text-slate-200 transition-colors whitespace-nowrap"
          >
            <X className="w-3.5 h-3.5" />
            Clear ({resultInfo.count} found)
          </button>
        )}
      </form>
      {loading && (
        <span className="text-xs text-accent-blue whitespace-nowrap hidden sm:inline">{loadingMsg}</span>
      )}
    </div>
  )
}

// ── main Portfolio component ──────────────────────────────────────────────────

export default function Portfolio({ data }) {
  const [search,        setSearch]        = useState('')
  const [status,        setStatus]        = useState('All')
  const [registry,      setRegistry]      = useState('All')
  const [country,       setCountry]       = useState('All')
  const [sortKey,       setSortKey]       = useState('markName')
  const [sortDir,       setSortDir]       = useState('asc')
  const [page,          setPage]          = useState(1)

  // Live WIPO results
  const [wipoResults,   setWipoResults]   = useState([])
  const [wipoLoading,   setWipoLoading]   = useState(false)
  const [wipoError,     setWipoError]     = useState(null)

  // Live USPTO results
  const [usptoResults,    setUsptoResults]    = useState([])
  const [usptoLoading,    setUsptoLoading]    = useState(false)
  const [usptoError,      setUsptoError]      = useState(null)

  // Live IP India results
  const [ipIndiaResults,  setIpIndiaResults]  = useState([])
  const [ipIndiaLoading,  setIpIndiaLoading]  = useState(false)
  const [ipIndiaError,    setIpIndiaError]    = useState(null)

  // Live ILPO results
  const [ilpoResults,     setIlpoResults]     = useState([])
  const [ilpoLoading,     setIlpoLoading]     = useState(false)
  const [ilpoError,       setIlpoError]       = useState(null)

  // Live EUIPO results
  const [euipoResults,    setEuipoResults]    = useState([])
  const [euipoLoading,    setEuipoLoading]    = useState(false)
  const [euipoError,      setEuipoError]      = useState(null)

  // Combined: static sample + all live registries
  const combined = useMemo(
    () => [...data, ...wipoResults, ...usptoResults, ...ipIndiaResults, ...ilpoResults, ...euipoResults],
    [data, wipoResults, usptoResults, ipIndiaResults, ilpoResults, euipoResults]
  )

  const statuses   = ['All', ...new Set(combined.map(t => t.status))]
  const registries = ['All', ...new Set(combined.map(t => t.registry))]
  const countries  = ['All', ...new Set(combined.map(t => t.country))]

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return combined
      .filter(t => {
        if (q && !`${t.markName} ${t.applicant} ${t.serialNo} ${t.regNo}`.toLowerCase().includes(q)) return false
        if (status   !== 'All' && t.status   !== status)   return false
        if (registry !== 'All' && t.registry !== registry) return false
        if (country  !== 'All' && t.country  !== country)  return false
        return true
      })
      .sort((a, b) => {
        const va = (a[sortKey] || '').toString()
        const vb = (b[sortKey] || '').toString()
        return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
      })
  }, [combined, search, status, registry, country, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const rows       = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function sort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
    setPage(1)
  }

  function resetFilters() {
    setSearch(''); setStatus('All'); setRegistry('All'); setCountry('All'); setPage(1)
  }

  const handleWipoResults    = useCallback(r => { setWipoResults(r);    setPage(1) }, [])
  const handleUsptoResults   = useCallback(r => { setUsptoResults(r);   setPage(1) }, [])
  const handleIpIndiaResults = useCallback(r => { setIpIndiaResults(r); setPage(1) }, [])
  const handleIlpoResults    = useCallback(r => { setIlpoResults(r);    setPage(1) }, [])
  const handleEuipoResults   = useCallback(r => { setEuipoResults(r);   setPage(1) }, [])

  const liveCount = wipoResults.length + usptoResults.length + ipIndiaResults.length + ilpoResults.length + euipoResults.length

  // Count maintenance alerts across all live USPTO results
  const maintenanceCount = usptoResults.filter(r => r.maintenanceAlert).length

  // Count IP India marks requiring active monitoring
  const indiaAlertCount  = ipIndiaResults.filter(r => r.ipIndiaAlert).length

  // Count ILPO marks approaching expiry within 180 days
  const ilpoExpiryCount  = ilpoResults.filter(r => r.ilpoExpiryAlert).length

  const summary = {
    total:    combined.length,
    active:   combined.filter(t => t.status === 'Active').length,
    pending:  combined.filter(t => t.status === 'Pending').length,
    expiring: combined.filter(t => t.status === 'Expiring Soon').length,
    opposed:  combined.filter(t => t.status === 'Opposed').length,
    expired:  combined.filter(t => t.status === 'Expired').length,
  }

  const summaryCards = [
    { label: 'Total',         value: summary.total,    color: 'text-accent-blue' },
    { label: 'Active',        value: summary.active,   color: 'text-green-400'   },
    { label: 'Pending',       value: summary.pending,  color: 'text-yellow-400'  },
    { label: 'Expiring Soon', value: summary.expiring, color: 'text-orange-400'  },
    { label: 'Opposed',       value: summary.opposed,  color: 'text-red-400'     },
    { label: 'Expired',       value: summary.expired,  color: 'text-slate-400'   },
  ]

  const anyLoading = wipoLoading || usptoLoading || ipIndiaLoading || ilpoLoading || euipoLoading

  return (
    <div className="space-y-5">

      {/* ── Live search bars ── */}
      <div className="space-y-2">
        <LiveSearchBar
          label="WIPO Madrid"
          placeholder="Holder name (e.g. Yanolja)"
          apiPath="/api/wipo-search"
          queryParam="holder"
          loadingMsg="Fetching from WIPO Madrid Monitor…"
          onResults={handleWipoResults}
          onLoading={setWipoLoading}
          onError={setWipoError}
        />
        <LiveSearchBar
          label="USPTO"
          placeholder="Owner/applicant name (e.g. Yanolja)"
          apiPath="/api/uspto-search"
          queryParam="owner"
          loadingMsg="Fetching from USPTO TSDR…"
          onResults={handleUsptoResults}
          onLoading={setUsptoLoading}
          onError={setUsptoError}
        />
        <LiveSearchBar
          label="IP India"
          placeholder="Applicant name (e.g. Yanolja)"
          apiPath="/api/ipindia-search"
          queryParam="holder"
          loadingMsg="Querying IP India registry... this may take up to 30 seconds"
          onResults={handleIpIndiaResults}
          onLoading={setIpIndiaLoading}
          onError={setIpIndiaError}
        />
        <LiveSearchBar
          label="ILPO"
          placeholder="Owner name (e.g. Go Global Travel)"
          apiPath="/api/ilpo-search"
          queryParam="holder"
          loadingMsg="Fetching from Israel trademark register…"
          onResults={handleIlpoResults}
          onLoading={setIlpoLoading}
          onError={setIlpoError}
        />
        <LiveSearchBar
          label="EUIPO"
          placeholder="Applicant name (e.g. Yanolja)"
          apiPath="/api/euipo-search"
          queryParam="holder"
          loadingMsg="Fetching from EUIPO Open Data…"
          onResults={handleEuipoResults}
          onLoading={setEuipoLoading}
          onError={setEuipoError}
        />
      </div>

      {/* ── Error banners ── */}
      {[wipoError, usptoError, ipIndiaError, ilpoError, euipoError].filter(Boolean).map((err, i) => {
        const isPending = err.startsWith('PENDING:')
        const msg       = isPending ? err.slice(8) : err
        return isPending ? (
          <div key={i} className="flex items-start gap-3 px-4 py-3 rounded-lg bg-indigo-500/10 border border-indigo-500/25 text-indigo-300 text-sm">
            <Clock className="w-4 h-4 flex-shrink-0 mt-0.5 text-indigo-400" />
            <span className="leading-relaxed">
              <span className="font-semibold text-indigo-400">Pending credentials — </span>{msg}
            </span>
          </div>
        ) : (
          <div key={i} className="flex items-start gap-3 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/25 text-red-400 text-sm">
            <X className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span className="leading-relaxed">{msg}</span>
          </div>
        )
      })}

      {/* ── ILPO expiry banner (180-day / 6-month grace window) ── */}
      {ilpoExpiryCount > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-teal-500/10 border border-teal-500/25 text-teal-400 text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>
            <strong>{ilpoExpiryCount}</strong> Israeli mark{ilpoExpiryCount !== 1 ? 's are' : ' is'} within the 180-day renewal window — Israel's 6-month grace period is the critical action deadline.
          </span>
        </div>
      )}

      {/* ── IP India monitoring banner ── */}
      {indiaAlertCount > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-orange-500/10 border border-orange-500/25 text-orange-400 text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>
            <strong>{indiaAlertCount}</strong> IP India mark{indiaAlertCount !== 1 ? 's require' : ' requires'} active monitoring — objected or opposed marks in a registry with known processing backlogs and unpredictable status changes.
          </span>
        </div>
      )}

      {/* ── Maintenance alert banner (USPTO compliance) ── */}
      {maintenanceCount > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-amber-500/10 border border-amber-500/25 text-amber-400 text-sm">
          <ShieldAlert className="w-4 h-4 flex-shrink-0" />
          <span>
            <strong>{maintenanceCount}</strong> USPTO mark{maintenanceCount !== 1 ? 's have' : ' has'} a Section 8 or 15 affidavit due or overdue — compliance action required.
          </span>
        </div>
      )}

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        {summaryCards.map(s => (
          <button
            key={s.label}
            onClick={() => { setStatus(s.label === 'Total' ? 'All' : s.label); setPage(1) }}
            className="bg-navy-800 border border-navy-500 rounded-xl p-4 text-left hover:border-navy-400 transition-colors"
          >
            <p className="text-xs text-slate-400 mb-1">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
          </button>
        ))}
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search mark, applicant, serial no…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            className="w-full pl-10 pr-9 py-2.5 bg-navy-800 border border-navy-500 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-accent-blue/50 transition-colors"
          />
          {search && (
            <button onClick={() => { setSearch(''); setPage(1) }} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {[
          { value: status,   onChange: v => { setStatus(v);   setPage(1) }, opts: statuses,   placeholder: 'All Statuses'    },
          { value: registry, onChange: v => { setRegistry(v); setPage(1) }, opts: registries, placeholder: 'All Registries'  },
          { value: country,  onChange: v => { setCountry(v);  setPage(1) }, opts: countries,  placeholder: 'All Countries'   },
        ].map((sel, i) => (
          <select
            key={i}
            value={sel.value}
            onChange={e => sel.onChange(e.target.value)}
            className="px-3 py-2.5 bg-navy-800 border border-navy-500 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-accent-blue/50 transition-colors"
          >
            {sel.opts.map(o => (
              <option key={o} value={o}>{o === 'All' ? sel.placeholder : o}</option>
            ))}
          </select>
        ))}

        <span className="text-sm text-slate-400 ml-auto">
          {filtered.length} result{filtered.length !== 1 ? 's' : ''}
          {liveCount > 0 && (
            <span className="ml-2 text-accent-blue text-xs">+{liveCount} live</span>
          )}
        </span>
      </div>

      {/* ── Table ── */}
      <div className="bg-navy-800 border border-navy-500 rounded-xl overflow-hidden">

        {/* Loading banner */}
        {anyLoading && (
          <div className="flex items-center justify-center gap-3 py-4 border-b border-navy-500 bg-accent-blue/5">
            <Loader2 className="w-4 h-4 text-accent-blue animate-spin" />
            <span className="text-sm text-accent-blue">
              {ipIndiaLoading
                ? 'Querying IP India registry... this may take up to 30 seconds'
                : `Fetching live data from ${[wipoLoading && 'WIPO', usptoLoading && 'USPTO', ilpoLoading && 'ILPO', euipoLoading && 'EUIPO'].filter(Boolean).join(', ')}…`
              }
            </span>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm data-table">
            <thead>
              <tr className="border-b border-navy-500">
                {COLUMNS.map(col => (
                  <th
                    key={col.key}
                    onClick={() => sort(col.key)}
                    style={{ minWidth: col.w }}
                    className="px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-accent-blue transition-colors select-none whitespace-nowrap"
                  >
                    <span className="flex items-center gap-1">
                      {col.label}
                      {sortKey === col.key
                        ? sortDir === 'asc'
                          ? <ChevronUp   className="w-3.5 h-3.5 text-accent-blue flex-shrink-0" />
                          : <ChevronDown className="w-3.5 h-3.5 text-accent-blue flex-shrink-0" />
                        : <ChevronUp className="w-3.5 h-3.5 opacity-0 flex-shrink-0" />
                      }
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(tm => (
                <tr
                  key={tm.id}
                  className={`border-b border-navy-600/40 hover:bg-navy-700/30 transition-colors
                    ${tm.status === 'Expired' ? 'opacity-50' : ''}
                    ${tm.maintenanceAlert?.status === 'overdue' ? 'bg-red-500/[0.03]' : ''}
                  `}
                >
                  {/* Applicant */}
                  <td className="px-4 py-3 text-slate-300 whitespace-nowrap">{tm.applicant}</td>

                  {/* Mark name */}
                  <td className="px-4 py-3 font-semibold text-white whitespace-nowrap">{tm.markName}</td>

                  {/* Registry badge */}
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1 items-start">
                      <span className={`px-2 py-0.5 rounded text-xs font-mono font-medium border ${REGISTRY_STYLES[tm.registry] || REGISTRY_DEFAULT}`}>
                        {tm.registry}
                      </span>
                      {tm.isSandbox && (
                        <span className="px-1.5 py-0 rounded text-[9px] font-bold border bg-amber-500/10 text-amber-400 border-amber-500/25 tracking-wide">
                          SANDBOX
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Country + WIPO designated countries tooltip */}
                  <td className="px-4 py-3 text-slate-300 whitespace-nowrap">
                    {tm.country}
                    {tm.registry === 'WIPO Madrid' && (
                      <DesignatedCountriesTooltip countries={tm.designatedCountries} />
                    )}
                  </td>

                  {/* Serial no */}
                  <td className="px-4 py-3 font-mono text-xs text-slate-400 whitespace-nowrap">{tm.serialNo || '—'}</td>

                  {/* Reg no */}
                  <td className="px-4 py-3 font-mono text-xs text-slate-400 whitespace-nowrap">{tm.regNo || '—'}</td>

                  {/* Kind */}
                  <td className="px-4 py-3 text-slate-300 whitespace-nowrap">{tm.kindOfMark}</td>

                  {/* NCL */}
                  <td className="px-4 py-3 font-mono text-xs text-slate-400 whitespace-nowrap">{tm.ncl}</td>

                  {/* Dates */}
                  <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">{fmt(tm.applicationDate)}</td>
                  <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">{fmt(tm.publicationDate)}</td>
                  <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">{fmt(tm.registrationDate)}</td>
                  <td className="px-4 py-3 text-xs whitespace-nowrap"><ExpiryCell dateStr={tm.expiryDate} /></td>

                  {/* Status + compliance badges */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex flex-wrap items-center gap-1">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${STATUS_STYLES[tm.status] || STATUS_STYLES['Active']}`}>
                        {tm.status}
                      </span>
                      {/* USPTO maintenance alert: Section 8 / 15 compliance */}
                      <MaintenanceBadge alert={tm.maintenanceAlert} />
                      {/* USPTO pending office action */}
                      <OfficeActionBadge pending={tm.pendingOfficeAction} />
                      {/* IP India objected / opposed monitoring badge */}
                      <IPIndiaWarningBadge alert={tm.ipIndiaAlert} />
                      {/* ILPO 180-day expiry / grace period badge */}
                      <ILPOExpiryBadge alert={tm.ilpoExpiryAlert} />
                    </div>
                  </td>
                </tr>
              ))}

              {rows.length === 0 && !anyLoading && (
                <tr>
                  <td colSpan={COLUMNS.length} className="px-4 py-16 text-center text-slate-500">
                    No records match your filters.{' '}
                    <button onClick={resetFilters} className="text-accent-blue hover:underline">Clear filters</button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-navy-500">
            <p className="text-xs text-slate-400">
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
            </p>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded bg-navy-700 border border-navy-500 text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                const half  = 3
                let start   = Math.max(1, page - half)
                const end   = Math.min(totalPages, start + 6)
                start       = Math.max(1, end - 6)
                return start + i
              }).map(p => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`w-8 h-8 rounded text-xs font-medium border transition-colors
                    ${page === p
                      ? 'bg-accent-blue text-navy-900 border-accent-blue font-bold'
                      : 'bg-navy-700 border-navy-500 text-slate-400 hover:text-slate-200'
                    }`}
                >
                  {p}
                </button>
              ))}
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-1.5 rounded bg-navy-700 border border-navy-500 text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
