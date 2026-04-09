import React from 'react'
import { Building2, AlertTriangle } from 'lucide-react'

function EntityCard({ entity, marks }) {
  const counts = {
    active:   marks.filter(m => m.status === 'Active').length,
    pending:  marks.filter(m => m.status === 'Pending').length,
    expiring: marks.filter(m => m.status === 'Expiring Soon').length,
    opposed:  marks.filter(m => m.status === 'Opposed').length,
    expired:  marks.filter(m => m.status === 'Expired').length,
  }
  const needsAttention = counts.expiring + counts.opposed + counts.expired
  const registries = [...new Set(marks.map(m => m.registry))]
  const countries  = [...new Set(marks.map(m => m.country))]

  const statBadges = [
    { label: 'Active',   value: counts.active,   cls: 'text-green-400  bg-green-500/10  border-green-500/20'  },
    { label: 'Pending',  value: counts.pending,  cls: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20' },
    { label: 'Expiring', value: counts.expiring, cls: 'text-orange-400 bg-orange-500/10 border-orange-500/20' },
    { label: 'Opposed',  value: counts.opposed,  cls: 'text-red-400    bg-red-500/10    border-red-500/20'    },
    { label: 'Expired',  value: counts.expired,  cls: 'text-slate-400  bg-slate-500/10  border-slate-500/20'  },
  ]

  return (
    <div className="bg-navy-800 border border-navy-500 rounded-xl p-5 hover:border-navy-400 transition-colors">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-accent-blue/10 border border-accent-blue/20">
            <Building2 className="w-5 h-5 text-accent-blue" />
          </div>
          <div>
            <h3 className="font-semibold text-white leading-tight">{entity}</h3>
            <p className="text-xs text-slate-400 mt-0.5">{marks.length} trademark{marks.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        {needsAttention > 0 && (
          <span className="flex items-center gap-1 px-2.5 py-1 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400 font-medium">
            <AlertTriangle className="w-3.5 h-3.5" />
            {needsAttention} alerts
          </span>
        )}
      </div>

      <div className="grid grid-cols-5 gap-2 mb-4">
        {statBadges.map(b => (
          <div key={b.label} className={`rounded-lg border p-2 text-center ${b.cls}`}>
            <p className="text-lg font-bold leading-none mb-1">{b.value}</p>
            <p className="text-[10px] opacity-80 uppercase tracking-wide">{b.label}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5 mb-2">
        {registries.map(r => (
          <span key={r} className="px-2 py-0.5 rounded text-xs font-mono bg-accent-blue/10 text-accent-blue border border-accent-blue/20">
            {r}
          </span>
        ))}
      </div>
      <p className="text-xs text-slate-500">{countries.length} jurisdiction{countries.length !== 1 ? 's' : ''}</p>
    </div>
  )
}

export default function ByEntity({ data }) {
  const entityNames = [...new Set(data.map(t => t.applicant))]
  const entities = entityNames
    .map(name => ({ name, marks: data.filter(t => t.applicant === name) }))
    .sort((a, b) => b.marks.length - a.marks.length)

  return (
    <div className="space-y-5">

      {/* Summary table */}
      <div className="bg-navy-800 border border-navy-500 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-navy-500">
          <h2 className="font-semibold text-white">Entity Summary</h2>
          <p className="text-xs text-slate-400 mt-0.5">Portfolio distribution across all subsidiaries</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-navy-600/40 bg-navy-700/30">
                {['Entity', 'Total', 'Active', 'Pending', 'Expiring', 'Opposed', 'Expired', 'Registries', 'Jurisdictions'].map((h, i) => (
                  <th key={h} className={`px-5 py-3 text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap
                    ${i === 0 ? 'text-left text-slate-400' : i <= 2 ? 'text-center text-slate-400' : 'text-center'}
                    ${h === 'Active'   ? 'text-green-400/70'  : ''}
                    ${h === 'Pending'  ? 'text-yellow-400/70' : ''}
                    ${h === 'Expiring' ? 'text-orange-400/70' : ''}
                    ${h === 'Opposed'  ? 'text-red-400/70'    : ''}
                    ${h === 'Expired'  ? 'text-slate-500'     : ''}
                  `}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entities.map(e => {
                const active   = e.marks.filter(m => m.status === 'Active').length
                const pending  = e.marks.filter(m => m.status === 'Pending').length
                const expiring = e.marks.filter(m => m.status === 'Expiring Soon').length
                const opposed  = e.marks.filter(m => m.status === 'Opposed').length
                const expired  = e.marks.filter(m => m.status === 'Expired').length
                const regs     = [...new Set(e.marks.map(m => m.registry))]
                const juris    = new Set(e.marks.map(m => m.country)).size
                return (
                  <tr key={e.name} className="border-b border-navy-600/30 hover:bg-navy-700/20 transition-colors">
                    <td className="px-5 py-3 font-medium text-white whitespace-nowrap">{e.name}</td>
                    <td className="px-5 py-3 text-center font-bold text-slate-200">{e.marks.length}</td>
                    <td className="px-5 py-3 text-center text-green-400  font-medium">{active}</td>
                    <td className="px-5 py-3 text-center text-yellow-400 font-medium">{pending  || '—'}</td>
                    <td className="px-5 py-3 text-center text-orange-400 font-medium">{expiring || '—'}</td>
                    <td className="px-5 py-3 text-center text-red-400    font-medium">{opposed  || '—'}</td>
                    <td className="px-5 py-3 text-center text-slate-400  font-medium">{expired  || '—'}</td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap gap-1">
                        {regs.map(r => (
                          <span key={r} className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-accent-blue/10 text-accent-blue border border-accent-blue/20">
                            {r}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-center text-slate-400">{juris}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Entity cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {entities.map(e => (
          <EntityCard key={e.name} entity={e.name} marks={e.marks} />
        ))}
      </div>
    </div>
  )
}
