import React, { useMemo } from 'react'
import { Building2, Clock } from 'lucide-react'
import { format } from 'date-fns'
import { SUBSIDIARIES } from '../subsidiaries.js'
import { REGISTRIES }   from '../registries.js'

const REGISTRY_COLORS = {
  'WIPO Madrid' : 'text-purple-400 border-purple-500/30 bg-purple-500/8',
  'USPTO'       : 'text-sky-400    border-sky-500/30    bg-sky-500/8',
  'IP India'    : 'text-orange-400 border-orange-500/30 bg-orange-500/8',
  'ILPO'        : 'text-teal-400   border-teal-500/30   bg-teal-500/8',
  'KIPRIS'      : 'text-pink-400   border-pink-500/30   bg-pink-500/8',
}

// ── EntityCard ────────────────────────────────────────────────────────────────

function EntityCard({ sub, marks, presentRegistries }) {
  const isEmpty = marks.length === 0

  // Per-registry count for this entity — only show registries where this entity has marks
  const registryCounts = presentRegistries
    .map(reg => ({ reg, count: marks.filter(m => m.registry === reg).length }))
    .filter(r => r.count > 0)

  const countries = [...new Set(marks.map(m => m.country))]

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
      </div>

      {/* Per-registry counts (replaces status badges) */}
      {registryCounts.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
          {registryCounts.map(({ reg, count }) => {
            const cls = REGISTRY_COLORS[reg] || 'text-accent-blue border-accent-blue/30 bg-accent-blue/8'
            return (
              <div key={reg} className={`rounded-lg border p-2 text-center ${cls}`}>
                <p className="text-lg font-bold leading-none mb-1">{count}</p>
                <p className="text-[10px] opacity-80 uppercase tracking-wide truncate">{reg}</p>
              </div>
            )
          })}
        </div>
      )}

      {/* Footer: jurisdictions */}
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>
          {countries.length > 0
            ? `${countries.length} jurisdiction${countries.length !== 1 ? 's' : ''}`
            : 'No jurisdictions yet'
          }
        </span>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function ByEntity({ data, lastUpdated }) {
  // Registries actually present in the uploaded data — preserves REGISTRIES.js order
  const presentRegistries = useMemo(() => {
    const present = new Set(data.map(t => t.registry).filter(Boolean))
    return REGISTRIES.map(r => r.value).filter(v => present.has(v))
  }, [data])

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
            <p className="text-xs text-slate-400 mt-0.5">Total trademarks per entity, broken down by registry</p>
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
                <th className="px-5 py-3 text-left  text-[11px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">Entity</th>
                <th className="px-5 py-3 text-left  text-[11px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">HQ</th>
                <th className="px-5 py-3 text-center text-[11px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">Total</th>
                {presentRegistries.map(reg => (
                  <th key={reg} className="px-5 py-3 text-center text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap text-accent-blue/80">
                    {reg}
                  </th>
                ))}
                <th className="px-5 py-3 text-center text-[11px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">Jurisdictions</th>
              </tr>
            </thead>
            <tbody>
              {entities.map(({ sub, marks }) => {
                const juris = new Set(marks.map(m => m.country)).size
                const isEmpty = marks.length === 0
                return (
                  <tr
                    key={sub.id}
                    className={`border-b border-navy-600/30 hover:bg-navy-700/20 transition-colors ${isEmpty ? 'opacity-50' : ''}`}
                  >
                    <td className="px-5 py-3 font-medium text-white whitespace-nowrap">{sub.name}</td>
                    <td className="px-5 py-3 text-xs text-slate-400 whitespace-nowrap">{sub.country}</td>
                    <td className="px-5 py-3 text-center font-bold text-slate-200">{marks.length || '—'}</td>
                    {presentRegistries.map(reg => {
                      const count = marks.filter(m => m.registry === reg).length
                      return (
                        <td key={reg} className="px-5 py-3 text-center text-accent-blue font-medium">
                          {count || '—'}
                        </td>
                      )
                    })}
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
            presentRegistries={presentRegistries}
          />
        ))}
      </div>
    </div>
  )
}
