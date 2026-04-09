import React, { useState, useMemo } from 'react'
import { Search, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { differenceInDays, parseISO, format, isValid } from 'date-fns'

const STATUS_STYLES = {
  'Active':        'bg-green-500/10 text-green-400 border-green-500/20',
  'Pending':       'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  'Expiring Soon': 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  'Opposed':       'bg-red-500/10 text-red-400 border-red-500/20',
  'Expired':       'bg-slate-500/10 text-slate-400 border-slate-500/20',
}

const COLUMNS = [
  { key: 'applicant',        label: 'Applicant',     w: '160px' },
  { key: 'markName',         label: 'Mark Name',     w: '160px' },
  { key: 'registry',         label: 'Registry',      w: '95px'  },
  { key: 'country',          label: 'Country',       w: '140px' },
  { key: 'serialNo',         label: 'Serial No.',    w: '130px' },
  { key: 'regNo',            label: 'Reg. No.',      w: '120px' },
  { key: 'kindOfMark',       label: 'Kind',          w: '95px'  },
  { key: 'ncl',              label: 'NCL',           w: '80px'  },
  { key: 'applicationDate',  label: 'App. Date',     w: '110px' },
  { key: 'publicationDate',  label: 'Pub. Date',     w: '110px' },
  { key: 'registrationDate', label: 'Reg. Date',     w: '110px' },
  { key: 'expiryDate',       label: 'Expiry Date',   w: '130px' },
  { key: 'status',           label: 'Status',        w: '130px' },
]

const PAGE_SIZE = 10

function fmt(str) {
  if (!str) return '—'
  try {
    const d = parseISO(str)
    return isValid(d) ? format(d, 'dd MMM yyyy') : str
  } catch { return str }
}

function ExpiryCell({ dateStr }) {
  if (!dateStr) return <span className="text-slate-500">—</span>
  const d = parseISO(dateStr)
  if (!isValid(d)) return <span className="text-slate-500">—</span>
  const days = differenceInDays(d, new Date())
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

export default function Portfolio({ data }) {
  const [search,   setSearch]   = useState('')
  const [status,   setStatus]   = useState('All')
  const [registry, setRegistry] = useState('All')
  const [country,  setCountry]  = useState('All')
  const [sortKey,  setSortKey]  = useState('markName')
  const [sortDir,  setSortDir]  = useState('asc')
  const [page,     setPage]     = useState(1)

  const statuses   = ['All', ...new Set(data.map(t => t.status))]
  const registries = ['All', ...new Set(data.map(t => t.registry))]
  const countries  = ['All', ...new Set(data.map(t => t.country))]

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
  const rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function sort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
    setPage(1)
  }

  function resetFilters() {
    setSearch(''); setStatus('All'); setRegistry('All'); setCountry('All'); setPage(1)
  }

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

  return (
    <div className="space-y-5">

      {/* Summary cards */}
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

      {/* Filters */}
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
          { value: status,   onChange: v => { setStatus(v);   setPage(1) }, opts: statuses,   placeholder: 'All Statuses' },
          { value: registry, onChange: v => { setRegistry(v); setPage(1) }, opts: registries, placeholder: 'All Registries' },
          { value: country,  onChange: v => { setCountry(v);  setPage(1) }, opts: countries,  placeholder: 'All Countries' },
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
        </span>
      </div>

      {/* Table */}
      <div className="bg-navy-800 border border-navy-500 rounded-xl overflow-hidden">
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
                  className={`border-b border-navy-600/40 hover:bg-navy-700/30 transition-colors ${tm.status === 'Expired' ? 'opacity-50' : ''}`}
                >
                  <td className="px-4 py-3 text-slate-300 whitespace-nowrap">{tm.applicant}</td>
                  <td className="px-4 py-3 font-semibold text-white whitespace-nowrap">{tm.markName}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded text-xs font-mono font-medium bg-accent-blue/10 text-accent-blue border border-accent-blue/20">
                      {tm.registry}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-300 whitespace-nowrap">{tm.country}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-400 whitespace-nowrap">{tm.serialNo || '—'}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-400 whitespace-nowrap">{tm.regNo || '—'}</td>
                  <td className="px-4 py-3 text-slate-300 whitespace-nowrap">{tm.kindOfMark}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-400 whitespace-nowrap">{tm.ncl}</td>
                  <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">{fmt(tm.applicationDate)}</td>
                  <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">{fmt(tm.publicationDate)}</td>
                  <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">{fmt(tm.registrationDate)}</td>
                  <td className="px-4 py-3 text-xs whitespace-nowrap"><ExpiryCell dateStr={tm.expiryDate} /></td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${STATUS_STYLES[tm.status] || STATUS_STYLES['Active']}`}>
                      {tm.status}
                    </span>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
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
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
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
