import React, { useState } from 'react'
import { Key, Globe, Bell, RefreshCw, Check, Eye, EyeOff, Zap, Wifi, Building2, Loader2, CheckCircle2, XCircle, Clock, AlertCircle } from 'lucide-react'
import { SUBSIDIARIES } from '../subsidiaries.js'
import { REGISTRIES }   from '../registries.js'

// ── Entity chips ─────────────────────────────────────────────────────────────
// Renders the full subsidiary list as read-only chips.
// Adding a new entry to SUBSIDIARIES automatically appears here.

function EntityChips({ label = 'Covered entities' }) {
  const active = SUBSIDIARIES.filter(s => s.active)
  return (
    <div>
      <p className="text-xs font-medium text-slate-400 mb-2">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {active.map(s => (
          <span
            key={s.id}
            title={s.name}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-navy-700 border border-navy-500 text-slate-300"
          >
            <Building2 className="w-2.5 h-2.5 text-slate-500 flex-shrink-0" />
            {s.shortName}
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({ icon: Icon, title, subtitle, accent, children }) {
  return (
    <div className="bg-navy-800 border border-navy-500 rounded-xl overflow-hidden">
      <div
        className="flex items-center gap-3 px-5 py-4 border-b border-navy-500"
        style={{ backgroundColor: `${accent}07` }}
      >
        <div className="p-2 rounded-lg" style={{ backgroundColor: `${accent}18`, border: `1px solid ${accent}28` }}>
          <Icon className="w-4 h-4" style={{ color: accent }} />
        </div>
        <div>
          <h3 className="font-semibold text-white text-sm">{title}</h3>
          <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>
        </div>
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </div>
  )
}

function ApiKeyInput({ label, defaultValue = '', placeholder = '••••••••••••••••', readOnly = false }) {
  const [show,  setShow]  = useState(false)
  const [saved, setSaved] = useState(false)
  const [value, setValue] = useState(defaultValue)

  function save() { setSaved(true); setTimeout(() => setSaved(false), 2000) }

  return (
    <div>
      <label className="block text-xs font-medium text-slate-400 mb-1.5">{label}</label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type={show || readOnly ? 'text' : 'password'}
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder={placeholder}
            readOnly={readOnly}
            className={`w-full pr-10 pl-3 py-2.5 bg-navy-700 border border-navy-500 rounded-lg text-sm placeholder-slate-500 focus:outline-none focus:border-accent-blue/50 font-mono transition-colors
              ${readOnly ? 'text-slate-400 cursor-default' : 'text-slate-200'}`}
          />
          {!readOnly && (
            <button
              onClick={() => setShow(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors"
            >
              {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          )}
        </div>
        {!readOnly && (
          <button
            onClick={save}
            className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all whitespace-nowrap
              ${saved
                ? 'bg-green-500/10 border-green-500/30 text-green-400'
                : 'bg-accent-blue/10 border-accent-blue/30 text-accent-blue hover:bg-accent-blue/20'
              }`}
          >
            {saved ? <Check className="w-4 h-4" /> : 'Save'}
          </button>
        )}
      </div>
    </div>
  )
}

function Toggle({ label, description, defaultChecked = false }) {
  const [on, setOn] = useState(defaultChecked)
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm text-slate-200">{label}</p>
        {description && <p className="text-xs text-slate-400 mt-0.5">{description}</p>}
      </div>
      <button
        onClick={() => setOn(v => !v)}
        className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${on ? 'bg-accent-blue' : 'bg-navy-500'}`}
        aria-label={label}
      >
        <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ApiSetup({ registryStatus = {} }) {
  const [syncFreq,    setSyncFreq]    = useState('daily')
  const [syncWindow,  setSyncWindow]  = useState('00:00 – 06:00 UTC')
  const [warnPeriod,  setWarnPeriod]  = useState('90')
  const [webhookUrl,  setWebhookUrl]  = useState('')
  const [webhookTest, setWebhookTest] = useState(null)

  // EUIPO connection test state
  const [euipoTest,   setEuipoTest]   = useState(null)    // null | 'loading' | { ok, label, detail }
  const [euipoTested, setEuipoTested] = useState(false)

  // Default WIPO holder: first active subsidiary
  const defaultHolder = SUBSIDIARIES.find(s => s.active)?.name ?? ''

  function testWebhook() {
    setWebhookTest({ ok: true, time: new Date().toLocaleTimeString() })
  }

  async function testEuipo() {
    setEuipoTest('loading')
    setEuipoTested(false)
    try {
      // Use a minimal holder query — if pending, credentials are missing; if error, auth failed
      const res  = await fetch('/api/euipo-search?holder=test')
      const json = await res.json()
      if (json.status === 'pending') {
        setEuipoTest({ ok: false, label: 'Pending credentials', detail: json.message })
      } else if (!res.ok) {
        setEuipoTest({ ok: false, label: 'Connection failed', detail: json.error || `HTTP ${res.status}` })
      } else {
        const env = json.isSandbox ? 'Sandbox' : 'Production'
        setEuipoTest({ ok: true, label: `Connected (${env})`, detail: `EUIPO ${env} API is reachable` })
      }
    } catch (err) {
      setEuipoTest({ ok: false, label: 'Network error', detail: err.message })
    } finally {
      setEuipoTested(true)
    }
  }

  return (
    <div className="space-y-5 max-w-4xl">

      {/* ── Registry Status Panel ── */}
      <div className="bg-navy-800 border border-navy-500 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-navy-500">
          <h3 className="font-semibold text-white text-sm">Registry Connection Status</h3>
          <p className="text-xs text-slate-400 mt-0.5">Live status from last dashboard refresh</p>
        </div>
        <div className="divide-y divide-navy-600/30">
          {REGISTRIES.map(reg => {
            const rs      = registryStatus[reg.id] ?? { status: 'idle' }
            const status  = rs.status
            const isOk      = status === 'ok'
            const isLoading = status === 'loading'
            const isPending = status === 'pending'
            const isError   = status === 'error'
            const isIdle    = status === 'idle'

            let icon, iconCls, labelCls, statusLabel

            if (isLoading) {
              icon = <Loader2 className="w-4 h-4 animate-spin" />
              iconCls  = 'text-accent-blue'
              labelCls = 'text-accent-blue'
              statusLabel = 'Fetching…'
            } else if (isOk) {
              icon = <CheckCircle2 className="w-4 h-4" />
              iconCls  = 'text-green-400'
              labelCls = 'text-green-400'
              const isSandbox = rs.lastFetched && reg.id === 'euipo'
              statusLabel = `Connected${!reg.requiresKey ? ' (no key needed)' : ''} · ${rs.count} results`
            } else if (isPending) {
              icon = <Clock className="w-4 h-4" />
              iconCls  = 'text-indigo-400'
              labelCls = 'text-indigo-400'
              statusLabel = reg.apiPath ? 'Pending credentials' : 'Not yet implemented'
            } else if (isError) {
              icon = <XCircle className="w-4 h-4" />
              iconCls  = 'text-red-400'
              labelCls = 'text-red-400'
              statusLabel = `Error — ${rs.error || 'fetch failed'}`
            } else {
              icon = <AlertCircle className="w-4 h-4" />
              iconCls  = 'text-slate-500'
              labelCls = 'text-slate-500'
              statusLabel = 'Not fetched yet'
            }

            return (
              <div key={reg.id} className="flex items-center justify-between px-5 py-3 hover:bg-navy-700/20 transition-colors">
                <div className="flex items-center gap-3">
                  <span className={iconCls}>{icon}</span>
                  <div>
                    <p className="text-sm font-medium text-slate-200">{reg.label}</p>
                    <p className="text-xs text-slate-500">{reg.note}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-xs font-medium ${labelCls}`}>{statusLabel}</p>
                  {rs.lastFetched && (
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      {new Date(rs.lastFetched).toLocaleTimeString()}
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

        {/* USPTO */}
        <Section icon={Key} title="USPTO" subtitle="United States Patent and Trademark Office" accent="#00b4d8">
          <ApiKeyInput label="API Key"   defaultValue="uspto_live_a1b2c3d4e5f6" />
          <ApiKeyInput label="Client ID" defaultValue="yanolja_client_001" placeholder="client_id" />
          <ApiKeyInput label="Base URL"  defaultValue="https://developer.uspto.gov/trademark/v1" readOnly />
          <EntityChips />
        </Section>

        {/* EUIPO */}
        <Section icon={Globe} title="EUIPO" subtitle="European Union Intellectual Property Office — OAuth2 client credentials" accent="#a855f7">
          <ApiKeyInput label="Client ID"     defaultValue="$EUIPO_CLIENT_ID"     placeholder="OAuth2 client_id"     readOnly />
          <ApiKeyInput label="Client Secret" defaultValue="$EUIPO_CLIENT_SECRET" placeholder="OAuth2 client_secret" readOnly />
          <div>
            <p className="text-xs font-medium text-slate-400 mb-1.5">Environment</p>
            <div className="flex items-center gap-2 px-3 py-2 bg-navy-700 border border-navy-500 rounded-lg">
              <span className="font-mono text-sm text-slate-300">EUIPO_ENV</span>
              <span className="text-slate-500 text-xs mx-1">=</span>
              <span className="font-mono text-sm text-indigo-400">sandbox</span>
              <span className="ml-auto text-xs text-slate-500">set to <code className="text-indigo-400">production</code> to use live API</span>
            </div>
          </div>
          <ApiKeyInput label="Token URL" defaultValue="https://euipo.europa.eu/idm2/oauth/token" readOnly />
          <ApiKeyInput label="API Base"  defaultValue="https://euipo.europa.eu/copla/trademark/data/v1" readOnly />

          {/* Test connection button */}
          <div>
            <button
              onClick={testEuipo}
              disabled={euipoTest === 'loading'}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-indigo-500/10 border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/20"
            >
              {euipoTest === 'loading'
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Testing…</>
                : <><Wifi className="w-4 h-4" /> Test EUIPO Connection</>
              }
            </button>
            {euipoTested && euipoTest && euipoTest !== 'loading' && (
              <p className={`text-xs mt-2 flex items-center gap-1.5 ${euipoTest.ok ? 'text-green-400' : euipoTest.label === 'Pending credentials' ? 'text-indigo-400' : 'text-red-400'}`}>
                {euipoTest.ok
                  ? <Check className="w-3.5 h-3.5" />
                  : euipoTest.label === 'Pending credentials'
                    ? <span className="w-3.5 h-3.5 inline-flex items-center justify-center text-[10px]">⏳</span>
                    : <span className="w-3.5 h-3.5 inline-flex items-center justify-center">✕</span>
                }
                <span className="font-medium">{euipoTest.label}</span>
                {euipoTest.detail && <span className="text-slate-500"> — {euipoTest.detail}</span>}
              </p>
            )}
          </div>

          <EntityChips />
        </Section>

        {/* WIPO */}
        <Section icon={Wifi} title="WIPO Madrid Monitor" subtitle="World Intellectual Property Organization — public API, no auth required" accent="#00ff88">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Holder Name <span className="text-slate-500 font-normal">(used in live search)</span>
            </label>
            <select
              defaultValue={defaultHolder}
              className="w-full px-3 py-2.5 bg-navy-700 border border-navy-500 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-accent-blue/50 transition-colors"
            >
              <option value="">— select a subsidiary —</option>
              {SUBSIDIARIES.filter(s => s.active).map(s => (
                <option key={s.id} value={s.name}>{s.name}</option>
              ))}
            </select>
          </div>
          <ApiKeyInput label="Base URL" defaultValue="https://www.wipo.int/madrid/monitor/api/v1" readOnly />
          <EntityChips label="Searchable entities" />
        </Section>

        {/* Notifications */}
        <Section icon={Bell} title="Notifications & Webhooks" subtitle="Alerts, webhooks, and event triggers" accent="#fbbf24">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Webhook URL</label>
            <div className="flex gap-2">
              <input
                type="url"
                value={webhookUrl}
                onChange={e => setWebhookUrl(e.target.value)}
                placeholder="https://your-app.com/webhook/trademark"
                className="flex-1 px-3 py-2.5 bg-navy-700 border border-navy-500 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-accent-blue/50 transition-colors"
              />
              <button
                onClick={testWebhook}
                className="flex items-center gap-1.5 px-3 py-2 bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 rounded-lg text-sm hover:bg-yellow-500/20 transition-colors whitespace-nowrap"
              >
                <Zap className="w-3.5 h-3.5" />
                Test
              </button>
            </div>
            {webhookTest && (
              <p className="text-xs text-green-400 mt-1.5 flex items-center gap-1">
                <Check className="w-3.5 h-3.5" />
                Webhook OK at {webhookTest.time}
              </p>
            )}
          </div>
          <div className="space-y-3 pt-1">
            <Toggle label="Renewal Alerts"    description="Notify 90, 60, and 30 days before expiry"  defaultChecked />
            <Toggle label="Opposition Notices" description="Immediate alert on new oppositions"       defaultChecked />
            <Toggle label="Status Changes"    description="Notify on any status transition"            />
            <Toggle label="New Registrations" description="Notify when marks are registered"          defaultChecked />
            <Toggle label="Weekly Digest"     description="Summary email every Monday 09:00 UTC"      defaultChecked />
          </div>
        </Section>
      </div>

      {/* Sync settings */}
      <div className="bg-navy-800 border border-navy-500 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <RefreshCw className="w-4 h-4 text-accent-blue" />
          <h3 className="font-semibold text-white">Sync Settings</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Sync Frequency</label>
            <select
              value={syncFreq}
              onChange={e => setSyncFreq(e.target.value)}
              className="w-full px-3 py-2.5 bg-navy-700 border border-navy-500 rounded-lg text-sm text-slate-200 focus:outline-none"
            >
              <option value="hourly">Every hour</option>
              <option value="6h">Every 6 hours</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="manual">Manual only</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Sync Window (UTC)</label>
            <select
              value={syncWindow}
              onChange={e => setSyncWindow(e.target.value)}
              className="w-full px-3 py-2.5 bg-navy-700 border border-navy-500 rounded-lg text-sm text-slate-200 focus:outline-none"
            >
              {['00:00 – 06:00 UTC', '06:00 – 12:00 UTC', '12:00 – 18:00 UTC', '18:00 – 00:00 UTC'].map(w => (
                <option key={w}>{w}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Renewal Warning Period</label>
            <select
              value={warnPeriod}
              onChange={e => setWarnPeriod(e.target.value)}
              className="w-full px-3 py-2.5 bg-navy-700 border border-navy-500 rounded-lg text-sm text-slate-200 focus:outline-none"
            >
              <option value="90">90 days</option>
              <option value="180">180 days</option>
              <option value="365">365 days</option>
            </select>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button className="flex items-center gap-2 px-5 py-2.5 bg-accent-blue text-navy-900 font-semibold text-sm rounded-lg hover:bg-accent-blue-bright transition-colors">
            <Check className="w-4 h-4" />
            Save Settings
          </button>
        </div>
      </div>
    </div>
  )
}
