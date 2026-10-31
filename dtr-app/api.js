// api.js
import axios from 'axios';
import {
  getCached, setCached, invalidate, invalidateAll, dedupe,
  DEFAULT_TTL_MS,
} from './cache';

// ──────────────────────────────────────────────────────────────
// Replace 192.168.1.20 with your PC's LAN IP.
// ──────────────────────────────────────────────────────────────
export const BASE_URL = 'http://192.168.44.113:3000/api';

// Cache lifetimes per endpoint
const EMPLOYEES_TTL = 10 * 60 * 1000; // employee list rarely changes
const DTR_TTL       = DEFAULT_TTL_MS; // 5 min for DTR periods

const http = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
});

// ─── Employees ───────────────────────────────────────────────
export async function getEmployees({ force = false } = {}) {
  const key = 'employees';

  if (!force) {
    const cached = await getCached(key, EMPLOYEES_TTL);
    if (cached) return cached;
  }

  return dedupe(key, async () => {
    const { data } = await http.get('/employees');
    await setCached(key, data);
    return data;
  });
}

// ─── DTR (week/month) ────────────────────────────────────────
function periodKey(mode, employee_number, params) {
  if (mode === 'week')  return `dtr:week:${employee_number}:${params.date}`;
  if (mode === 'month') return `dtr:month:${employee_number}:${params.year}-${params.month}`;
  return `dtr:${mode}:${employee_number}:${JSON.stringify(params)}`;
}

async function fetchDTR(key, endpoint, params, ttl, force) {
  if (!force) {
    const cached = await getCached(key, ttl);
    if (cached) return cached;
  }
  return dedupe(key, async () => {
    const { data } = await http.get(endpoint, { params });
    await setCached(key, data);
    return data;
  });
}

export function getDTRWeek(employee_number, date, { force = false } = {}) {
  const params = { mode: 'week', employee_number, date };
  const key = periodKey('week', employee_number, params);
  return fetchDTR(key, '/dtr', params, DTR_TTL, force);
}

export function getDTRMonth(employee_number, year, month, { force = false } = {}) {
  const params = { mode: 'month', employee_number, year, month };
  const key = periodKey('month', employee_number, params);
  return fetchDTR(key, '/dtr', params, DTR_TTL, force);
}

// ─── Explicit cache invalidation ────────────────────────────
// Call this after you know the backend DB changed.
export async function invalidateDTR(employee_number) {
  // Simpler: nuke everything for this employee.
  // (If you prefer surgical, build a key list — but the DTR key space
  // is unbounded, so targeted wipe is fine for a mobile app.)
  await invalidateAll();
  // The next request will refetch.
}

export async function invalidateEmployees() {
  await invalidate('employees');
}

export async function clearAllCache() {
  await invalidateAll();
}