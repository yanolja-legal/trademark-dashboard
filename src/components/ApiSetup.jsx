import React, { useState, useRef } from 'react'
import { Key, Bell, RefreshCw, Check, Eye, EyeOff, Wifi, Building2, XCircle, Clock, AlertCircle, Hash, Upload, Download, Trash2, Database, Plus, Zap, FileText } from 'lucide-react'
import { format } from 'date-fns'
import { SUBSIDIARIES } from '../subsidiaries.js'
import { REGISTRIES }   from '../registries.js'
import { KNOWN_MARKS }  from '../knownMarks.js'

// ── CSV helpers ───────────────────────────────────────────────────────────────

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

// Universal normalisation — reads Country of Filing and Registry from CSV columns.
// Falls back to uploadMeta.label if those columns are blank.
function normaliseCsvRow(row, uploadMeta, idx) {
  const get = (...keys) => { for (const k of keys) { const v = row[k] || ''; if (v) return v } return '' }
  const applicant        = get('applicant')
  const markName         = get('mark_name', 'trademark_name', 'trademark', 'mark', 'brand')
  const appNo            = get('application_no_', 'application_no', 'serial_no', 'serial_number', 'app_no')
  const regNo            = get('registration_no_', 'registration_no', 'reg_no')
  const kindOfMark       = get('kind_of_mark', 'kind', 'mark_type')
  const ncl              = get('ncl_class', 'ncl', 'class', 'nice_class')
  const country          = get('country_of_filing', 'country') || uploadMeta.label
  const registry         = get('registry') || uploadMeta.label
  const applicationDate  = get('filed_date', 'filing_date', 'application_date')
  const publicationDate  = get('publication_date', 'pub_date')
  const registrationDate = get('registration_date', 'registered')
  const expiryDate       = get('expiry_date', 'expiry', 'valid_until', 'renewal_date')
  const rawStatus        = get('current_status', 'status', 'trademark_status')
  const s = (rawStatus || '').toLowerCase()
  let status = 'Unknown'
  if (s.includes('registered') || s.includes('active'))                           status = 'Active'
  else if (s.includes('pending') || s.includes('filed') || s.includes('object'))  status = 'Pending'
  else if (s.includes('expir'))                                                    status = 'Expired'
  else if (s.includes('oppos') || s.includes('refus'))                            status = 'Opposed'
  else if (rawStatus) status = rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1).toLowerCase()
  return {
    id:               `csv-${uploadMeta.id}-${appNo || idx}`,
    uploadId:         uploadMeta.id,
    uploadLabel:      uploadMeta.label,
    registry,
    country,
    applicant,
    markName:         markName || '—',
    serialNo:         appNo,
    regNo,
    kindOfMark:       kindOfMark || '—',
    ncl,
    applicationDate,
    publicationDate,
    registrationDate,
    expiryDate,
    status,
    source:           'csv',
  }
}

// Download a pre-formatted 13-column template with 2 example rows.
function downloadCsvTemplate() {
  const headers = [
    'Applicant', 'Mark Name', 'Application No.', 'Registration No.', 'Kind of Mark',
    'NCL Class', 'Country of Filing', 'Registry', 'Filed Date', 'Publication Date',
    'Registration Date', 'Expiry Date', 'Current Status',
  ]
  const ex1 = [
    'Yanolja Co., Ltd.', 'YANOLJA', 'APP-2022-001234', 'REG-2023-005678', 'Word',
    '9, 42', 'India', 'IP India', '2022-03-15', '2022-09-20',
    '2023-01-10', '2033-01-10', 'Active',
  ]
  const ex2 = [
    'Yanolja Co., Ltd.', 'YANOLJA & Device', 'APP-2022-001235', '', 'Device',
    '9, 35, 42', 'India', 'IP India', '2022-06-20', '',
    '', '', 'Pending',
  ]
  const csv  = [headers, ex1, ex2].map(row => row.map(v => `"${v}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = 'trademark_upload_template.csv'
  a.click()
  URL.revokeObjectURL(url)
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

// ── Live API status row ───────────────────────────────────────────────────────

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

// ── Upload Manager ────────────────────────────────────────────────────────────

function UploadManager({ csvUploads, onCsvUpload, onCsvClear }) {
  const [showForm,   setShowForm]   = useState(false)
  const [label,      setLabel]      = useState('')
  const [file,       setFile]       = useState(null)
  const [error,      setError]      = useState(null)
  const [processing, setProcessing] = useState(false)
  const fileRef = useRef(null)

  function reset() {
    setShowForm(false); setLabel(''); setFile(null); setError(null); setProcessing(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  function handleUpload() {
    if (!label.trim()) { setError('Please enter a Country / Registry name'); return }
    if (!file)          { setError('Please select a file'); return }
    setProcessing(true); setError(null)

    const uploadMeta = { id: generateId(), label: label.trim(), filename: file.name }

    const finish = (rows) => {
      if (!rows.length) {
        setError('File appears empty or unparseable — check that it has at least one data row')
        setProcessing(false); return
      }
      const marks = rows.map((r, i) => normaliseCsvRow(r, uploadMeta, i))
                        .filter(m => m.applicant || m.markName !== '—')
      if (!marks.length) {
        setError('No valid trademark rows found — column headers must match the template (download it above)')
        setProcessing(false); return
      }
      onCsvUpload(uploadMeta, marks)
      reset()
    }

    if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      file.arrayBuffer().then(async buf => {
        try {
          const XLSX = await import('xlsx')
          const wb   = XLSX.read(buf, { type: 'array' })
          const ws   = wb.Sheets[wb.SheetNames[0]]
          finish(parseCsv(XLSX.utils.sheet_to_csv(ws)))
        } catch {
          setError('XLSX parse failed — export as CSV from Excel (File → Save As → CSV) and re-upload')
          setProcessing(false)
        }
      }).catch(() => { setError('Failed to read file'); setProcessing(false) })
    } else {
      const reader = new FileReader()
      reader.onload  = e => {
        try { finish(parseCsv(e.target.result)) }
        catch (err) { setError(`Parse error: ${err.message}`); setProcessing(false) }
      }
      reader.onerror = () => { setError('Failed to read file'); setProcessing(false) }
      reader.readAsText(file)
    }
  }

  return (
    <div className="space-y-3">

      {/* Uploaded files list */}
      {csvUploads.length > 0 && (
        <div className="rounded-lg border border-navy-500 overflow-hidden divide-y divide-navy-600/40">
          {csvUploads.map(u => (
            <div key={u.id} className="flex items-center gap-3 px-4 py-3 bg-navy-700/30 hover:bg-navy-700/50 transition-colors">
              <FileText className="w-4 h-4 text-teal-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{u.label}</p>
                <p className="text-xs text-slate-500 truncate">
                  {u.filename} · {u.count} record{u.count !== 1 ? 's' : ''} · uploaded {format(new Date(u.uploadedAt), 'dd MMM yyyy HH:mm')}
                </p>
              </div>
              <button
                onClick={() => onCsvClear(u.id)}
                title="Remove this upload"
                className="p-1.5 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors flex-shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {csvUploads.length === 0 && !showForm && (
        <p className="text-xs text-slate-500 italic py-1">No files uploaded yet.</p>
      )}

      {/* Add New Upload inline form */}
      {showForm && (
        <div className="rounded-lg border border-navy-400 bg-navy-700/30 p-4 space-y-3">
          <p className="text-sm font-semibold text-white">Add New Upload</p>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Country / Registry name</label>
            <input
              type="text"
              value={label}
              onChange={e => setLabel(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleUpload()}
              placeholder='e.g. "India — IP India" · "Israel — ILPO" · "China — CNIPA" · "Japan — JPO"'
              className="w-full px-3 py-2.5 bg-navy-700 border border-navy-500 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-accent-blue/50 transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">File (.csv or .xlsx)</label>
            <div
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-navy-400 hover:border-navy-300 rounded-lg px-4 py-3 text-center cursor-pointer transition-colors"
            >
              {file
                ? <p className="text-sm text-slate-200 font-medium">{file.name}</p>
                : (
                  <>
                    <Upload className="w-4 h-4 text-slate-500 mx-auto mb-1" />
                    <p className="text-xs text-slate-400">Click to select a .csv or .xlsx file</p>
                  </>
                )
              }
              <input
                ref={fileRef} type="file" accept=".csv,.xlsx,text/csv" className="hidden"
                onChange={e => { setError(null); setFile(e.target.files?.[0] || null) }}
              />
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-400 flex items-center gap-1">
              <XCircle className="w-3.5 h-3.5 flex-shrink-0" />{error}
            </p>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleUpload}
              disabled={processing}
              className="flex items-center gap-1.5 px-4 py-2 bg-teal-500/10 border border-teal-500/30 text-teal-400 rounded-lg text-sm hover:bg-teal-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Upload className="w-3.5 h-3.5" />
              {processing ? 'Processing…' : 'Upload'}
            </button>
            <button
              onClick={reset}
              className="px-4 py-2 bg-navy-700 border border-navy-500 text-slate-400 rounded-lg text-sm hover:text-slate-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Bottom actions */}
      {!showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-3 py-2 bg-teal-500/10 border border-teal-500/30 text-teal-400 rounded-lg text-sm hover:bg-teal-500/20 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add New Upload
        </button>
      )}
    </div>
  )
}

// ── Entity chips ──────────────────────────────────────────────────────────────

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

export default function ApiSetup({ registryStatus = {}, csvUploads = [], onCsvUpload, onCsvClear }) {
  const [syncFreq,    setSyncFreq]    = useState('daily')
  const [syncWindow,  setSyncWindow]  = useState('00:00 – 06:00 UTC')
  const [warnPeriod,  setWarnPeriod]  = useState('90')
  const [webhookUrl,  setWebhookUrl]  = useState('')
  const [webhookTest, setWebhookTest] = useState(null)

  const defaultHolder = SUBSIDIARIES.find(s => s.active)?.name ?? ''

  function testWebhook() {
    setWebhookTest({ ok: true, time: new Date().toLocaleTimeString() })
  }

  return (
    <div className="space-y-5 max-w-4xl">

      {/* ── SECTION 1 — Live API Connections ── */}
      <div className="bg-navy-800 border border-navy-500 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-navy-500 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-accent-blue/10 border border-accent-blue/20">
            <Wifi className="w-4 h-4 text-accent-blue" />
          </div>
          <div>
            <h3 className="font-semibold text-white text-sm">Section 1 — Live API Connections</h3>
            <p className="text-xs text-slate-400 mt-0.5">Registries fetched automatically when you click Refresh All</p>
          </div>
        </div>
        <div className="divide-y divide-navy-600/20">
          {REGISTRIES.filter(r => r.fetchStrategy !== 'csv' && !r.hidden).map(reg => (
            <LiveApiCard key={reg.id} reg={reg} registryStatus={registryStatus} />
          ))}
        </div>
      </div>

      {/* ── SECTION 2 — Manual Upload Registries ── */}
      <div className="bg-navy-800 border border-navy-500 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-navy-500 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-teal-500/10 border border-teal-500/20">
              <Upload className="w-4 h-4 text-teal-400" />
            </div>
            <div>
              <h3 className="font-semibold text-white text-sm">Section 2 — Manual Upload Registries</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Upload CSV or XLSX from any registry — IP India, ILPO, CNIPA, JPO, and more
              </p>
            </div>
          </div>
          <button
            onClick={downloadCsvTemplate}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-accent-blue border border-accent-blue/30 bg-accent-blue/5 hover:bg-accent-blue/15 transition-colors whitespace-nowrap flex-shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            Download Template
          </button>
        </div>

        <div className="px-5 py-2 bg-navy-700/20 border-b border-navy-600/30">
          <p className="text-[11px] text-slate-500 font-mono">
            Template columns: Applicant · Mark Name · Application No. · Registration No. · Kind of Mark ·
            NCL Class · <span className="text-teal-400">Country of Filing</span> · <span className="text-teal-400">Registry</span> ·
            Filed Date · Publication Date · Registration Date · Expiry Date · Current Status
          </p>
        </div>

        <div className="p-5">
          <UploadManager
            csvUploads={csvUploads}
            onCsvUpload={onCsvUpload}
            onCsvClear={onCsvClear}
          />
        </div>
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

      {/* ── SECTION 3 — Subsidiary Entities ── */}
      <div className="bg-navy-800 border border-navy-500 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-navy-500 flex items-center gap-3">
          <div className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/20">
            <Building2 className="w-4 h-4 text-purple-400" />
          </div>
          <div>
            <h3 className="font-semibold text-white text-sm">Section 3 — Subsidiary Entities</h3>
            <p className="text-xs text-slate-400 mt-0.5">All 8 subsidiaries tracked by this dashboard — defined in <code className="text-accent-blue font-mono">src/subsidiaries.js</code></p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-navy-600/40 bg-navy-700/30">
                {['#', 'Entity', 'Short Name', 'HQ', 'Search Key'].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SUBSIDIARIES.filter(s => s.active).map((s, i) => (
                <tr key={s.id} className="border-b border-navy-600/30 hover:bg-navy-700/20 transition-colors">
                  <td className="px-5 py-3 text-slate-500 text-xs">{i + 1}</td>
                  <td className="px-5 py-3 font-medium text-white whitespace-nowrap">{s.name}</td>
                  <td className="px-5 py-3 text-slate-300 whitespace-nowrap">{s.shortName}</td>
                  <td className="px-5 py-3 text-slate-400 text-xs whitespace-nowrap">{s.country}</td>
                  <td className="px-5 py-3 font-mono text-xs text-accent-blue whitespace-nowrap">{s.searchKey ?? s.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
