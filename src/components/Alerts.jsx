import React from 'react'
import { AlertTriangle, Clock, ShieldAlert, XCircle } from 'lucide-react'
import { differenceInDays, parseISO, format, isValid } from 'date-fns'

function fmt(str) {
  if (!str) return '—'
  try {
    const d = parseISO(str)
    return isValid(d) ? format(d, 'dd MMM yyyy') : str
  } catch { return str }
}

function Panel({ icon: Icon, title, count, accentColor, children }) {
  return (
    <div
      className="bg-navy-800 rounded-xl overflow-hidden"
      style={{ border: `1px solid ${accentColor}25` }}
    >
      <div
        className="flex items-center justify-between px-5 py-4 border-b"
        style={{ borderColor: `${accentColor}18`, backgroundColor: `${accentColor}08` }}
      >
        <div className="flex items-center gap-3">
          <Icon className="w-5 h-5" style={{ color: accentColor }} />
          <h3 className="font-semibold text-white text-sm">{title}</h3>
        </div>
        <span
          className="text-sm font-bold px-3 py-0.5 rounded-full border"
          style={{ color: accentColor, backgroundColor: `${accentColor}15`, borderColor: `${accentColor}30` }}
        >
          {count}
        </span>
      </div>
      <div className="divide-y divide-navy-600/30">
        {children}
      </div>
    </div>
  )
}

function AlertRow({ tm, right }) {
  return (
    <div className="flex items-center justify-between px-5 py-3.5 hover:bg-navy-700/25 transition-colors">
      <div className="min-w-0 mr-4">
        <p className="font-semibold text-white text-sm truncate">{tm.markName}</p>
        <p className="text-xs text-slate-400 mt-0.5 truncate">
          {tm.applicant} · {tm.registry} · {tm.country}
        </p>
      </div>
      <div className="text-right flex-shrink-0">{right}</div>
    </div>
  )
}

function Empty({ text }) {
  return <p className="px-5 py-10 text-center text-slate-500 text-sm">{text}</p>
}

export default function Alerts({ data }) {
  const today = new Date()

  const expiring90 = data
    .filter(t => {
      if (!t.expiryDate) return false
      const d = parseISO(t.expiryDate)
      const days = differenceInDays(d, today)
      return days >= 0 && days <= 90
    })
    .sort((a, b) => parseISO(a.expiryDate) - parseISO(b.expiryDate))

  const expiring180 = data
    .filter(t => {
      if (!t.expiryDate) return false
      const d = parseISO(t.expiryDate)
      const days = differenceInDays(d, today)
      return days > 90 && days <= 180
    })
    .sort((a, b) => parseISO(a.expiryDate) - parseISO(b.expiryDate))

  const opposed = data.filter(t => t.status === 'Opposed')
  const expired = data.filter(t => t.status === 'Expired')

  const longPending = data.filter(t => {
    if (t.status !== 'Pending' || !t.applicationDate) return false
    return differenceInDays(today, parseISO(t.applicationDate)) > 365
  })

  const summaryCards = [
    { label: 'Critical Renewals (≤ 90d)',    value: expiring90.length,  color: '#ef4444' },
    { label: 'Upcoming Renewals (91–180d)',   value: expiring180.length, color: '#f97316' },
    { label: 'Active Oppositions',            value: opposed.length,     color: '#a855f7' },
    { label: 'Expired Marks',                 value: expired.length,     color: '#6b7280' },
  ]

  return (
    <div className="space-y-5">

      {/* Summary row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {summaryCards.map(s => (
          <div key={s.label} className="bg-navy-800 border border-navy-500 rounded-xl p-4">
            <p className="text-xs text-slate-400 mb-1 leading-tight">{s.label}</p>
            <p className="text-3xl font-bold" style={{ color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Critical renewals */}
        <Panel icon={AlertTriangle} title="Critical Renewals — due within 90 days" count={expiring90.length} accentColor="#ef4444">
          {expiring90.length === 0
            ? <Empty text="No critical renewals due." />
            : expiring90.map(tm => {
                const days = differenceInDays(parseISO(tm.expiryDate), today)
                return (
                  <AlertRow key={tm.id} tm={tm} right={
                    <div>
                      <p className="text-xs font-mono text-red-400">{fmt(tm.expiryDate)}</p>
                      <p className="text-xs font-bold text-red-400">{days}d remaining</p>
                    </div>
                  } />
                )
              })
          }
        </Panel>

        {/* Upcoming renewals */}
        <Panel icon={Clock} title="Upcoming Renewals — 91 to 180 days" count={expiring180.length} accentColor="#f97316">
          {expiring180.length === 0
            ? <Empty text="No upcoming renewals in this window." />
            : expiring180.map(tm => {
                const days = differenceInDays(parseISO(tm.expiryDate), today)
                return (
                  <AlertRow key={tm.id} tm={tm} right={
                    <div>
                      <p className="text-xs font-mono text-orange-400">{fmt(tm.expiryDate)}</p>
                      <p className="text-xs text-orange-400">{days}d remaining</p>
                    </div>
                  } />
                )
              })
          }
        </Panel>

        {/* Oppositions */}
        <Panel icon={ShieldAlert} title="Active Oppositions" count={opposed.length} accentColor="#a855f7">
          {opposed.length === 0
            ? <Empty text="No active oppositions." />
            : opposed.map(tm => (
                <AlertRow key={tm.id} tm={tm} right={
                  <span className="px-2.5 py-1 bg-purple-500/10 border border-purple-500/20 rounded-full text-xs text-purple-400 font-medium">
                    Opposed
                  </span>
                } />
              ))
          }
        </Panel>

        {/* Expired */}
        <Panel icon={XCircle} title="Expired Marks" count={expired.length} accentColor="#6b7280">
          {expired.length === 0
            ? <Empty text="No expired marks." />
            : expired.map(tm => (
                <AlertRow key={tm.id} tm={tm} right={
                  <div>
                    <p className="text-xs font-mono text-slate-400">{fmt(tm.expiryDate)}</p>
                    <p className="text-xs text-slate-500">Expired</p>
                  </div>
                } />
              ))
          }
        </Panel>
      </div>

      {/* Long-pending */}
      {longPending.length > 0 && (
        <Panel icon={Clock} title="Long-Pending Applications (> 1 year)" count={longPending.length} accentColor="#fbbf24">
          {longPending.map(tm => {
            const days = differenceInDays(today, parseISO(tm.applicationDate))
            const years = Math.floor(days / 365)
            const rem   = days % 365
            return (
              <AlertRow key={tm.id} tm={tm} right={
                <p className="text-xs text-yellow-400 font-medium">{years}y {rem}d pending</p>
              } />
            )
          })}
        </Panel>
      )}
    </div>
  )
}
