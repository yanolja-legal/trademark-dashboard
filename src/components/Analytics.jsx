import React from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, AreaChart, Area,
} from 'recharts'

const PALETTE = ['#00b4d8', '#00ff88', '#a855f7', '#fbbf24', '#f97316', '#ef4444', '#06b6d4', '#10b981']

const STATUS_COLORS = {
  'Registered':    '#00ff88',
  'Pending':       '#fbbf24',
  'Opposed':       '#ef4444',
  'Refused':       '#fb7185',
  'Lapsed':        '#6b7280',
  'Expired':       '#6b7280',
  'Expiring Soon': '#f97316',
}

const GRID   = { strokeDasharray: '3 3', stroke: '#1e3a5f' }
const TICK   = { fill: '#94a3b8', fontSize: 11 }
const AXIS   = { axisLine: false, tickLine: false }

function Tip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-navy-700 border border-navy-400 rounded-lg px-3 py-2 shadow-2xl text-sm">
      {label && <p className="text-slate-400 text-xs mb-1.5">{label}</p>}
      {payload.map((p, i) => (
        <p key={i} className="font-semibold" style={{ color: p.color || p.fill }}>
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  )
}

function Card({ title, subtitle, children, className = '' }) {
  return (
    <div className={`bg-navy-800 border border-navy-500 rounded-xl p-5 ${className}`}>
      <div className="mb-4">
        <h3 className="font-semibold text-white">{title}</h3>
        {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

function aggregate(data, keyFn) {
  const acc = {}
  data.forEach(t => { const k = keyFn(t); acc[k] = (acc[k] || 0) + 1 })
  return Object.entries(acc).map(([name, value]) => ({ name, value }))
}

export default function Analytics({ data }) {
  // By Registry
  const byRegistry = aggregate(data, t => t.registry).sort((a, b) => b.value - a.value)

  // Status distribution
  const byStatus = aggregate(data, t => t.status)

  // Filing timeline
  const byYear = aggregate(data.filter(t => t.applicationDate), t => t.applicationDate.slice(0, 4))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(({ name, value }) => ({ year: name, filings: value }))

  // NCL classes
  const nclAcc = {}
  data.forEach(t => {
    t.ncl.split(',').forEach(n => {
      const cls = n.trim()
      nclAcc[cls] = (nclAcc[cls] || 0) + 1
    })
  })
  const byNcl = Object.entries(nclAcc)
    .map(([name, value]) => ({ name: `Cls ${name}`, value }))
    .sort((a, b) => parseInt(a.name.replace('Cls ', '')) - parseInt(b.name.replace('Cls ', '')))

  // Status × Entity stacked bar
  const entityNames = [...new Set(data.map(t => t.applicant))]
  const byEntityStatus = entityNames.map(ent => {
    const marks = data.filter(t => t.applicant === ent)
    const short = ent
      .replace(' Technologies Inc.', '')
      .replace(' Europe GmbH', ' EU')
      .replace(' Asia Pacific Ltd.', ' APAC')
      .replace(' Corp.', '')
    return {
      name:            short,
      Registered:      marks.filter(m => m.status === 'Registered').length,
      Pending:         marks.filter(m => m.status === 'Pending').length,
      'Expiring Soon': marks.filter(m => m.status === 'Expiring Soon').length,
      Opposed:         marks.filter(m => m.status === 'Opposed').length,
      Refused:         marks.filter(m => m.status === 'Refused').length,
      Lapsed:          marks.filter(m => m.status === 'Lapsed').length,
      Expired:         marks.filter(m => m.status === 'Expired').length,
    }
  })

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

      {/* Registry bar chart */}
      <Card title="Marks by Registry" subtitle="Total filings per trademark office">
        <ResponsiveContainer width="100%" height={230}>
          <BarChart data={byRegistry} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="name" tick={TICK} {...AXIS} />
            <YAxis tick={TICK} {...AXIS} />
            <Tooltip content={<Tip />} />
            <Bar dataKey="value" name="Marks" radius={[4, 4, 0, 0]}>
              {byRegistry.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Status donut */}
      <Card title="Status Distribution" subtitle="Portfolio health overview">
        <ResponsiveContainer width="100%" height={230}>
          <PieChart>
            <Pie data={byStatus} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={3} dataKey="value">
              {byStatus.map((entry, i) => (
                <Cell key={i} fill={STATUS_COLORS[entry.name] || PALETTE[i]} />
              ))}
            </Pie>
            <Tooltip content={<Tip />} />
            <Legend
              iconType="circle"
              formatter={v => <span style={{ color: '#94a3b8', fontSize: '12px' }}>{v}</span>}
            />
          </PieChart>
        </ResponsiveContainer>
      </Card>

      {/* Filing timeline */}
      <Card title="Filing Timeline" subtitle="Application filings by year">
        <ResponsiveContainer width="100%" height={230}>
          <AreaChart data={byYear} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
            <defs>
              <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="10%" stopColor="#00b4d8" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#00b4d8" stopOpacity={0}    />
              </linearGradient>
            </defs>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="year" tick={TICK} {...AXIS} />
            <YAxis tick={TICK} {...AXIS} allowDecimals={false} />
            <Tooltip content={<Tip />} />
            <Area
              type="monotone"
              dataKey="filings"
              name="Filings"
              stroke="#00b4d8"
              fill="url(#areaGrad)"
              strokeWidth={2}
              dot={{ fill: '#00b4d8', r: 4, strokeWidth: 0 }}
              activeDot={{ r: 6 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      {/* NCL Classes horizontal bar */}
      <Card title="Coverage by NCL Class" subtitle="Nice Classification — marks per class">
        <ResponsiveContainer width="100%" height={230}>
          <BarChart data={byNcl} layout="vertical" margin={{ top: 4, right: 8, bottom: 4, left: 40 }}>
            <CartesianGrid {...GRID} horizontal={false} />
            <XAxis type="number" tick={TICK} {...AXIS} allowDecimals={false} />
            <YAxis dataKey="name" type="category" tick={TICK} {...AXIS} width={52} />
            <Tooltip content={<Tip />} />
            <Bar dataKey="value" name="Marks" radius={[0, 4, 4, 0]} fill="#00ff88" />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Status × Entity stacked bar — full width */}
      <Card title="Portfolio Status by Entity" subtitle="Status breakdown per subsidiary" className="lg:col-span-2">
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={byEntityStatus} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="name" tick={TICK} {...AXIS} />
            <YAxis tick={TICK} {...AXIS} allowDecimals={false} />
            <Tooltip content={<Tip />} />
            <Legend formatter={v => <span style={{ color: '#94a3b8', fontSize: '12px' }}>{v}</span>} />
            <Bar dataKey="Registered"    stackId="s" fill={STATUS_COLORS['Registered']}    />
            <Bar dataKey="Pending"       stackId="s" fill={STATUS_COLORS['Pending']}       />
            <Bar dataKey="Expiring Soon" stackId="s" fill={STATUS_COLORS['Expiring Soon']} />
            <Bar dataKey="Opposed"       stackId="s" fill={STATUS_COLORS['Opposed']}       />
            <Bar dataKey="Refused"       stackId="s" fill={STATUS_COLORS['Refused']}       />
            <Bar dataKey="Lapsed"        stackId="s" fill={STATUS_COLORS['Lapsed']}        />
            <Bar dataKey="Expired"       stackId="s" fill={STATUS_COLORS['Expired']}       radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  )
}
