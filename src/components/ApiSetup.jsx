import React, { useState } from 'react'
import { Key, Globe, Bell, RefreshCw, Check, Eye, EyeOff, Zap, Wifi } from 'lucide-react'

/* ── Sub-components ──────────────────────────────────────────────────────── */

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

/* ── Main component ──────────────────────────────────────────────────────── */

export default function ApiSetup() {
  const [syncFreq,    setSyncFreq]    = useState('daily')
  const [syncWindow,  setSyncWindow]  = useState('00:00 – 06:00 UTC')
  const [warnPeriod,  setWarnPeriod]  = useState('90')
  const [webhookUrl,  setWebhookUrl]  = useState('')
  const [webhookTest, setWebhookTest] = useState(null)

  function testWebhook() {
    setWebhookTest({ ok: true, time: new Date().toLocaleTimeString() })
  }

  return (
    <div className="space-y-5 max-w-4xl">

      {/* Status banner */}
      <div className="flex items-center gap-3 px-5 py-3 bg-green-500/5 border border-green-500/20 rounded-xl">
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
        </span>
        <p className="text-sm text-green-400 font-medium">All registry connections are operational</p>
        <span className="ml-auto text-xs text-slate-400">Checked: 2026-04-09 08:32 UTC</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

        {/* USPTO */}
        <Section icon={Key} title="USPTO" subtitle="United States Patent and Trademark Office" accent="#00b4d8">
          <ApiKeyInput label="API Key"   defaultValue="uspto_live_a1b2c3d4e5f6" />
          <ApiKeyInput label="Client ID" defaultValue="nexaflow_client_001" placeholder="client_id" />
          <ApiKeyInput label="Base URL"  defaultValue="https://developer.uspto.gov/trademark/v1" readOnly />
        </Section>

        {/* EUIPO */}
        <Section icon={Globe} title="EUIPO" subtitle="European Union Intellectual Property Office" accent="#a855f7">
          <ApiKeyInput label="API Key"         defaultValue="euipo_key_9g8h7i6j5k4l" />
          <ApiKeyInput label="Organisation ID" defaultValue="NEXAFLOW_EU_001" placeholder="org_id" />
          <ApiKeyInput label="Base URL"        defaultValue="https://euipo.europa.eu/copla/trademark/data" readOnly />
        </Section>

        {/* WIPO */}
        <Section icon={Wifi} title="WIPO Madrid Monitor" subtitle="World Intellectual Property Organization" accent="#00ff88">
          <ApiKeyInput label="API Token" defaultValue="wipo_token_m3n4o5p6q7r8" />
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Holder ID</label>
            <input
              type="text"
              defaultValue="NEXAFLOW-TECH-INTL"
              className="w-full px-3 py-2.5 bg-navy-700 border border-navy-500 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-accent-blue/50 transition-colors"
            />
          </div>
          <ApiKeyInput label="Base URL" defaultValue="https://www.wipo.int/madrid/monitor/en/" readOnly />
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
            <Toggle label="Renewal Alerts"   description="Notify 90, 60, and 30 days before expiry"   defaultChecked />
            <Toggle label="Opposition Notices" description="Immediate alert on new oppositions"       defaultChecked />
            <Toggle label="Status Changes"   description="Notify on any status transition"             />
            <Toggle label="New Registrations" description="Notify when marks are registered"          defaultChecked />
            <Toggle label="Weekly Digest"    description="Summary email every Monday 09:00 UTC"        defaultChecked />
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
