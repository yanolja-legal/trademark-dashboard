import React, { useState } from 'react'
import { parseISO, isValid, format } from 'date-fns'
import { Globe } from 'lucide-react'

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
