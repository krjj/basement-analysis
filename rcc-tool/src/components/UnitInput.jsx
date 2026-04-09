import React, { useState, useEffect, useCallback } from 'react'
import useStore from '../store/useStore'
import { toMM, UNIT_LABELS } from '../utils/units'

// ── Get raw edit string for a given unit ──────────────────
// Returns a clean number string suitable for a text input
function toEditStr(mm, unit) {
  if (mm == null || isNaN(mm)) return ''
  switch (unit) {
    case 'mm':    return String(Math.round(mm))
    case 'cm':    return (mm / 10).toFixed(2)
    case 'm':     return (mm / 1000).toFixed(4)
    case 'ft':    return (mm / 304.8).toFixed(4)
    case 'ft-in': {
      const totalIn = mm / 25.4
      const feet    = Math.floor(totalIn / 12)
      const inches  = +(totalIn - feet * 12).toFixed(4)
      return `${feet}-${inches}`
    }
    default: return String(Math.round(mm))
  }
}

const PLACEHOLDER = {
  mm:      '5500',
  cm:      '550.00',
  m:       '5.5000',
  ft:      '18.0446',
  'ft-in': '18-0.5  (feet-inches)',
}

/**
 * UnitInput — edits an internal mm value in the user's chosen primary unit.
 *
 * Props:
 *   valueMm   {number}   — current value in mm (source of truth)
 *   onChange  {fn(mm)}   — called with new value in mm on commit
 *   min       {number}   — minimum mm value (default 0)
 *   max       {number}   — maximum mm value (optional)
 *   width     {string}   — CSS width of the input (default '100%')
 *   showUnit  {boolean}  — show unit label suffix (default true)
 *   inline    {boolean}  — render as plain inline element (default false)
 */
export default function UnitInput({
  valueMm,
  onChange,
  min = 0,
  max,
  width = '100%',
  showUnit = true,
  inline = false,
}) {
  const primaryUnit = useStore(s => s.primaryUnit)
  const [edit,    setEdit]    = useState(() => toEditStr(valueMm, primaryUnit))
  const [focused, setFocused] = useState(false)

  // Sync display when value or unit changes (while not editing)
  useEffect(() => {
    if (!focused) setEdit(toEditStr(valueMm, primaryUnit))
  }, [valueMm, primaryUnit, focused])

  const commit = useCallback(() => {
    const mm = toMM(edit, primaryUnit)
    if (!isNaN(mm) && mm >= min && (max == null || mm <= max)) {
      onChange(Math.round(mm))
    } else {
      // Reset to last valid value
      setEdit(toEditStr(valueMm, primaryUnit))
    }
  }, [edit, primaryUnit, min, max, onChange, valueMm])

  const containerStyle = inline
    ? { display: 'inline-flex', alignItems: 'center', gap: 4 }
    : { display: 'flex', alignItems: 'center', gap: 4, width }

  return (
    <div style={containerStyle}>
      <input
        value={edit}
        placeholder={PLACEHOLDER[primaryUnit]}
        onChange={e => setEdit(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => { setFocused(false); commit() }}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
        title={`Value in ${UNIT_LABELS[primaryUnit]}${primaryUnit === 'ft-in' ? ' — format: feet-inches e.g. 18-6.25' : ''}`}
        style={{
          flex: 1,
          background: focused ? '#1a2840' : '#1e2533',
          border: focused ? '1px solid #3b82f6' : '1px solid #2a3550',
          borderRadius: 4,
          color: '#e0e0e0',
          padding: '4px 8px',
          fontSize: 12,
          outline: 'none',
          fontFamily: primaryUnit === 'ft-in' ? 'monospace' : 'inherit',
          transition: 'border-color 0.15s, background 0.15s',
          minWidth: 0,
        }}
      />
      {showUnit && (
        <span style={{
          fontSize: 10, color: '#4a6fa5', flexShrink: 0,
          minWidth: primaryUnit === 'ft-in' ? 36 : 24,
        }}>
          {UNIT_LABELS[primaryUnit]}
        </span>
      )}
    </div>
  )
}

/**
 * Compact read-only display of a mm value in primary (and optionally secondary) unit.
 */
export function UnitDisplay({ valueMm }) {
  const { primaryUnit, secondaryUnit, showSecondaryUnit } = useStore()
  if (valueMm == null) return <span style={{ color: '#4a6fa5' }}>—</span>
  const primary = toEditStr(valueMm, primaryUnit)
  const label   = UNIT_LABELS[primaryUnit]
  const secLabel = UNIT_LABELS[secondaryUnit]
  const secondary = showSecondaryUnit && secondaryUnit !== primaryUnit
    ? toEditStr(valueMm, secondaryUnit)
    : null

  return (
    <span style={{ color: '#9aadcc', fontSize: 12 }}>
      <span style={{ color: '#e0e0e0' }}>{primary}</span>
      <span style={{ color: '#4a6fa5', marginLeft: 3 }}>{label}</span>
      {secondary != null && (
        <span style={{ color: '#4a5568', marginLeft: 8 }}>
          ({secondary} <span style={{ fontSize: 10 }}>{secLabel}</span>)
        </span>
      )}
    </span>
  )
}
