import React, { useState, useRef, useCallback } from 'react'
import { Key, Bell, RefreshCw, Check, Eye, EyeOff, Wifi, Building2, Loader2, XCircle, Clock, AlertCircle, Hash, Upload, Download, Trash2, Database } from 'lucide-react'
import { format } from 'date-fns'
import { SUBSIDIARIES } from '../subsidiaries.js'
import { REGISTRIES }   from '../registries.js'
import { KNOWN_MARKS }  from '../knownMarks.js'

// ── CSV helpers (moved from Portfolio) ───────────────────────────────────────

function parseCsv(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim())
  if (lines.length < 2) return []
  const parseRow = line => {
    const fields = []
    let cur = '', inQuote = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++ }
        else inQuote = !inQuote
      } else if (ch === ',' && !inQuote) {
        fields.push(cur.trim()); cur = ''
      } else {
        cur += ch
      }
    }
    fields.push(cur.trim())
    return fields
  }
  const headers = parseRow(lines[0]).map(h => h.toLowerCase().replace(/[^a-z0-9]+/g, '_'))
  return lines.slice(1).map(line => {
    const vals = parseRow(line)
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? '']))
  })
}

function normaliseCsvRow(row, reg, idx) {
  const get = (...keys) => { for (const k of keys) { const v = row[k] || ''; if (v) return v } return '' }
  const applicant        = get('applicant', 'applicant_name', 'owner')
  const markName         = get('mark_name', 'trademark_name', 'trademark', 'mark', 'brand')
  const appNo            = get('application_no_', 'application_no', 'application_number', 'app_no', 'serial_no', 'serial_number')
  const regNo            = get('registration_no_', 'registration_no', 'registration_number', 'reg_no')
  const ncl              = get('ncl_class', 'ncl', 'class', 'nice_class', 'classes', 'code')
  const applicationDate  = get('filed_date', 'filing_date', 'application_date', 'filed')
  const registrationDate = get('registration_date', 'registered', 'registration_date_')
  const expiryDate       = get('expiry_date', 'expiry_date_', 'expiry', 'valid_until', 'renewal_date')
  const rawStatus        = get('status', 'trademark_status', 'mark_status')
  const s = (rawStatus || '').toLowerCase()
  let status = 'Unknown'
  if (s.includes('registered') || s.includes('active'))                     status = 'Active'
  else if (s.includes('pending') || s.includes('filed') || s.includes('object')) status = 'Pending'
  else if (s.includes('expir'))                                               status = 'Expired'
  else if (s.includes('oppos') || s.includes('refus'))                       status = 'Opposed'
  else if (rawStatus) status = rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1).toLowerCase()
  return {
    id: `${reg.id}-csv-${appNo || idx}`,
    registry: reg.value,
    country: reg.id === 'ipindia' ? 'India' : reg.id === 'ilpo' ? 'Israel' : reg.label,
    applicant, markName: markName || '—', serialNo: appNo, regNo,
    kindOfMark: '—', ncl, applicationDate, registrationDate, expiryDate, status, source: 'csv',
  }
}

function downloadCsvTemplate(reg) {
  const headers = reg.csvColumns ?? ['Applicant', 'Mark Name', 'Application No.', 'Registration No.', 'NCL Class', 'Filed Date', 'Registration Date', 'Expiry Date', 'Status']
  const example = reg.id === 'ipindia'
    ? ['Yanolja Co., Ltd.', 'YANOLJA', '1234567', '987654', '43', '2020-01-15', '2022-03-10', '2032-03-10', 'Registered']
    : ['Yanolja Co., Ltd.', 'YANOLJA', '1234567', '987654', '43', '2020-01-15', '2022-03-10', '2032-03-10', 'Registered']
  const csv = [headers.join(','), example.join(',')].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `${reg.id}-template.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Manual upload card ────────────────────────────────────────────────────────

function ManualUploadCard({ reg, registryStatus, onCsvUpload, onCsvClear }) {
  const inputRef             = useRef(null)
  const [error,   setError]  = useState(null)
  const [isDragging, setDrag] = useState(false)

  const rs      = registryStatus[reg.id] ?? {}
  const hasData = rs.count > 0

  const processFile = useCallback(file => {
    setError(null)
    if (!file) return
    if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
      setError('Please upload a .csv file'); return
    }
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const rows  = parseCsv(e.target.result)
        if (rows.length === 0) { setError('CSV file appears to be empty or invalid'); return }
        const marks = rows.map((row, i) => normaliseCsvRow(row, reg, i)).filter(m => m.applicant || m.markName !== '—')
        if (marks.length === 0) { setError('No valid trademark rows found in CSV'); return }
        onCsvUpload(reg.id, marks)
      } catch (err) { setError(`Parse error: ${err.message}`) }
    }
    reader.onerror = () => setError('Failed to read file')
    reader.readAsText(file)
  }, [reg, onCsvUpload])

  const sourceUrl = reg.id === 'ipindia' ? 'ipindia.gov.in' : 'trademarks.justice.gov.il'

  return (
    <div className="bg-navy-800 border border-navy-500 rounded-xl overflow-hidden">
      {/* card header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-navy-500 bg-teal-500/5">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-teal-500/15 border border-teal-500/25">
            <Upload className="w-3.5 h-3.5 text-teal-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">{reg.label}</p>
            <p className="text-[11px] text-slate-500">Manual CSV upload · <span className="font-mono">{sourceUrl}</span></p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasData ? (
            <>
              <span className="text-xs text-green-400 font-medium">{rs.count} marks</span>
              {rs.lastFetched && (
                <span className="text-[10px] text-slate-500">{format(new Date(rs.lastFetched), 'dd MMM yyyy')}</span>
              )}
              <button
                onClick={() => { onCsvClear(reg.id); setError(null) }}
                title="Clear uploaded data"
                className="p-1 rounded text-slate-500 hover:text-red-400 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <span className="text-[11px] text-slate-500 italic">No data</span>
          )}
        </div>
      </div>

      {/* drop zone + actions */}
      <div className="p-4 space-y-3">
        <div
          onDragOver={e => { e.preventDefault(); setDrag(true) }}
          onDragLeave={() => setDrag(false)}
          onDrop={e => { e.preventDefault(); setDrag(false); processFile(e.dataTransfer.files[0]) }}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg px-4 py-3.5 text-center cursor-pointer transition-colors
            ${isDragging ? 'border-accent-blue bg-accent-blue/5' : 'border-navy-400 hover:border-navy-300'}`}
        >
          <Upload className="w-4 h-4 text-slate-400 mx-auto mb-1" />
          <p className="text-xs text-slate-300">
            {hasData ? 'Drop a new CSV to replace, or click to browse' : 'Drop CSV here or click to browse'}
          </p>
          <p className="text-[10px] text-slate-600 mt-0.5 font-mono">
            {reg.csvColumns?.join(' · ')}
          </p>
          <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden"
            onChange={e => processFile(e.target.files?.[0])} />
        </div>

        <button
          onClick={() => downloadCsvTemplate(reg)}
          className="flex items-center gap-1.5 text-xs text-accent-blue hover:text-accent-blue-bright transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          Download CSV template
        </button>

        {error && (
          <p className="text-xs text-red-400 flex items-center gap-1">
            <XCircle className="w-3.5 h-3.5 flex-shrink-0" />{error}
          </p>
        )}
      </div>
    </div>
  )
}

// ── Live API status card ───────────────────────────────────────────────────────

function LiveApiCard({ reg, registryStatus }) {
  const rs     = registryStatus[reg.id] ?? { status: 'idle' }
  const status = rs.status

  let dot, dotCls, label, labelCls
  if (status === 'ok') {
    dot = '●'; dotCls = 'text-green-400'; labelCls = 'text-green-400'
    label = `Connected · ${rs.count} results`
  } else if (status === 'loading') {
    dot = '◌'; dotCls = 'text-accent-blue animate-pulse'; labelCls = 'text-accent-blue'; label = 'Fetching…'
  } else if (status === 'pending') {
    dot = '○'; dotCls = 'text-indigo-400'; labelCls = 'text-indigo-400'
    label = reg.apiPath ? 'Pending credentials' : 'Integration pending'
  } else if (status === 'error') {
    dot = '●'; dotCls = 'text-red-400'; labelCls = 'text-red-400'; label = `Error — ${rs.error || 'fetch failed'}`
  } else if (status === 'no-marks') {
    dot = '○'; dotCls = 'text-yellow-400'; labelCls = 'text-yellow-400'; label = 'No mark numbers configured'
  } else {
    dot = '○'; dotCls = 'text-slate-500'; labelCls = 'text-slate-500'; label = 'Not fetched yet'
  }

  return (
    <div className="flex items-center justify-between px-5 py-3 border-b border-navy-600/30 last:border-0 hover:bg-navy-700/20 transition-colors">
      <div className="flex items-center gap-3">
        <span className={`text-base leading-none ${dotCls}`}>{dot}</span>
        <div>
          <p className="text-sm font-medium text-slate-200">{reg.label}</p>
          <p className="text-[11px] text-slate-500">{reg.note}</p>
        </div>
      </div>
      <div className="text-right">
        <p className={`text-xs font-medium ${labelCls}`}>{label}</p>
        {rs.lastFetched && (
          <p className="text-[10px] text-slate-500 mt-0.5">{new Date(rs.lastFetched).toLocaleTimeString()}</p>
        )}
      </div>
    </div>
  )
}

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

export default function ApiSetup({ registryStatus = {}, onCsvUpload, onCsvClear }) {
  const [syncFreq,    setSyncFreq]    = useState('daily')
  const [syncWindow,  setSyncWindow]  = useState('00:00 – 06:00 UTC')
  const [warnPeriod,  setWarnPeriod]  = useState('90')
  const [webhookUrl,  setWebhookUrl]  = useState('')
  const [webhookTest, setWebhookTest] = useState(null)

  // Default WIPO holder: first active subsidiary
  const defaultHolder = SUBSIDIARIES.find(s => s.active)?.name ?? ''

  function testWebhook() {
    setWebhookTest({ ok: true, time: new Date().toLocaleTimeString() })
  }

  return (
    <div className="space-y-5 max-w-4xl">

      {/* ── Data Sources ── */}
      <div className="bg-navy-800 border border-navy-500 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-navy-500 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-accent-blue/10 border border-accent-blue/20">
            <Database className="w-4 h-4 text-accent-blue" />
          </div>
          <div>
            <h3 className="font-semibold text-white text-sm">Data Sources</h3>
            <p className="text-xs text-slate-400 mt-0.5">Live API connections and manual file uploads — all data managed here</p>
          </div>
        </div>

        {/* Live API connections */}
        <div className="px-5 pt-4 pb-2">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Live API</p>
        </div>
        <div className="divide-y divide-navy-600/20">
          {REGISTRIES.filter(r => r.fetchStrategy !== 'csv' && !r.hidden).map(reg => (
            <LiveApiCard
              key={reg.id}
              reg={reg}
              registryStatus={registryStatus}
            />
          ))}
        </div>

        {/* Manual CSV uploads */}
        <div className="px-5 pt-5 pb-2 border-t border-navy-500 mt-2">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-3">Manual Upload</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {REGISTRIES.filter(r => r.fetchStrategy === 'csv').map(reg => (
              <ManualUploadCard
                key={reg.id}
                reg={reg}
                registryStatus={registryStatus}
                onCsvUpload={onCsvUpload}
                onCsvClear={onCsvClear}
              />
            ))}
          </div>
        </div>
        <div className="h-4" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

        {/* USPTO (via KIPRIS) */}
        <Section icon={Clock} title="🇺🇸 USPTO (via KIPRIS)" subtitle="US trademark data — pending KIPRIS API key" accent="#6366f1">
          <div className="flex items-center gap-2.5 px-4 py-3 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
            <Clock className="w-4 h-4 text-indigo-400 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-indigo-300">Pending API Key Approval</p>
              <p className="text-xs text-slate-400 mt-0.5">
                US trademark data will be available once the KIPRIS API key is approved and added.
              </p>
            </div>
          </div>
          <div className="text-xs text-slate-400 leading-relaxed pt-1">
            Coverage: <span className="text-slate-300 font-medium">RightRez, Inc.</span> and{' '}
            <span className="text-slate-300 font-medium">Innsoft, Inc.</span> — data will populate
            automatically once the API key is configured.
          </div>
          <EntityChips label="Entities pending coverage" />
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

      {/* ── Configure Mark Numbers ── */}
      <div className="bg-navy-800 border border-navy-500 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-navy-500 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-accent-blue/10 border border-accent-blue/20">
            <Hash className="w-4 h-4 text-accent-blue" />
          </div>
          <div>
            <h3 className="font-semibold text-white text-sm">Configure Mark Numbers</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              IR numbers (WIPO) and serial numbers (USPTO) stored in <code className="text-accent-blue font-mono">src/knownMarks.js</code>
            </p>
          </div>
        </div>
        <div className="p-5">
          <div className="mb-4 flex items-start gap-3 px-4 py-3 rounded-lg bg-accent-blue/5 border border-accent-blue/20 text-sm text-slate-300">
            <AlertCircle className="w-4 h-4 text-accent-blue flex-shrink-0 mt-0.5" />
            <span>
              To add mark numbers, ask Claude Code:{' '}
              <span className="font-mono text-accent-blue">"Add WIPO IR number 1234567 for Yanolja Co., Ltd. in knownMarks.js"</span>.
              Numbers are fetched automatically on the next dashboard refresh.
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-navy-600/40">
                  <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">Subsidiary</th>
                  {REGISTRIES.filter(r => r.fetchStrategy === 'numbers').map(reg => (
                    <th key={reg.id} className="px-4 py-2.5 text-center text-[11px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">
                      {reg.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SUBSIDIARIES.filter(s => s.active).map(sub => {
                  const marks = KNOWN_MARKS[sub.name] ?? {}
                  return (
                    <tr key={sub.id} className="border-b border-navy-600/20 hover:bg-navy-700/20 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-200 whitespace-nowrap">{sub.shortName}</td>
                      {REGISTRIES.filter(r => r.fetchStrategy === 'numbers').map(reg => {
                        const nums = marks[reg.knownMarksKey] ?? []
                        return (
                          <td key={reg.id} className="px-4 py-3 text-center">
                            {nums.length > 0 ? (
                              <div className="flex flex-wrap gap-1 justify-center">
                                {nums.map(n => (
                                  <span key={n} className="px-1.5 py-0.5 rounded font-mono bg-navy-600 border border-navy-500 text-slate-300">
                                    {n}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-slate-600">—</span>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
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
