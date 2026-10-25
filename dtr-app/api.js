// api.js
// ──────────────────────────────────────────────────────────────
// All UI code imports from this file. Right now it returns mock
// data. To switch to the real backend later, just replace the
// bodies with axios/fetch calls (see commented lines).
// ──────────────────────────────────────────────────────────────

import {
  mockGetEmployees,
  mockDTRWeek,
  mockDTRMonth,
} from './mockData';

// Later, once the PHP API is live:
// import axios from 'axios';
// export const BASE_URL = 'http://192.168.1.20/dtr_api';

export const getEmployees = () => mockGetEmployees();
// Real:
// export const getEmployees = () =>
//   axios.get(`${BASE_URL}/employees.php`).then(r => r.data);

export const getDTRWeek = (employee_number, date) =>
  mockDTRWeek(employee_number, date);
// Real:
// export const getDTRWeek = (employee_number, date) =>
//   axios.get(`${BASE_URL}/dtr.php`,
//     { params: { mode: 'week', employee_number, date } })
//        .then(r => r.data);

export const getDTRMonth = (employee_number, year, month) =>
  mockDTRMonth(employee_number, year, month);
// Real:
// export const getDTRMonth = (employee_number, year, month) =>
//   axios.get(`${BASE_URL}/dtr.php`,
//     { params: { mode: 'month', employee_number, year, month } })
//        .then(r => r.data);