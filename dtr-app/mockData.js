// mockData.js
// Realistic mock DTR data — matches the PHP API contract:
//   week/month  → { employee_number, range, days[], total_hours }
//   day         → { date, in, out, hours, status }
//
// Schedule:
//   Duty hours : 7:00 AM – 3:00 PM (8 hours)
//   Work days  : Monday – Saturday
//   Rest day   : Sunday (OT possible)
//   Random OT  : Mon–Sat occasionally extend past 15:00

export const MOCK_EMPLOYEES = [
  { employee_number: '003014', last: 'abella',   first: 'mary claire', mi: 's', company: 'PREMACOR' },
  { employee_number: '004039', last: 'acapulco', first: 'jeremae',     mi: 'y', company: 'PREMACOR' },
  { employee_number: '011281', last: 'castino',  first: 'steve',       mi: 'a', company: 'PREMACOR' },
  { employee_number: '803063', last: 'jaducana', first: 'fred louise', mi: 'r', company: 'PREMACOR' },
  { employee_number: '005008', last: 'pugoy',    first: 'sheila',      mi: 'a', company: 'FORMING'  },
  { employee_number: '720069', last: 'gomez',    first: 'anecito',     mi: 'b', company: 'FORMING'  },
  { employee_number: '721095', last: 'dawson',   first: 'bradley',     mi: 'a', company: 'FORMING'  },
];

// ── Helpers ───────────────────────────────────────────────
const pad = (n) => String(n).padStart(2, '0');
const fmtDate = (d) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const seedFrom = (s) => s.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
const t = (hour, minute = 0) => `${pad(Math.floor(hour))}:${pad(minute)}:00`;
const round2 = (n) => Math.round(n * 100) / 100;
const diffHours = (inStr, outStr) => {
  const [ih, im] = inStr.split(':').map(Number);
  const [oh, om] = outStr.split(':').map(Number);
  return round2((oh * 60 + om - (ih * 60 + im)) / 60);
};

// ── Employee personalities ─────────────────────────────────
// Duty is 7:00–15:00.
//   • IN before 7:00 or OUT after 15:00 → hours go up
//   • IN after 7:00 or OUT before 15:00 → hours go down
const PROFILES = {
  '003014': { style: 'regular',   otRate: 0.15 }, // 15% chance of OT per weekday
  '004039': { style: 'earlybird', otRate: 0.10 },
  '011281': { style: 'overtime',  otRate: 0.45 }, // loves OT
  '803063': { style: 'late',      otRate: 0.05 },
  '005008': { style: 'regular',   otRate: 0.15 },
  '720069': { style: 'forgetful', otRate: 0.20 },
  '721095': { style: 'halfday',   otRate: 0.10 },
};

// ── OT window helper ───────────────────────────────────────
// When an employee decides to OT, pick a plausible punch-out time.
//  - "short" OT: 15:30–17:00 (up to 2h extra)
//  - "long"  OT: 17:00–18:30 (2–3.5h extra) — rarer
function pickOvertimeOut(seed) {
  const roll = seed % 100;
  if (roll < 15) {
    // long OT (15% of OT days)
    return t(17, 0 + (seed % 30));         // 17:00–17:29
  }
  // short/medium OT (85%)
  const minutesPastThree = 30 + (seed % 60); // 30–89 min past 15:00
  const hour = 15 + Math.floor(minutesPastThree / 60);
  const min  = minutesPastThree % 60;
  return t(hour, min);
}

// ── Punch generator per day ────────────────────────────────
function buildDay(employee_number, dateStr) {
  const d   = new Date(dateStr + 'T00:00:00');
  const dow = d.getDay(); // 0=Sun … 6=Sat
  const seed    = seedFrom(employee_number + dateStr);
  const profile = PROFILES[employee_number] ?? { style: 'regular', otRate: 0.10 };

  // ── Sunday (rest day) ──
  // Only ~25% of employees show up. Short OT shift.
  if (dow === 0) {
    if (seed % 4 !== 0) {
      return { date: dateStr, in: null, out: null, hours: 0, status: 'absent' };
    }
    const inStr  = seed % 2 === 0 ? t(7, seed % 15) : t(8, seed % 20);
    const outStr = t(12, seed % 30);
    return {
      date: dateStr,
      in: inStr,
      out: outStr,
      hours: diffHours(inStr, outStr),
      status: 'complete',
    };
  }

  // ── Saturday ──
  // 25% chance of full absence.
  if (dow === 6 && seed % 4 === 1) {
    return { date: dateStr, in: null, out: null, hours: 0, status: 'absent' };
  }

  // ── Mon–Sat: 3% chance of absence ──
  if (seed % 33 === 0) {
    return { date: dateStr, in: null, out: null, hours: 0, status: 'absent' };
  }

  // ── Base in/out per personality ──
  let inStr, outStr;

  switch (profile.style) {
    case 'earlybird':
      inStr  = t(6, 40 + (seed % 15));
      outStr = t(15, seed % 5);
      break;

    case 'overtime':
      inStr  = t(6, 55 + (seed % 5));
      // High OT rate baked into profile, but still stochastic
      outStr = (seed % 100) < profile.otRate * 100
        ? pickOvertimeOut(seed)
        : t(15, seed % 10);
      break;

    case 'late':
      inStr  = t(7, 10 + (seed % 20));
      outStr = t(15, 10 + (seed % 20));
      break;

    case 'forgetful':
      inStr = t(6, 55 + (seed % 10));
      // 1 in 5 forgets to punch OUT — checked before OT to keep it realistic
      if (seed % 5 === 0) {
        return { date: dateStr, in: inStr, out: null, hours: 0, status: 'no-out' };
      }
      outStr = t(15, seed % 10);
      break;

    case 'halfday':
      inStr  = t(6, 55 + (seed % 10));
      outStr = seed % 3 === 0 ? t(12, 0) : t(15, seed % 10);
      break;

    case 'regular':
    default:
      inStr  = seed % 7 === 0 ? t(7, 5 + (seed % 20)) : t(6, 55 + (seed % 5));
      outStr = t(15, seed % 10);
      break;
  }

  // ── Random Mon–Sat overtime overlay ──
  // If the employee didn't already punch out beyond 15:00 AND their
  // roll for OT passes, extend the punch-out.
  const [oh, om] = outStr.split(':').map(Number);
  const alreadyOT = oh > 15 || (oh === 15 && om > 30);
  const otRoll = (seed * 7 + dow * 13) % 100; // stable but shuffled per weekday

  if (!alreadyOT && otRoll < profile.otRate * 100) {
    outStr = pickOvertimeOut(seed);
  }

  return {
    date: dateStr,
    in: inStr,
    out: outStr,
    hours: diffHours(inStr, outStr),
    status: 'complete',
  };
}

// ── Range builders ─────────────────────────────────────────
function buildRange(employee_number, start, end) {
  const days = [];
  let total = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    const row = buildDay(employee_number, fmtDate(cursor));
    days.push(row);
    total += row.hours;
    cursor.setDate(cursor.getDate() + 1);
  }
  return {
    employee_number,
    range: { start: fmtDate(start), end: fmtDate(end) },
    days,
    total_hours: round2(total),
  };
}

// ── Public API ─────────────────────────────────────────────
export function mockDTRWeek(employee_number, dateStr) {
  const ts    = new Date(dateStr + 'T00:00:00');
  const dow   = ts.getDay(); // 0 = Sun
  const start = new Date(ts);
  start.setDate(ts.getDate() - dow);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  return new Promise((resolve) =>
    setTimeout(() => resolve(buildRange(employee_number, start, end)), 250)
  );
}

export function mockDTRMonth(employee_number, year, month) {
  const start = new Date(year, month - 1, 1);
  const end   = new Date(year, month, 0);

  return new Promise((resolve) =>
    setTimeout(() => resolve(buildRange(employee_number, start, end)), 300)
  );
}

export function mockGetEmployees() {
  return new Promise((resolve) =>
    setTimeout(() => resolve(MOCK_EMPLOYEES), 300)
  );
}