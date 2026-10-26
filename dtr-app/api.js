// api.js
import axios from 'axios';

// ──────────────────────────────────────────────────────────────
// Replace 192.168.1.20 with your PC's LAN IP from Step 1.
// DO NOT use "localhost" — that resolves to the phone itself.
// ──────────────────────────────────────────────────────────────
export const BASE_URL = 'http://192.168.44.113:3000/api';

export const getEmployees = () =>
  axios
    .get(`${BASE_URL}/employees`)
    .then((r) => r.data);

export const getDTRWeek = (employee_number, date) =>
  axios
    .get(`${BASE_URL}/dtr`, {
      params: { mode: 'week', employee_number, date },
    })
    .then((r) => r.data);

export const getDTRMonth = (employee_number, year, month) =>
  axios
    .get(`${BASE_URL}/dtr`, {
      params: { mode: 'month', employee_number, year, month },
    })
    .then((r) => r.data);