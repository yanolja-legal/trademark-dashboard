import React, { useState, useMemo } from 'react'
import {
  Search, X, Globe, Loader2, AlertTriangle, Clock, RefreshCw, Download,
} from 'lucide-react'
import { format } from 'date-fns'
import { REGISTRIES } from '../registries'
import { fmt } from './PortfolioBadges'
import PortfolioTable from './PortfolioTable'

// ── constants ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 10

const SORT_OPTIONS = [
  { label: 'Applicant',  key: 'applicant'        },
  { label: 'Mark Name',  key: 'markName'          },
  { label: 'Filed',      key: 'applicationDate'   },
  { label: 'Registry',   key: 'registry'          },
  { label: 'Status',     key: 'status'            },
]

// ── main Portfolio component ──────────────────────────────────────────────────

/**
 * Props:
 *   data           — combined deduped trademark array from App.jsx
 *   registryStatus — { [registryId]: { status, count, error, lastFetched } }
 *   progress       — { current, total, msg } | null
 *   lastUpdated    — Date | null
 *   onRefresh      — () => void
 */
export default function Portfolio({ data, registryStatus = {}, progress, lastUpdated, onRefresh }) {
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

  function handleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
    setPage(1)
  }

  function resetFilters() {
    setSearch(''); setStatus('All'); setRegistry('All'); setCountry('All'); setPage(1)
  }

  function downloadCSV() {
    const headers = ['Applicant','Mark Name','Registry','Country','Serial No.','Reg. No.','Kind','NCL','Filed','Published','Registered','Expires','Status']
    const esc     = v => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines   = [
      headers.join(','),
      ...filtered.map(t => [
        t.applicant, t.markName, t.registry, t.country,
        t.serialNo, t.regNo, t.kindOfMark, t.ncl,
        fmt(t.applicationDate), fmt(t.publicationDate),
        fmt(t.registrationDate), fmt(t.expiryDate), t.status,
      ].map(esc).join(',')),
    ]
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `trademarks-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
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

  const isRefreshing     = progress !== null
  const pendingRegs      = REGISTRIES.filter(r => !r.hidden && registryStatus[r.id]?.status === 'pending')
  const errorRegs        = REGISTRIES.filter(r => !r.hidden && registryStatus[r.id]?.status === 'error')
  const indiaAlertCount  = data.filter(r => r.ipIndiaAlert).length
  const ilpoExpiryCount  = data.filter(r => r.ilpoExpiryAlert).length

  return (
    <div className="space-y-4">

      {/* Refresh button + progress */}
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
        <div className="flex items-center gap-2 flex-shrink-0">
          {filtered.length > 0 && (
            <button
              onClick={downloadCSV}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 text-sm hover:bg-green-500/20 transition-colors whitespace-nowrap"
            >
              <Download className="w-4 h-4" />
              Download CSV
            </button>
          )}
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-blue/10 border border-accent-blue/30 text-accent-blue text-sm hover:bg-accent-blue/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh All Registries
          </button>
        </div>
      </div>

      {/* Pending-credentials info bar */}
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

      {/* Error banners */}
      {errorRegs.map(reg => (
        <div key={reg.id} className="flex items-start gap-3 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/25 text-red-400 text-sm">
          <X className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span className="leading-relaxed">
            <span className="font-semibold">{reg.label} unavailable — </span>
            {registryStatus[reg.id]?.error || 'Fetch failed'}. Results for this registry may be incomplete.
          </span>
        </div>
      ))}

      {/* ILPO expiry banner */}
      {ilpoExpiryCount > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-teal-500/10 border border-teal-500/25 text-teal-400 text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>
            <strong>{ilpoExpiryCount}</strong> Israeli mark{ilpoExpiryCount !== 1 ? 's are' : ' is'} within the 180-day renewal window — Israel's 6-month grace period is the critical action deadline.
          </span>
        </div>
      )}

      {/* IP India monitoring banner */}
      {indiaAlertCount > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-orange-500/10 border border-orange-500/25 text-orange-400 text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>
            <strong>{indiaAlertCount}</strong> IP India mark{indiaAlertCount !== 1 ? 's require' : ' requires'} active monitoring — objected or opposed marks in a registry with known processing backlogs.
          </span>
        </div>
      )}

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

        <select
          value={sortKey}
          onChange={e => { setSortKey(e.target.value); setSortDir('asc'); setPage(1) }}
          className="px-3 py-2.5 bg-navy-800 border border-navy-500 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-accent-blue/50 transition-colors"
        >
          {SORT_OPTIONS.map(o => (
            <option key={o.key} value={o.key}>Sort by: {o.label}</option>
          ))}
        </select>

        <select
          value={sortDir}
          onChange={e => { setSortDir(e.target.value); setPage(1) }}
          className="px-3 py-2.5 bg-navy-800 border border-navy-500 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-accent-blue/50 transition-colors"
        >
          <option value="asc">A → Z</option>
          <option value="desc">Z → A</option>
        </select>

        <span className="text-sm text-slate-400 ml-auto">
          {filtered.length} result{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      <PortfolioTable
        rows={rows}
        isRefreshing={isRefreshing}
        progress={progress}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={handleSort}
        page={page}
        totalPages={totalPages}
        totalFiltered={filtered.length}
        onPageChange={setPage}
        onClearFilters={resetFilters}
        dataEmpty={data.length === 0}
      />
    </div>
  )
}
