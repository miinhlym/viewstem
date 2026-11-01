import { Temporal } from '../t1-values/node_modules/@js-temporal/polyfill/dist/index.esm.js';
import { normalizeDate, localInstant } from '../t1-values/values.mjs';

// Names below are experimental pure-function registrations, not public APIs.
const fail = code => { throw Object.assign(new Error(code), { code }); };
function zone(value) {
  if (typeof value !== 'string' || !value || /^[+-]/.test(value)) fail('TYPE_MISMATCH');
  try { Temporal.Instant.fromEpochMilliseconds(0).toZonedDateTimeISO(value); }
  catch { fail('TYPE_MISMATCH'); }
  return value;
}
function integer(value) {
  if (typeof value !== 'bigint' || value < BigInt(Number.MIN_SAFE_INTEGER) || value > BigInt(Number.MAX_SAFE_INTEGER)) fail('TYPE_MISMATCH');
  return Number(value);
}
export function addDate(date, amount) {
  try { return normalizeDate(Temporal.PlainDate.from(normalizeDate(date, 'date')).add({ days: integer(amount) }).toString(), 'date'); }
  catch { fail('TYPE_MISMATCH'); }
}
export function localDate(epoch, timeZone) {
  try { return normalizeDate(Temporal.Instant.fromEpochMilliseconds(integer(epoch)).toZonedDateTimeISO(zone(timeZone)).toPlainDate().toString(), 'date'); }
  catch { fail('TYPE_MISMATCH'); }
}
export function atLocal(date, time, timeZone) {
  try { return localInstant(date, time, zone(timeZone)); } catch { fail('TYPE_MISMATCH'); }
}
export function parseYY(text) {
  if (typeof text !== 'string' || !/^\d{2}$/.test(text)) fail('TYPE_MISMATCH');
  const year = Number(text); return BigInt(year <= 68 ? 2000 + year : 1900 + year);
}
export const calendarFunctions = Object.freeze([
  ['localDate(int, string): string', localDate],
  ['addDate(string, int): string', addDate],
  ['atLocal(string, string, string): string', atLocal],
  ['startOfDay(string, string): string', (date, tz) => atLocal(date, '00:00', tz)],
  ['nextDayStart(string, string): string', (date, tz) => atLocal(addDate(date, 1n), '00:00', tz)],
  ['parseYY(string): int', parseYY],
]);
