import React, { useState, useMemo, useCallback, useRef } from 'react'
import {
  Search, ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
  X, Globe, Loader2, AlertTriangle, Clock, RefreshCw, Upload,
} from 'lucide-react'
import { differenceInDays, parseISO, format, isValid } from 'date-fns'
import { REGISTRIES } from '../registries'

// ── constants ─────────────────────────────────────────────────────────────────

const STATUS_STYLES = {
  'Active':        'bg-green-500/10 text-green-400 border-green-500/20',
  'Pending':       'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  'Expiring Soon': 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  'Opposed':       'bg-red-500/10 text-red-400 border-red-500/20',
  'Expired':       'bg-slate-500/10 text-slate-400 border-slate-500/20',
}

const REGISTRY_STYLES = {
  'WIPO Madrid' : 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  'USPTO'       : 'bg-sky-500/10 text-sky-400 border-sky-500/20',
  'IP India'    : 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  'ILPO'        : 'bg-teal-500/10 text-teal-400 border-teal-500/20',
  'EUIPO'       : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
  'KIPRIS'      : 'bg-pink-500/10 text-pink-400 border-pink-500/20',
}
const REGISTRY_DEFAULT = 'bg-accent-blue/10 text-accent-blue border-accent-blue/20'

const COLUMNS = [
  { key: 'applicant',        label: 'Applicant',      w: '160px' },
  { key: 'markName',         label: 'Mark Name',      w: '160px' },
  { key: 'registry',         label: 'Registry',       w: '105px' },
  { key: 'country',          label: 'Country',        w: '150px' },
  { key: 'serialNo',         label: 'Serial No.',     w: '130px' },
  { key: 'regNo',            label: 'Reg. No.',       w: '120px' },
  { key: 'kindOfMark',       label: 'Kind',           w: '90px'  },
  { key: 'ncl',              label: 'NCL',            w: '80px'  },
  { key: 'applicationDate',  label: 'Filed',          w: '110px' },
  { key: 'publicationDate',  label: 'Published',      w: '110px' },
  { key: 'registrationDate', label: 'Registered',     w: '110px' },
  { key: 'expiryDate',       label: 'Expires',        w: '130px' },
  { key: 'status',           label: 'Status',         w: '140px' },
  { key: 'flags',            label: 'Flags',          w: '180px' },
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
 * IP India objected / opposed monitoring badge.
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
 * ILPO Israel 180-day grace-period expiry badge.
 * `alert` shape: { daysLeft: number, graceRemaining: number|null, message: string }
 */
function ILPOExpiryBadge({ alert }) {
  const [open, setOpen] = useState(false)
  if (!alert) return null
  const inGrace  = alert.daysLeft < 0
  const isUrgent = alert.daysLeft <= 30
  const badgeCls = inGrace || isUrgent
    ? 'bg-red-500/15 text-red-400 border-red-500/30'
    : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
  const labelCls = inGrace || isUrgent ? 'text-red-400' : 'text-amber-400'
  const label    = inGrace ? `GRACE ${alert.graceRemaining}d` : `RENEW ${alert.daysLeft}d`
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

/** Office action warning badge (USPTO). */
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

/**
 * Generic expiry badge for non-ILPO marks expiring within 90 days.
 */
function ExpiryFlagBadge({ expiryDate, registry, status }) {
  const [open, setOpen] = useState(false)
  // ILPO has its own badge; status === 'Expiring Soon' is redundant with expiryDate check
  if (registry === 'ILPO') return null
  if (!expiryDate && status !== 'Expiring Soon') return null
  let days = null
  if (expiryDate) {
    try {
      const d = parseISO(expiryDate)
      if (!isValid(d)) return null
      days = differenceInDays(d, new Date())
      if (days < 0 || days > 90) return null
    } catch { return null }
  } else if (status !== 'Expiring Soon') {
    return null
  }
  const isCritical = days !== null && days <= 30
  const badgeCls   = isCritical
    ? 'bg-red-500/15 text-red-400 border-red-500/30'
    : 'bg-orange-500/15 text-orange-400 border-orange-500/30'
  const label = days !== null ? `EXPIRING ${days}d` : 'EXPIRING'
  return (
    <span className="relative inline-flex items-center">
      <button
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border ${badgeCls}`}
        aria-label="Expiring within 90 days"
      >
        <Clock className="w-2.5 h-2.5" />
        {label}
      </button>
      {open && (
        <div className="absolute bottom-full left-0 mb-1.5 z-50 w-52 p-3 rounded-lg bg-navy-700 border border-navy-400 shadow-xl text-xs text-slate-300 leading-relaxed pointer-events-none">
          <p className={`font-semibold mb-1 text-[11px] uppercase tracking-wider ${isCritical ? 'text-red-400' : 'text-orange-400'}`}>
            Renewal Due Within 90 Days
          </p>
          <p>This mark expires {days !== null ? `in ${days} days` : 'soon'}. File renewal to maintain registration.</p>
        </div>
      )}
    </span>
  )
}

// ── CSV helpers ───────────────────────────────────────────────────────────────

/**
 * Parse a CSV string into an array of objects keyed by the header row.
 * Handles quoted fields with embedded commas.
 */
function parseCsv(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim())
  if (lines.length < 2) return []

  const parseRow = line => {
    const fields = []
    let cur = '', inQuote = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++ }
        else inQuote = !inQuote
      } else if (ch === ',' && !inQuote) {
        fields.push(cur.trim()); cur = ''
      } else {
        cur += ch
      }
    }
    fields.push(cur.trim())
    return fields
  }

  const headers = parseRow(lines[0]).map(h => h.toLowerCase().replace(/[^a-z0-9]+/g, '_'))
  return lines.slice(1).map(line => {
    const vals = parseRow(line)
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? '']))
  })
}

/**
 * Normalise a parsed CSV row into a trademark object.
 * Expected columns (case-insensitive, punctuation-tolerant):
 *   Applicant, Mark Name, Application No., Registration No.,
 *   NCL Class, Filed Date, Registration Date, Expiry Date, Status
 */
function normaliseCsvRow(row, reg, idx) {
  // After parseCsv, headers are lowercased with non-alphanumeric chars → '_'
  // e.g. "Application No." → "application_no_"
  const get = (...keys) => {
    for (const k of keys) {
      const v = row[k] || ''
      if (v) return v
    }
    return ''
  }

  const applicant       = get('applicant', 'applicant_name', 'owner')
  const markName        = get('mark_name', 'trademark_name', 'trademark', 'mark', 'brand')
  const appNo           = get('application_no_', 'application_no', 'application_number', 'app_no', 'serial_no', 'serial_number')
  const regNo           = get('registration_no_', 'registration_no', 'registration_number', 'reg_no')
  const ncl             = get('ncl_class', 'ncl', 'class', 'nice_class', 'classes', 'code')
  const applicationDate = get('filed_date', 'filing_date', 'application_date', 'filed')
  const registrationDate = get('registration_date', 'registered', 'registration_date_')
  const expiryDate      = get('expiry_date', 'expiry_date_', 'expiry', 'valid_until', 'renewal_date')
  const rawStatus       = get('status', 'trademark_status', 'mark_status')

  const s = (rawStatus || '').toLowerCase()
  let status = 'Unknown'
  if (s.includes('registered') || s.includes('active'))           status = 'Active'
  else if (s.includes('pending') || s.includes('filed') ||
           s.includes('object'))                                   status = 'Pending'
  else if (s.includes('expir'))                                    status = 'Expired'
  else if (s.includes('oppos') || s.includes('refus'))             status = 'Opposed'
  else if (rawStatus) status = rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1).toLowerCase()

  return {
    id:               `${reg.id}-csv-${appNo || idx}`,
    registry:         reg.value,
    country:          reg.id === 'ipindia' ? 'India' : reg.id === 'ilpo' ? 'Israel' : reg.label,
    applicant,
    markName:         markName || '—',
    serialNo:         appNo,
    regNo,
    kindOfMark:       '—',
    ncl,
    applicationDate,
    registrationDate,
    expiryDate,
    status,
    source:           'csv',
  }
}

/**
 * CSV upload panel for a single registry (IP India or ILPO).
 */
function CsvUploadPanel({ reg, registryStatus, onCsvUpload }) {
  const inputRef              = useRef(null)
  const [error,   setError]   = useState(null)
  const [isDragging, setDrag] = useState(false)

  const rs          = registryStatus[reg.id] ?? {}
  const hasData     = rs.count > 0
  const lastFetched = rs.lastFetched

  const processFile = useCallback(file => {
    setError(null)
    if (!file) return
    if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
      setError('Please upload a .csv file')
      return
    }
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const rows = parseCsv(e.target.result)
        if (rows.length === 0) { setError('CSV file appears to be empty or invalid'); return }
        const marks = rows
          .map((row, i) => normaliseCsvRow(row, reg, i))
          .filter(m => m.applicant || m.markName !== '—')
        if (marks.length === 0) { setError('No valid trademark rows found in CSV'); return }
        onCsvUpload(reg.id, marks)
      } catch (err) {
        setError(`Parse error: ${err.message}`)
      }
    }
    reader.onerror = () => setError('Failed to read file')
    reader.readAsText(file)
  }, [reg, onCsvUpload])

  const downloadUrl = reg.id === 'ipindia' ? 'ipindia.gov.in' : 'trademarks.justice.gov.il'
  const lastLabel   = lastFetched
    ? format(new Date(lastFetched), 'dd MMM yyyy, HH:mm')
    : 'Never'

  return (
    <div className="bg-navy-800 border border-navy-500 rounded-xl p-5">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <h3 className="font-semibold text-white text-sm">{reg.label}</h3>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-slate-500/15 text-slate-400 border border-slate-500/25">
              Manual Upload
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Download your trademark data from{' '}
            <span className="text-slate-300 font-mono">{downloadUrl}</span>
            {' '}and upload here.{' '}
            <span className={lastFetched ? 'text-slate-400' : 'text-slate-500'}>
              Last uploaded: <span className={lastFetched ? 'text-green-400 font-medium' : ''}>{lastLabel}</span>
            </span>
          </p>
        </div>
        {hasData && (
          <span className="text-xs text-green-400 font-medium flex-shrink-0 ml-4">
            {rs.count} marks loaded
          </span>
        )}
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); processFile(e.dataTransfer.files[0]) }}
        className={`border-2 border-dashed rounded-lg px-5 py-4 text-center transition-colors cursor-pointer
          ${isDragging ? 'border-accent-blue bg-accent-blue/5' : 'border-navy-400 hover:border-navy-300'}`}
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="w-5 h-5 text-slate-400 mx-auto mb-1.5" />
        <p className="text-sm text-slate-300">
          {hasData ? 'Drop a new CSV to replace, or click to browse' : 'Drop CSV here or click to browse'}
        </p>
        <p className="text-[11px] text-slate-500 mt-1 font-mono">
          {reg.csvColumns?.join(' · ')}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={e => processFile(e.target.files?.[0])}
        />
      </div>

      {error && (
        <p className="mt-2 text-xs text-red-400 flex items-center gap-1">
          <X className="w-3.5 h-3.5 flex-shrink-0" />{error}
        </p>
      )}
    </div>
  )
}

// ── main Portfolio component ──────────────────────────────────────────────────

/**
 * Props:
 *   data           — combined deduped trademark array from App.jsx
 *   registryStatus — { [registryId]: { status, count, error, lastFetched } }
 *   progress       — { current, total, msg } | null
 *   lastUpdated    — Date | null
 *   onRefresh      — () => void
 *   onCsvUpload    — (registryId: string, rows: object[]) => void
 */
export default function Portfolio({ data, registryStatus = {}, progress, lastUpdated, onRefresh, onCsvUpload }) {
  const [search,   setSearch]   = useState('')
  const [status,   setStatus]   = useState('All')
  const [registry, setRegistry] = useState('All')
  const [country,  setCountry]  = useState('All')
  const [sortKey,  setSortKey]  = useState('markName')
  const [sortDir,  setSortDir]  = useState('asc')
  const [page,     setPage]     = useState(1)

  const statuses   = useMemo(() => ['All', ...new Set(data.map(t => t.status))],   [data])
  const registries = useMemo(() => ['All', ...new Set(data.map(t => t.registry))], [data])
  const countries  = useMemo(() => ['All', ...new Set(data.map(t => t.country))],  [data])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return data
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
  }, [data, search, status, registry, country, sortKey, sortDir])

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

  // Summary counts
  const summary = {
    total:    data.length,
    active:   data.filter(t => t.status === 'Active').length,
    pending:  data.filter(t => t.status === 'Pending').length,
    expiring: data.filter(t => t.status === 'Expiring Soon').length,
    opposed:  data.filter(t => t.status === 'Opposed').length,
    expired:  data.filter(t => t.status === 'Expired').length,
  }

  const summaryCards = [
    { label: 'Total',         value: summary.total,    color: 'text-accent-blue' },
    { label: 'Active',        value: summary.active,   color: 'text-green-400'   },
    { label: 'Pending',       value: summary.pending,  color: 'text-yellow-400'  },
    { label: 'Expiring Soon', value: summary.expiring, color: 'text-orange-400'  },
    { label: 'Opposed',       value: summary.opposed,  color: 'text-red-400'     },
    { label: 'Expired',       value: summary.expired,  color: 'text-slate-400'   },
  ]

  // Registry status derived counts
  const liveCount     = Object.values(registryStatus).reduce((sum, s) => sum + (s.count || 0), 0)
  const isRefreshing  = progress !== null
  const pendingRegs   = REGISTRIES.filter(r => registryStatus[r.id]?.status === 'pending')
  const errorRegs     = REGISTRIES.filter(r => registryStatus[r.id]?.status === 'error')

  // Alert counts
  const indiaAlertCount  = data.filter(r => r.ipIndiaAlert).length
  const ilpoExpiryCount  = data.filter(r => r.ilpoExpiryAlert).length

  return (
    <div className="space-y-4">

      {/* ── Refresh All button + progress ── */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {isRefreshing ? (
            <>
              <Loader2 className="w-4 h-4 text-accent-blue animate-spin flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-sm text-accent-blue truncate">{progress.msg}</p>
                <div className="mt-1 h-1.5 bg-navy-600 rounded-full overflow-hidden w-64">
                  <div
                    className="h-full bg-accent-blue rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, (progress.current / progress.total) * 100)}%` }}
                  />
                </div>
              </div>
            </>
          ) : lastUpdated ? (
            <p className="text-xs text-slate-500">
              Data as of {format(lastUpdated, 'dd MMM yyyy HH:mm')} UTC
            </p>
          ) : (
            <p className="text-xs text-slate-400">
              Click <span className="text-accent-blue font-medium">Refresh All Registries</span> to fetch trademark data for all entities
            </p>
          )}
        </div>
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-blue/10 border border-accent-blue/30 text-accent-blue text-sm hover:bg-accent-blue/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap flex-shrink-0"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh All Registries
        </button>
      </div>

      {/* ── Pending-credentials info bar ── */}
      {pendingRegs.length > 0 && !isRefreshing && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-lg bg-indigo-500/10 border border-indigo-500/25 text-indigo-300 text-sm">
          <Clock className="w-4 h-4 flex-shrink-0 mt-0.5 text-indigo-400" />
          <span className="leading-relaxed">
            <span className="font-semibold text-indigo-400">Pending credentials — </span>
            {pendingRegs.map(r => r.label).join(', ')} require API credentials to fetch data.
            Configure them in <button className="underline hover:text-indigo-200 transition-colors" onClick={() => {}}>API Setup</button>.
          </span>
        </div>
      )}

      {/* ── Error banners ── */}
      {errorRegs.map(reg => (
        <div key={reg.id} className="flex items-start gap-3 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/25 text-red-400 text-sm">
          <X className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span className="leading-relaxed">
            <span className="font-semibold">{reg.label} unavailable — </span>
            {registryStatus[reg.id]?.error || 'Fetch failed'}. Results for this registry may be incomplete.
          </span>
        </div>
      ))}

      {/* ── ILPO expiry banner ── */}
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
            <strong>{indiaAlertCount}</strong> IP India mark{indiaAlertCount !== 1 ? 's require' : ' requires'} active monitoring — objected or opposed marks in a registry with known processing backlogs.
          </span>
        </div>
      )}

      {/* ── CSV Upload panels (IP India + ILPO) ── */}
      {REGISTRIES.filter(r => r.fetchStrategy === 'csv').map(reg => (
        <CsvUploadPanel
          key={reg.id}
          reg={reg}
          registryStatus={registryStatus}
          onCsvUpload={onCsvUpload}
        />
      ))}

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
          { value: status,   onChange: v => { setStatus(v);   setPage(1) }, opts: statuses,   placeholder: 'All Statuses'   },
          { value: registry, onChange: v => { setRegistry(v); setPage(1) }, opts: registries, placeholder: 'All Registries' },
          { value: country,  onChange: v => { setCountry(v);  setPage(1) }, opts: countries,  placeholder: 'All Countries'  },
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

        {/* Refresh progress banner inside table */}
        {isRefreshing && (
          <div className="flex items-center justify-center gap-3 py-4 border-b border-navy-500 bg-accent-blue/5">
            <Loader2 className="w-4 h-4 text-accent-blue animate-spin" />
            <span className="text-sm text-accent-blue">{progress.msg}</span>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm data-table">
            <thead>
              <tr className="border-b border-navy-500">
                {COLUMNS.map(col => (
                  <th
                    key={col.key}
                    onClick={() => col.key !== 'flags' && sort(col.key)}
                    style={{ minWidth: col.w }}
                    className={`px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider transition-colors select-none whitespace-nowrap
                      ${col.key !== 'flags' ? 'cursor-pointer hover:text-accent-blue' : 'cursor-default'}
                    `}
                  >
                    <span className="flex items-center gap-1">
                      {col.label}
                      {col.key !== 'flags' && (
                        sortKey === col.key
                          ? sortDir === 'asc'
                            ? <ChevronUp   className="w-3.5 h-3.5 text-accent-blue flex-shrink-0" />
                            : <ChevronDown className="w-3.5 h-3.5 text-accent-blue flex-shrink-0" />
                          : <ChevronUp className="w-3.5 h-3.5 opacity-0 flex-shrink-0" />
                      )}
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
                  `}
                >
                  {/* Applicant */}
                  <td className="px-4 py-3 text-slate-300 whitespace-nowrap">{tm.applicant}</td>

                  {/* Mark name */}
                  <td className="px-4 py-3 font-semibold text-white whitespace-nowrap">{tm.markName}</td>

                  {/* Registry badge + source tags */}
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1 items-start">
                      <span className={`px-2 py-0.5 rounded text-xs font-mono font-medium border ${REGISTRY_STYLES[tm.registry] || REGISTRY_DEFAULT}`}>
                        {tm.registry}
                      </span>
                      {tm.source === 'csv' && (
                        <span className="px-1.5 py-0 rounded text-[9px] font-bold border bg-slate-500/10 text-slate-400 border-slate-500/25 tracking-wide">
                          MANUAL UPLOAD
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

                  {/* Status pill */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${STATUS_STYLES[tm.status] || STATUS_STYLES['Active']}`}>
                      {tm.status}
                    </span>
                  </td>

                  {/* Flags column — all alert badges */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex flex-wrap items-center gap-1">
                      <ExpiryFlagBadge    expiryDate={tm.expiryDate} registry={tm.registry} status={tm.status} />
                      <OfficeActionBadge  pending={tm.pendingOfficeAction} />
                      <IPIndiaWarningBadge alert={tm.ipIndiaAlert} />
                      <ILPOExpiryBadge   alert={tm.ilpoExpiryAlert} />
                    </div>
                  </td>
                </tr>
              ))}

              {rows.length === 0 && !isRefreshing && data.length === 0 && (
                <tr>
                  <td colSpan={COLUMNS.length} className="px-4 py-20 text-center">
                    <p className="text-slate-400 text-sm mb-1">No trademark data loaded yet.</p>
                    <p className="text-slate-500 text-xs">
                      Click <span className="text-accent-blue font-medium">Refresh All Registries</span> to fetch trademark data for all entities
                    </p>
                  </td>
                </tr>
              )}

              {rows.length === 0 && !isRefreshing && data.length > 0 && (
                <tr>
                  <td colSpan={COLUMNS.length} className="px-4 py-16 text-center text-slate-500">
                    No records match your filters.{' '}
                    <button onClick={resetFilters} className="text-accent-blue hover:underline">Clear filters</button>
                  </td>
                </tr>
              )}

              {rows.length === 0 && isRefreshing && (
                <tr>
                  <td colSpan={COLUMNS.length} className="px-4 py-16 text-center text-slate-500">
                    Fetching live data…
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
