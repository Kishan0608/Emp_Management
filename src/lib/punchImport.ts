import * as XLSX from 'xlsx';

import type { PunchRow } from './types';

/**
 * Reads a punching-machine export — Excel (.xlsx/.xls) or CSV — into the day-by-day
 * rows import_punch_records expects. Handles the two shapes machines commonly export:
 *
 *  - "per day": one row per employee per day, with clock-in and clock-out (and maybe
 *    break) already in separate columns on that row.
 *  - "per punch": one row per punch event (a raw access log), with a single time column
 *    and no in/out columns. Rows are grouped by employee + date, sorted by time, and
 *    the day's clock-in/out (and break, if there are four punches) are read off that.
 *
 * Column names are matched loosely (case/space/underscore-insensitive) against the
 * aliases below, so slightly different machine exports still work without changes here.
 */

export interface PunchImportResult {
  rows: PunchRow[];
  problems: { line: number | string; reason: string }[];
  totalInputRows: number;
  mapping: {
    shape: 'per_day' | 'per_punch';
    sheetName: string;
    code: string | null;
    email: string | null;
    date: string;
    time: string | null;
    status: string | null;
    clockIn: string | null;
    clockOut: string | null;
    breakStart: string | null;
    breakEnd: string | null;
  };
}

const ALIASES = {
  code: ['employee_code', 'empcode', 'emp_code', 'enrollno', 'enroll_no', 'enrollmentno', 'enrollment_no', 'cardno', 'card_no', 'userid', 'user_id', 'empid', 'emp_id', 'id', 'code'],
  email: ['email', 'emailaddress', 'email_address', 'workemail'],
  name: ['name', 'employeename', 'employee_name', 'empname'],
  date: ['date', 'workdate', 'work_date', 'attendancedate', 'attendance_date', 'punchdate', 'punch_date'],
  time: ['time', 'punchtime', 'punch_time', 'logtime', 'log_time', 'timestamp', 'datetime', 'date_time'],
  status: ['status', 'direction', 'type', 'inout', 'in_out', 'checktype', 'check_type', 'c/in', 'io', 'punchtype'],
  clockIn: ['clockin', 'clock_in', 'intime', 'in_time', 'checkin', 'check_in', 'timein', 'time_in', 'firstin', 'first_in'],
  clockOut: ['clockout', 'clock_out', 'outtime', 'out_time', 'checkout', 'check_out', 'timeout', 'time_out', 'lastout', 'last_out'],
  breakStart: ['breakstart', 'break_start', 'breakout', 'break_out'],
  breakEnd: ['breakend', 'break_end', 'breakin', 'break_in'],
} as const;

const IN_WORDS = ['in', 'checkin', 'c/in', 'entry', 'arrival'];
const OUT_WORDS = ['out', 'checkout', 'c/out', 'exit', 'departure'];

function normHeader(h: string): string {
  return String(h).trim().toLowerCase().replace(/[\s\-/]+/g, '_').replace(/[^a-z0-9_]/g, '');
}

/** First header (by its normalized form) matching any of the given aliases. */
function findCol(headers: string[], aliases: readonly string[]): string | null {
  const normAliases = aliases.map(normHeader);
  for (const h of headers) {
    if (normAliases.includes(normHeader(h))) return h;
  }
  return null;
}

const TIME_RE = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?$/;

/** Many shapes turn up in these exports: "10:04", "10:04:00", "10:04 AM", an Excel time serial (0–1), or a full datetime. */
function toHHMM(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number') {
    // Excel time/datetime serial: the fractional part is the time of day.
    const frac = value - Math.floor(value);
    const mins = Math.round(frac * 24 * 60);
    return `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
  }
  const s = String(value).trim();
  const dateTime = s.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?\s*$/);
  const m = TIME_RE.exec(s) ?? (dateTime ? TIME_RE.exec(dateTime[0].trim()) : null);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2];
  const ampm = m[4]?.toLowerCase();
  if (ampm === 'pm' && h < 12) h += 12;
  if (ampm === 'am' && h === 12) h = 0;
  if (h > 23) return null;
  return `${String(h).padStart(2, '0')}:${min}`;
}

function toYMD(value: unknown): string | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number') {
    const d = XLSX.SSF.parse_date_code(value);
    if (!d) return null;
    return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  const s = String(value).trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/.exec(s); // DD/MM/YYYY (most machines) or MM/DD/YYYY
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const [dd, mm] = a > 12 ? [a, b] : [b, a]; // if the first number can't be a month, it's the day
    return `${m[3]}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  }
  return null;
}

function isInWord(s: string | null) {
  if (!s) return false;
  const n = s.toLowerCase();
  return IN_WORDS.some((w) => n.includes(w)) && !n.includes('out');
}
function isOutWord(s: string | null) {
  if (!s) return false;
  return OUT_WORDS.some((w) => s.toLowerCase().includes(w));
}

export function parsePunchFile(bytes: ArrayBuffer, fileName: string): PunchImportResult {
  const wb = XLSX.read(bytes, { type: 'array', cellDates: false });
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const raw: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: true });

  const problems: PunchImportResult['problems'] = [];
  if (raw.length === 0) {
    return { rows: [], problems: [{ line: 1, reason: `${fileName}: no rows found` }], totalInputRows: 0, mapping: emptyMapping(sheetName) };
  }

  const headers = Object.keys(raw[0]);
  const code = findCol(headers, ALIASES.code);
  const email = findCol(headers, ALIASES.email);
  const date = findCol(headers, ALIASES.date);
  const clockIn = findCol(headers, ALIASES.clockIn);
  const clockOut = findCol(headers, ALIASES.clockOut);
  const breakStart = findCol(headers, ALIASES.breakStart);
  const breakEnd = findCol(headers, ALIASES.breakEnd);
  const time = findCol(headers, ALIASES.time);
  const status = findCol(headers, ALIASES.status);

  if (!date) {
    return {
      rows: [],
      problems: [{ line: 1, reason: `Could not find a date column. Headers found: ${headers.join(', ')}` }],
      totalInputRows: raw.length,
      mapping: emptyMapping(sheetName),
    };
  }
  if (!code && !email) {
    return {
      rows: [],
      problems: [{ line: 1, reason: `Could not find an employee code or email column. Headers found: ${headers.join(', ')}` }],
      totalInputRows: raw.length,
      mapping: emptyMapping(sheetName),
    };
  }

  const shape: 'per_day' | 'per_punch' = clockIn ? 'per_day' : 'per_punch';
  const mapping = { shape, sheetName, code, email, date, time, status, clockIn, clockOut, breakStart, breakEnd };

  if (shape === 'per_day') {
    const rows: PunchRow[] = [];
    raw.forEach((r, i) => {
      const line = i + 2;
      const d = toYMD(r[date]);
      const ci = clockIn ? toHHMM(r[clockIn]) : null;
      if (!d) return problems.push({ line, reason: 'Date not readable' });
      if (!ci) return problems.push({ line, reason: 'Clock-in time not readable' });
      rows.push({
        employee_code: code ? valStr(r[code]) : null,
        email: email ? valStr(r[email]) : null,
        work_date: d,
        clock_in: ci,
        clock_out: clockOut ? toHHMM(r[clockOut]) : null,
        break_start: breakStart ? toHHMM(r[breakStart]) : null,
        break_end: breakEnd ? toHHMM(r[breakEnd]) : null,
      });
    });
    return { rows, problems, totalInputRows: raw.length, mapping };
  }

  // Per-punch log: group by employee + date, then read clock-in/out (and break) off the sorted times.
  if (!time) {
    return {
      rows: [],
      problems: [{ line: 1, reason: `This looks like a punch log (no clock-in/out columns), but no time column was found. Headers found: ${headers.join(', ')}` }],
      totalInputRows: raw.length,
      mapping,
    };
  }

  type Punch = { t: string; status: string | null };
  const groups = new Map<string, Punch[]>();
  raw.forEach((r, i) => {
    const line = i + 2;
    const id = code ? valStr(r[code]) : valStr(r[email!]);
    const d = toYMD(r[date]);
    const t = toHHMM(r[time]);
    if (!id) return problems.push({ line, reason: 'No employee code or email on this row' });
    if (!d) return problems.push({ line, reason: 'Date not readable' });
    if (!t) return problems.push({ line, reason: 'Time not readable' });
    const key = `${id}\u0000${d}`;
    const list = groups.get(key) ?? [];
    list.push({ t, status: status ? valStr(r[status]) : null });
    groups.set(key, list);
  });

  const rows: PunchRow[] = [];
  for (const [key, punches] of groups) {
    const [id, workDate] = key.split('\u0000');
    punches.sort((a, b) => a.t.localeCompare(b.t));

    const inPunch = punches.find((p) => isInWord(p.status)) ?? punches[0];
    const outPunch = [...punches].reverse().find((p) => isOutWord(p.status)) ?? (punches.length > 1 ? punches[punches.length - 1] : null);
    const breakOut = punches.find((p) => p !== inPunch && p !== outPunch && isOutWord(p.status));
    const breakIn = punches.find((p) => p !== inPunch && p !== outPunch && p !== breakOut && isInWord(p.status));
    // No status column and exactly four punches: the common 4-punch day (in, break-out, break-in, out).
    const middle = !status && punches.length === 4 ? [punches[1], punches[2]] : null;

    rows.push({
      employee_code: code ? id : null,
      email: code ? null : id,
      work_date: workDate,
      clock_in: inPunch.t,
      clock_out: outPunch?.t ?? null,
      break_start: breakOut?.t ?? middle?.[0].t ?? null,
      break_end: breakIn?.t ?? middle?.[1].t ?? null,
    });
  }

  return { rows, problems, totalInputRows: raw.length, mapping };
}

function valStr(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function emptyMapping(sheetName: string): PunchImportResult['mapping'] {
  return { shape: 'per_day', sheetName, code: null, email: null, date: '', time: null, status: null, clockIn: null, clockOut: null, breakStart: null, breakEnd: null };
}
