// Exact rational arithmetic for probabilities and rewards (FORMAT.md §4.9).
import type { Num } from './types'

export interface Rat {
  n: bigint
  d: bigint // always > 0, gcd(n, d) = 1
}

const abs = (x: bigint) => (x < 0n ? -x : x)
const gcd = (a: bigint, b: bigint): bigint => {
  a = abs(a)
  b = abs(b)
  while (b) [a, b] = [b, a % b]
  return a || 1n
}

export function rat(n: bigint, d: bigint = 1n): Rat {
  if (d === 0n) throw new RangeError('zero denominator')
  if (d < 0n) [n, d] = [-n, -d]
  const g = gcd(n, d)
  return { n: n / g, d: d / g }
}

export const ZERO = rat(0n)
export const ONE = rat(1n)

export const add = (a: Rat, b: Rat) => rat(a.n * b.d + b.n * a.d, a.d * b.d)
export const sub = (a: Rat, b: Rat) => rat(a.n * b.d - b.n * a.d, a.d * b.d)
export const mul = (a: Rat, b: Rat) => rat(a.n * b.n, a.d * b.d)
export const div = (a: Rat, b: Rat) => rat(a.n * b.d, a.d * b.n)
export const cmp = (a: Rat, b: Rat) => {
  const x = a.n * b.d - b.n * a.d
  return x < 0n ? -1 : x > 0n ? 1 : 0
}
export const sum = (xs: Rat[]) => xs.reduce(add, ZERO)
export const toFloat = (r: Rat) => Number(r.n) / Number(r.d)

const DECIMAL = /^(-?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i
const FRACTION = /^(-?\d+)\/(\d+)$/

/** Exact value of a decimal string such as "0.7", "-2", "1e-7". */
function parseDecimal(s: string): Rat | null {
  const m = DECIMAL.exec(s.trim())
  if (!m || (!m[2] && !m[3])) return null
  const [, sign, int = '', frac = '', exp = '0'] = m
  let n = BigInt((sign || '') + (int + frac || '0'))
  let d = 10n ** BigInt(frac.length)
  const e = Number(exp)
  if (e >= 0) n *= 10n ** BigInt(e)
  else d *= 10n ** BigInt(-e)
  return rat(n, d)
}

/**
 * Parse a Num (JSON number or "p/q" string) exactly. JSON numbers are read as the
 * exact decimal of their shortest representation, so 0.7 means 7/10.
 * Also accepts decimal strings, for user input. Returns null if unparseable.
 */
export function parseNum(v: Num): Rat | null {
  if (typeof v === 'number') return Number.isFinite(v) ? parseDecimal(String(v)) : null
  const f = FRACTION.exec(v.trim())
  if (f) return BigInt(f[2]) === 0n ? null : rat(BigInt(f[1]), BigInt(f[2]))
  return parseDecimal(v)
}

/** True when `v` is exact by FORMAT.md §4.9: a rational string or an integer. */
export const isExactInput = (v: Num) => typeof v === 'string' || Number.isInteger(v)

/** Serialize for a document: integers as numbers, everything else as "p/q". */
export function toNum(r: Rat): Num {
  return r.d === 1n ? Number(r.n) : `${r.n}/${r.d}`
}

/** Parse user-typed text into a Num, keeping the user's notation. */
export function parseUserNum(text: string): Num | null {
  const t = text.trim()
  const r = parseNum(t)
  if (!r) return null
  return FRACTION.test(t) ? toNum(r) : Number(t)
}
