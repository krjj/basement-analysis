// Unit conversion and formatting — internal storage is always mm

export const UNIT_LABELS = {
  mm:    'mm',
  cm:    'cm',
  m:     'm',
  ft:    'ft',
  'ft-in': 'ft-in',
}

// Fraction characters for nearest 1/4"
const INCH_FRACS = {
  0:    '',
  0.25: '¼',
  0.5:  '½',
  0.75: '¾',
}

/**
 * Convert mm to a display string in the target unit.
 * @param {number} mm
 * @param {string} unit  'mm'|'cm'|'m'|'ft'|'ft-in'
 * @returns {string}
 */
export function fmtLen(mm, unit) {
  if (mm == null || isNaN(mm)) return '—'
  switch (unit) {
    case 'mm':
      return `${Math.round(mm)} mm`
    case 'cm':
      return `${(mm / 10).toFixed(1)} cm`
    case 'm':
      return `${(mm / 1000).toFixed(3)} m`
    case 'ft': {
      const ft = mm / 304.8
      return `${ft.toFixed(3)} ft`
    }
    case 'ft-in': {
      const totalInches = mm / 25.4
      const feet = Math.floor(totalInches / 12)
      const rawInches = totalInches - feet * 12
      // Round to nearest 1/4"
      const quarterInches = Math.round(rawInches * 4)
      const wholeInches = Math.floor(quarterInches / 4)
      const fracIdx = (quarterInches % 4) * 0.25
      const frac = INCH_FRACS[fracIdx] ?? ''
      return `${feet}\u2032-${wholeInches}${frac}\u2033`
    }
    default:
      return `${Math.round(mm)} mm`
  }
}

/**
 * Show value in two units e.g. "5.500 m | 18′-0″"
 * @param {number} mm
 * @param {string} primary
 * @param {string} secondary
 * @returns {string}
 */
export function fmtDual(mm, primary, secondary) {
  const a = fmtLen(mm, primary)
  const b = fmtLen(mm, secondary)
  if (primary === secondary) return a
  return `${a}  |  ${b}`
}

/**
 * Parse a user input string in a given unit → mm number.
 * For ft-in accepts: "5-3.25", "5'3.25\"", "5ft 3.25in", bare number treated as feet.
 * @param {string|number} value
 * @param {string} unit
 * @returns {number} mm
 */
export function toMM(value, unit) {
  if (value === '' || value == null) return NaN
  const v = String(value).trim()
  switch (unit) {
    case 'mm':
      return parseFloat(v)
    case 'cm':
      return parseFloat(v) * 10
    case 'm':
      return parseFloat(v) * 1000
    case 'ft':
      return parseFloat(v) * 304.8
    case 'ft-in': {
      // Accept: "5-3.25", "5'3.25\"", "5 3.25", "5ft3.25in", plain number
      // Strip symbols
      const cleaned = v.replace(/['"″′]/g, ' ').replace(/ft/gi, ' ').replace(/in/gi, ' ').trim()
      // Try splitting on dash or space
      const parts = cleaned.split(/[-\s]+/).filter(Boolean)
      if (parts.length === 0) return NaN
      if (parts.length === 1) {
        // bare number — treat as feet
        return parseFloat(parts[0]) * 304.8
      }
      const feet   = parseFloat(parts[0]) || 0
      const inches = parseFloat(parts[1]) || 0
      return (feet * 12 + inches) * 25.4
    }
    default:
      return parseFloat(v)
  }
}
