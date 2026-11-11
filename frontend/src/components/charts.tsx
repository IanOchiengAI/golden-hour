import React, { useState } from 'react'

/*
 * Small SVG charts, no library (keeps the app light on 2G/3G).
 * One series per chart → one colour (slot 1 blue, validated against the light surface),
 * no legend; the card title names the series. Thin marks, 4px rounded ends on the
 * baseline, 2px gaps, recessive grid, hover tooltip on every mark.
 */

const SERIES = '#2a78d6'
const GRID = '#e2e8f0'
const INK_MUTED = '#64748b'

export interface Datum {
  label: string
  value: number
  /** tooltip title; defaults to label */
  title?: string
}

/** Vertical columns, e.g. requests per day. */
export const ColumnChart: React.FC<{ data: Datum[]; height?: number; unit?: string; ariaLabel: string }> = ({
  data, height = 160, unit = '', ariaLabel,
}) => {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(1, ...data.map((d) => d.value))
  const ticks = niceTicks(max)
  const top = ticks[ticks.length - 1]
  const W = 600
  const padL = 28
  const padB = 20
  const plotH = height - padB - 6
  const slot = (W - padL) / Math.max(1, data.length)
  const barW = Math.max(4, Math.min(28, slot - 2))
  const labelEvery = Math.ceil(data.length / 7)

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${height}`} className="w-full h-auto" role="img" aria-label={ariaLabel}>
        {ticks.map((t) => {
          const y = 6 + plotH - (t / top) * plotH
          return (
            <g key={t}>
              <line x1={padL} x2={W} y1={y} y2={y} stroke={GRID} strokeWidth={1} />
              <text x={padL - 6} y={y + 4} textAnchor="end" fontSize={11} fill={INK_MUTED}>{t}</text>
            </g>
          )
        })}
        {data.map((d, i) => {
          const h = (d.value / top) * plotH
          const x = padL + i * slot + (slot - barW) / 2
          const y = 6 + plotH - h
          const r = Math.min(4, h, barW / 2)
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              {/* hit target bigger than the mark */}
              <rect x={padL + i * slot} y={6} width={slot} height={plotH} fill="transparent" />
              {h > 0 && (
                <path
                  d={`M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + barW - r} Q${x + barW},${y} ${x + barW},${y + r} V${y + h} Z`}
                  fill={SERIES}
                  opacity={hover === null || hover === i ? 1 : 0.55}
                />
              )}
              {(data.length - 1 - i) % labelEvery === 0 && (
                <text x={padL + i * slot + slot / 2} y={height - 5} textAnchor="middle" fontSize={11} fill={INK_MUTED}>
                  {d.label}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      {hover !== null && data[hover] && (
        <div
          className="absolute -top-1 pointer-events-none bg-slate-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap -translate-x-1/2"
          style={{ left: `${((padL + hover * slot + slot / 2) / W) * 100}%` }}
        >
          {data[hover].title || data[hover].label}: <strong>{data[hover].value}</strong>{unit}
        </div>
      )}
    </div>
  )
}

/** Horizontal bars with the value written beside each, e.g. requests per stage. */
export const BarList: React.FC<{ data: Datum[]; ariaLabel: string; onSelect?: (d: Datum) => void }> = ({
  data, ariaLabel, onSelect,
}) => {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <ul className="space-y-2" aria-label={ariaLabel}>
      {data.map((d) => (
        <li key={d.label}>
          <button
            type="button"
            disabled={!onSelect}
            onClick={() => onSelect?.(d)}
            title={`${d.title || d.label}: ${d.value}`}
            className="w-full text-left group disabled:cursor-default"
          >
            <div className="flex justify-between text-sm">
              <span className="text-slate-700 group-enabled:group-hover:underline">{d.label}</span>
              <span className="tabular-nums text-slate-900 font-medium">{d.value}</span>
            </div>
            <div className="h-2 mt-1 rounded bg-slate-100">
              <div className="h-2 rounded" style={{ width: `${(d.value / max) * 100}%`, background: SERIES, minWidth: d.value ? 4 : 0 }} />
            </div>
          </button>
        </li>
      ))}
    </ul>
  )
}

function niceTicks(max: number): number[] {
  const step = max <= 4 ? 1 : max <= 10 ? 2 : max <= 25 ? 5 : max <= 50 ? 10 : Math.ceil(max / 5 / 10) * 10
  const out = []
  for (let t = 0; t <= max + step - 1 && out.length < 7; t += step) out.push(t)
  if (out[out.length - 1] < max) out.push(out[out.length - 1] + step)
  return out
}

/** Count items per day for the last `days` days (local time). */
export function perDay<T>(items: T[], dateOf: (t: T) => string | null | undefined, days = 14): Datum[] {
  const out: Datum[] = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    out.push({
      label: d.toLocaleDateString([], { day: 'numeric', month: 'short' }),
      title: d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }),
      value: 0,
    })
  }
  for (const it of items) {
    const s = dateOf(it)
    if (!s) continue
    const d = new Date(s)
    d.setHours(0, 0, 0, 0)
    const idx = days - 1 - Math.round((today.getTime() - d.getTime()) / 86400000)
    if (idx >= 0 && idx < days) out[idx].value++
  }
  return out
}
