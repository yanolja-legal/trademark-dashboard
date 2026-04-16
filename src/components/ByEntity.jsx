import React from 'react'
import { Building2, AlertTriangle, Clock, RefreshCw } from 'lucide-react'
import { differenceInDays, parseISO, format, isValid } from 'date-fns'
import { SUBSIDIARIES } from '../subsidiaries.js'
import { REGISTRIES }   from '../registries.js'

// ── helpers ───────────────────────────────────────────────────────────────────

function hasFlag(t) {
  if (t.ipIndiaAlert)        return true
  if (t.ilpoExpiryAlert)     return true
  if (t.pendingOfficeAction) return true
  if (t.status === 'Opposed') return true
  if (t.expiryDate) {
    try {
      const d = parseISO(t.expiryDate)
      if (isValid(d)) {
        const days = differenceInDays(d, new Date())
        if (days >= 0 && days <= 90) return true
      }
    } catch { /* skip */ }
  }
  return false
}

const REGISTRY_COLORS = {
  'WIPO Madrid' : 'text-purple-400 border-purple-500/30 bg-purple-500/8',
  'USPTO'       : 'text-sky-400    border-sky-500/30    bg-sky-500/8',
  'IP India'    : 'text-orange-400 border-orange-500/30 bg-orange-500/8',
  'ILPO'        : 'text-teal-400   border-teal-500/30   bg-teal-500/8',
  'KIPRIS'      : 'text-pink-400   border-pink-500/30   bg-pink-500/8',
}

// ── EntityCard ────────────────────────────────────────────────────────────────

function EntityCard({ sub, marks, registryStatus, lastUpdated, onRefreshRegistry, isRefreshing }) {
  const counts = {
    active:   marks.filter(m => m.status === 'Active').length,
    pending:  marks.filter(m => m.status === 'Pending').length,
    expiring: marks.filter(m => m.status === 'Expiring Soon').length,
    opposed:  marks.filter(m => m.status === 'Opposed').length,
    expired:  marks.filter(m => m.status === 'Expired').length,
  }
  const flagCount      = marks.filter(hasFlag).length
  const isEmpty        = marks.length === 0

  // Per-registry breakdown — show all API-fetchable registries so refresh buttons are always visible
  const regBreakdown = REGISTRIES
    .filter(reg => reg.fetchStrategy === 'numbers' || reg.fetchStrategy === 'holder')
    .map(reg => {
      const count  = marks.filter(m => m.registry === reg.value).length
      const status = registryStatus[reg.id]?.status ?? 'idle'
      return { reg, count, status }
    })

  const countries = [...new Set(marks.map(m => m.country))]

  const statBadges = [
    { label: 'Active',   value: counts.active,   cls: 'text-green-400  bg-green-500/10  border-green-500/20'  },
    { label: 'Pending',  value: counts.pending,  cls: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20' },
    { label: 'Expiring', value: counts.expiring, cls: 'text-orange-400 bg-orange-500/10 border-orange-500/20' },
    { label: 'Opposed',  value: counts.opposed,  cls: 'text-red-400    bg-red-500/10    border-red-500/20'    },
    { label: 'Expired',  value: counts.expired,  cls: 'text-slate-400  bg-slate-500/10  border-slate-500/20'  },
  ]

  return (
    <div className={`bg-navy-800 border rounded-xl p-5 transition-colors ${isEmpty ? 'border-navy-600 opacity-60' : 'border-navy-500 hover:border-navy-400'}`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-accent-blue/10 border border-accent-blue/20">
            <Building2 className="w-5 h-5 text-accent-blue" />
          </div>
          <div>
            <h3 className="font-semibold text-white leading-tight">{sub.name}</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {sub.country}
              {isEmpty
                ? <span className="ml-2 text-slate-500 italic">no marks registered</span>
                : <span className="ml-2">{marks.length} trademark{marks.length !== 1 ? 's' : ''}</span>
              }
            </p>
          </div>
        </div>
        {flagCount > 0 && (
          <span className="flex items-center gap-1 px-2.5 py-1 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400 font-medium flex-shrink-0">
            <AlertTriangle className="w-3.5 h-3.5" />
            {flagCount} flag{flagCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Status breakdown */}
      <div className="grid grid-cols-5 gap-2 mb-4">
        {statBadges.map(b => (
          <div key={b.label} className={`rounded-lg border p-2 text-center ${b.cls}`}>
            <p className="text-lg font-bold leading-none mb-1">{b.value}</p>
            <p className="text-[10px] opacity-80 uppercase tracking-wide">{b.label}</p>
          </div>
        ))}
      </div>

      {/* Registry breakdown with per-registry refresh */}
      {regBreakdown.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {regBreakdown.map(({ reg, count, status }) => {
            const cls        = REGISTRY_COLORS[reg.value] || REGISTRY_COLORS[reg.label] || 'text-accent-blue border-accent-blue/30 bg-accent-blue/8'
            const isLoading  = status === 'loading'
            const isDisabled = isLoading || isRefreshing
            return (
              <span key={reg.id} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono border ${cls} ${count === 0 && !isLoading ? 'opacity-40' : ''}`}>
                {reg.label}
                {isLoading
                  ? <span className="text-[10px] opacity-60">…</span>
                  : <span className="font-bold">{count || '0'}</span>
                }
                <button
                  onClick={() => onRefreshRegistry?.(reg.id, sub.id)}
                  disabled={isDisabled}
                  title={`Refresh ${reg.label} for ${sub.shortName}`}
                  className="ml-0.5 opacity-50 hover:opacity-100 disabled:opacity-20 disabled:cursor-not-allowed transition-opacity"
                >
                  <RefreshCw className={`w-2.5 h-2.5 ${isLoading ? 'animate-spin' : ''}`} />
                </button>
              </span>
            )
          })}
        </div>
      )}

      {/* Footer: jurisdictions + last fetched */}
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>
          {countries.length > 0
            ? `${countries.length} jurisdiction${countries.length !== 1 ? 's' : ''}`
            : 'No jurisdictions yet'
          }
        </span>
        {lastUpdated && (
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {format(lastUpdated, 'dd MMM HH:mm')}
          </span>
        )}
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function ByEntity({ data, registryStatus = {}, lastUpdated, onRefreshRegistryForEntity, isRefreshing = false }) {
  const entities = SUBSIDIARIES
    .filter(s => s.active)
    .map(sub => ({
      sub,
      marks: data.filter(t => t.applicant === sub.name),
    }))
    .sort((a, b) => {
      if (b.marks.length !== a.marks.length) return b.marks.length - a.marks.length
      return a.sub.name.localeCompare(b.sub.name)
    })

  return (
    <div className="space-y-5">

      {/* Summary table */}
      <div className="bg-navy-800 border border-navy-500 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-navy-500 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-white">Entity Summary</h2>
            <p className="text-xs text-slate-400 mt-0.5">Portfolio distribution across all subsidiaries</p>
          </div>
          {lastUpdated && (
            <span className="flex items-center gap-1.5 text-xs text-slate-400">
              <Clock className="w-3.5 h-3.5" />
              Last updated {format(lastUpdated, 'dd MMM yyyy HH:mm')} UTC
            </span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-navy-600/40 bg-navy-700/30">
                {['Entity', 'HQ', 'Total', 'Active', 'Pending', 'Expiring', 'Opposed', 'Expired', 'Flags', 'Registries', 'Jurisdictions'].map((h, i) => (
                  <th
                    key={h}
                    className={`px-5 py-3 text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap
                      ${i <= 1 ? 'text-left text-slate-400' : i === 2 ? 'text-center text-slate-400' : 'text-center'}
                      ${h === 'Active'   ? 'text-green-400/70'  : ''}
                      ${h === 'Pending'  ? 'text-yellow-400/70' : ''}
                      ${h === 'Expiring' ? 'text-orange-400/70' : ''}
                      ${h === 'Opposed'  ? 'text-red-400/70'    : ''}
                      ${h === 'Expired'  ? 'text-slate-500'     : ''}
                      ${h === 'Flags'    ? 'text-red-400/70'    : ''}
                    `}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entities.map(({ sub, marks }) => {
                const active   = marks.filter(m => m.status === 'Active').length
                const pending  = marks.filter(m => m.status === 'Pending').length
                const expiring = marks.filter(m => m.status === 'Expiring Soon').length
                const opposed  = marks.filter(m => m.status === 'Opposed').length
                const expired  = marks.filter(m => m.status === 'Expired').length
                const flags    = marks.filter(hasFlag).length
                const regs     = [...new Set(marks.map(m => m.registry))]
                const juris    = new Set(marks.map(m => m.country)).size
                const isEmpty  = marks.length === 0
                return (
                  <tr
                    key={sub.id}
                    className={`border-b border-navy-600/30 hover:bg-navy-700/20 transition-colors ${isEmpty ? 'opacity-50' : ''}`}
                  >
                    <td className="px-5 py-3 font-medium text-white whitespace-nowrap">{sub.name}</td>
                    <td className="px-5 py-3 text-xs text-slate-400 whitespace-nowrap">{sub.country}</td>
                    <td className="px-5 py-3 text-center font-bold text-slate-200">{marks.length || '—'}</td>
                    <td className="px-5 py-3 text-center text-green-400  font-medium">{active   || '—'}</td>
                    <td className="px-5 py-3 text-center text-yellow-400 font-medium">{pending  || '—'}</td>
                    <td className="px-5 py-3 text-center text-orange-400 font-medium">{expiring || '—'}</td>
                    <td className="px-5 py-3 text-center text-red-400    font-medium">{opposed  || '—'}</td>
                    <td className="px-5 py-3 text-center text-slate-400  font-medium">{expired  || '—'}</td>
                    <td className="px-5 py-3 text-center">
                      {flags > 0
                        ? <span className="flex items-center justify-center gap-1 text-red-400 font-medium">
                            <AlertTriangle className="w-3 h-3" />{flags}
                          </span>
                        : <span className="text-slate-600">—</span>
                      }
                    </td>
                    <td className="px-5 py-3">
                      {regs.length > 0
                        ? <div className="flex flex-wrap gap-1">
                            {regs.map(r => (
                              <span key={r} className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-accent-blue/10 text-accent-blue border border-accent-blue/20">
                                {r}
                              </span>
                            ))}
                          </div>
                        : <span className="text-slate-600 text-xs">—</span>
                      }
                    </td>
                    <td className="px-5 py-3 text-center text-slate-400">{juris || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Entity cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {entities.map(({ sub, marks }) => (
          <EntityCard
            key={sub.id}
            sub={sub}
            marks={marks}
            registryStatus={registryStatus}
            lastUpdated={lastUpdated}
            onRefreshRegistry={onRefreshRegistryForEntity}
            isRefreshing={isRefreshing}
          />
        ))}
      </div>
    </div>
  )
}
