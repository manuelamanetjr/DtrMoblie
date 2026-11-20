// api.js
import axios from 'axios';
import {
  getCached, setCached, invalidate, invalidateAll, dedupe,
  DEFAULT_TTL_MS,
} from './cache';

export const BASE_URL = 'http://192.168.44.200:3000/api';

const EMPLOYEES_TTL = 10 * 60 * 1000;
const DTR_TTL       = DEFAULT_TTL_MS;

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

// ─── DTR ────────────────────────────────────────────────────
function periodKey(mode, employee_number, params) {
  if (mode === 'week')  return `dtr:week:${employee_number}:${params.date}`;
  if (mode === 'month') return `dtr:month:${employee_number}:${params.year}-${params.month}`;
  if (mode === 'range') return `dtr:range:${employee_number}:${params.start}:${params.end}`;
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

export function getDTRRange(employee_number, start, end, { force = false } = {}) {
  const params = { mode: 'range', employee_number, start, end };
  const key = periodKey('range', employee_number, params);
  return fetchDTR(key, '/dtr', params, DTR_TTL, force);
}

// ─── Invalidation ──────────────────────────────────────────
export async function invalidateDTR() {
  await invalidateAll();
}
export async function invalidateEmployees() {
  await invalidate('employees');
}
export async function clearAllCache() {
  await invalidateAll();
}