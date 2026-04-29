import React, { useState } from 'react'
import { differenceInDays, parseISO, isValid, format } from 'date-fns'
import { AlertTriangle, Clock, Globe } from 'lucide-react'

// ── style maps ────────────────────────────────────────────────────────────────

export const STATUS_STYLES = {
  'Registered':    'bg-green-500/10 text-green-400 border-green-500/20',
  'Pending':       'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  'Opposed':       'bg-red-500/10 text-red-400 border-red-500/20',
  'Refused':       'bg-rose-500/10 text-rose-400 border-rose-500/20',
  'Lapsed':        'bg-slate-500/10 text-slate-400 border-slate-500/20',
  'Expired':       'bg-slate-500/10 text-slate-400 border-slate-500/20',
  'Expiring Soon': 'bg-orange-500/10 text-orange-400 border-orange-500/20',
}

export const REGISTRY_STYLES = {
  'WIPO Madrid' : 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  'USPTO'       : 'bg-sky-500/10 text-sky-400 border-sky-500/20',
  'IP India'    : 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  'ILPO'        : 'bg-teal-500/10 text-teal-400 border-teal-500/20',
  'KIPRIS'      : 'bg-pink-500/10 text-pink-400 border-pink-500/20',
}

export const REGISTRY_DEFAULT = 'bg-accent-blue/10 text-accent-blue border-accent-blue/20'

// ── pure helper ───────────────────────────────────────────────────────────────

export function fmt(str) {
  if (!str) return '—'
  try {
    const d = parseISO(str)
    return isValid(d) ? format(d, 'dd MMM yyyy') : str
  } catch { return str }
}

// ── badge sub-components ──────────────────────────────────────────────────────

export function ExpiryCell({ dateStr }) {
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

export function DesignatedCountriesTooltip({ countries }) {
  const [open, setOpen] = useState(false)
  if (!countries || countries.length === 0) return null
  return (
    <span className="relative inline-flex items-center ml-1.5">
      <button
        onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}       onBlur={() => setOpen(false)}
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

export function IPIndiaWarningBadge({ alert }) {
  const [open, setOpen] = useState(false)
  if (!alert) return null
  const isOpposed = alert.rawStatus === 'Opposed'
  const badgeCls  = isOpposed ? 'bg-red-500/15 text-red-400 border-red-500/30' : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
  const labelCls  = isOpposed ? 'text-red-400' : 'text-amber-400'
  const label     = isOpposed ? 'OPPOSED' : 'OBJECTED'
  return (
    <span className="relative inline-flex items-center">
      <button
        onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}       onBlur={() => setOpen(false)}
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border ${badgeCls}`}
        aria-label={alert.message}
      >
        <AlertTriangle className="w-2.5 h-2.5" />{label}
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

export function ILPOExpiryBadge({ alert }) {
  const [open, setOpen] = useState(false)
  if (!alert) return null
  const inGrace  = alert.daysLeft < 0
  const isUrgent = alert.daysLeft <= 30
  const badgeCls = inGrace || isUrgent ? 'bg-red-500/15 text-red-400 border-red-500/30' : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
  const labelCls = inGrace || isUrgent ? 'text-red-400' : 'text-amber-400'
  const label    = inGrace ? `GRACE ${alert.graceRemaining}d` : `RENEW ${alert.daysLeft}d`
  return (
    <span className="relative inline-flex items-center">
      <button
        onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}       onBlur={() => setOpen(false)}
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border ${badgeCls}`}
        aria-label={alert.message}
      >
        <AlertTriangle className="w-2.5 h-2.5" />{label}
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

export function OfficeActionBadge({ pending }) {
  const [open, setOpen] = useState(false)
  if (!pending) return null
  return (
    <span className="relative inline-flex items-center">
      <button
        onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}       onBlur={() => setOpen(false)}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border bg-orange-500/15 text-orange-400 border-orange-500/30"
        aria-label="Pending office action"
      >
        <AlertTriangle className="w-2.5 h-2.5" />OA
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

export function ExpiryFlagBadge({ expiryDate, registry, status }) {
  const [open, setOpen] = useState(false)
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
  const badgeCls   = isCritical ? 'bg-red-500/15 text-red-400 border-red-500/30' : 'bg-orange-500/15 text-orange-400 border-orange-500/30'
  const label      = days !== null ? `EXPIRING ${days}d` : 'EXPIRING'
  return (
    <span className="relative inline-flex items-center">
      <button
        onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}       onBlur={() => setOpen(false)}
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border ${badgeCls}`}
        aria-label="Expiring within 90 days"
      >
        <Clock className="w-2.5 h-2.5" />{label}
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
