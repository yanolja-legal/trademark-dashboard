import React from 'react'
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import {
  fmt, ExpiryCell, DesignatedCountriesTooltip,
  IPIndiaWarningBadge, ILPOExpiryBadge, OfficeActionBadge, ExpiryFlagBadge,
  STATUS_STYLES, REGISTRY_STYLES, REGISTRY_DEFAULT,
} from './PortfolioBadges'

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

/**
 * Props:
 *   rows          — current page's trademark records
 *   isRefreshing  — boolean
 *   progress      — { msg } | null
 *   sortKey       — active sort column key
 *   sortDir       — 'asc' | 'desc'
 *   onSort        — (key) => void
 *   page          — current page number
 *   totalPages    — total page count
 *   totalFiltered — total matching records count
 *   onPageChange  — (page) => void
 *   onClearFilters — () => void
 *   dataEmpty     — true when no trademark data loaded at all
 */
export default function PortfolioTable({
  rows, isRefreshing, progress,
  sortKey, sortDir, onSort,
  page, totalPages, totalFiltered,
  onPageChange, onClearFilters, dataEmpty,
}) {
  return (
    <div className="bg-navy-800 border border-navy-500 rounded-xl overflow-hidden">

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
                  onClick={() => col.key !== 'flags' && onSort(col.key)}
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
                className={`border-b border-navy-600/40 hover:bg-navy-700/30 transition-colors ${tm.status === 'Expired' ? 'opacity-50' : ''}`}
              >
                <td className="px-4 py-3 text-slate-300 whitespace-nowrap">{tm.applicant}</td>
                <td className="px-4 py-3 font-semibold text-white whitespace-nowrap">{tm.markName}</td>

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

                <td className="px-4 py-3 text-slate-300 whitespace-nowrap">
                  {tm.country}
                  {tm.registry === 'WIPO Madrid' && (
                    <DesignatedCountriesTooltip countries={tm.designatedCountries} />
                  )}
                </td>

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

            {rows.length === 0 && !isRefreshing && dataEmpty && (
              <tr>
                <td colSpan={COLUMNS.length} className="px-4 py-20 text-center">
                  <p className="text-slate-400 text-sm mb-1">No trademark data loaded yet.</p>
                  <p className="text-slate-500 text-xs">
                    Click <span className="text-accent-blue font-medium">Refresh All Registries</span> to fetch trademark data for all entities
                  </p>
                </td>
              </tr>
            )}

            {rows.length === 0 && !isRefreshing && !dataEmpty && (
              <tr>
                <td colSpan={COLUMNS.length} className="px-4 py-16 text-center text-slate-500">
                  No records match your filters.{' '}
                  <button onClick={onClearFilters} className="text-accent-blue hover:underline">Clear filters</button>
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

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-navy-500">
          <p className="text-xs text-slate-400">
            Showing {(page - 1) * 10 + 1}–{Math.min(page * 10, totalFiltered)} of {totalFiltered}
          </p>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onPageChange(p => Math.max(1, p - 1))}
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
                onClick={() => onPageChange(p)}
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
              onClick={() => onPageChange(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-1.5 rounded bg-navy-700 border border-navy-500 text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
