import {evaluationError} from './errors.js'

export function shiftTimestamp(timestamp, seconds, nanos, sign) {
  if (nanos % 1000000 !== 0) throw evaluationError('invalid_timestamp', 'Sub-millisecond timestamp arithmetic is unsupported')
  const epoch = BigInt(timestamp.getTime()) + BigInt(sign) * (seconds * 1000n + BigInt(nanos / 1000000))
  if (epoch < -62135596800000n || epoch > 253402300799999n) throw evaluationError('invalid_timestamp', 'Timestamp out of range')
  return new Date(Number(epoch))
}

export function zonedWallDate(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US-u-ca-iso8601-nu-latn', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', era: 'short'
  }).formatToParts(date)
  const fields = Object.fromEntries(parts.map(part => [part.type, part.value]))
  const year = fields.era === 'BC' ? 1 - Number(fields.year) : Number(fields.year)
  const output = new Date(0)
  output.setUTCFullYear(year, Number(fields.month) - 1, Number(fields.day))
  output.setUTCHours(Number(fields.hour), Number(fields.minute), Number(fields.second), date.getUTCMilliseconds())
  return output
}

// Viewstem's explicitly bounded millisecond timestamp profile.
export function strictTimestamp(value) {
  const bad = () => { throw evaluationError('invalid_timestamp', 'Invalid millisecond timestamp') }
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value)
  if (!match) return bad()
  const [, ys, mos, ds, hs, mis, ss, fraction = '', zone, sign, ohs, oms] = match
  const y = Number(ys), mo = Number(mos), d = Number(ds), h = Number(hs), mi = Number(mis), s = Number(ss)
  const oh = Number(ohs ?? 0), om = Number(oms ?? 0)
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (y < 1 || mo < 1 || mo > 12 || d < 1 || d > days[mo - 1] || h > 23 || mi > 59 || s > 59
    || oh > 23 || om > 59 || zone === '-00:00') return bad()
  const date = new Date(0)
  date.setUTCFullYear(y, mo - 1, d)
  date.setUTCHours(h, mi, s, Number(fraction.padEnd(3, '0')))
  const epoch = date.getTime() - (sign === '-' ? -1 : 1) * (oh * 60 + om) * 60000
  if (epoch < -62135596800000 || epoch > 253402300799999) return bad()
  return new Date(epoch)
}
