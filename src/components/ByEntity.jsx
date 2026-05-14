import React, { useMemo } from 'react'
import { Clock } from 'lucide-react'
import { format } from 'date-fns'
import { SUBSIDIARIES } from '../subsidiaries.js'
import { REGISTRIES }   from '../registries.js'

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

    </div>
  )
}
