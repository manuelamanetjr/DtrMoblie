import React, { useState, useEffect, useCallback } from 'react';
import { View, FlatList, StyleSheet, RefreshControl, Pressable, Alert } from 'react-native';
import {
  SegmentedButtons,
  Button,
  Card,
  Text,
  ActivityIndicator,
  DataTable,
  Chip,
  Divider,
  IconButton,
} from 'react-native-paper';
import { DatePickerModal } from 'react-native-paper-dates';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import { getDTRWeek, getDTRMonth, getDTRRange } from '../api';
import * as XLSX from 'xlsx';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

dayjs.extend(customParseFormat);

const STANDARD_HOURS = 8;
const OVERTIME_HOURS = 9;

const STATUS_COLOR = {
  complete: '#2e7d32',
  overtime: '#1565c0',
  undertime: '#ef6c00',
  absent: '#9e9e9e',
};
const STATUS_BG = {
  complete: '#e8f5e9',
  overtime: '#e3f2fd',
  undertime: '#fff3e0',
  absent: '#f5f5f5',
};
const LEGEND_ORDER = ['complete', 'overtime', 'undertime', 'absent'];

const startOfSundayWeek = (d) => d.subtract(d.day(), 'day');
const endOfSundayWeek = (d) => d.add(6 - d.day(), 'day');

const fmtTime = (t) => {
  if (!t) return '—';
  const parsed = dayjs(t, ['HH:mm:ss', 'HH:mm', 'H:mm:ss', 'H:mm'], true);
  return parsed.isValid() ? parsed.format('h:mm A') : t;
};

const deriveStatus = (item) => {
  const isSunday = dayjs(item.date).day() === 0;
  const hasIn = !!item.in;
  const hasOut = !!item.out;
  const hrs = Number(item.hours) || 0;
  if (!hasIn || !hasOut || hrs <= 0) return 'absent';
  if (isSunday) return 'overtime';
  if (hrs >= OVERTIME_HOURS) return 'overtime';
  if (hrs >= STANDARD_HOURS) return 'complete';
  return 'undertime';
};

// ── Excel builder ───────────────────────────────────────────
// Layout (matches sample picture):
//   Row 1 (headers, repeated): DATE | IN | OUT | DATE | IN | OUT | DATE | IN | OUT
//   Rows 2..N: chunk the daily entries into groups of 3 side-by-side
function buildExportWorkbook(days, employee, range) {
  // Order days chronologically (they already come sorted from the API)
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));

  const header = [
    'DATE', 'IN', 'OUT',
    'DATE', 'IN', 'OUT',
    'DATE', 'IN', 'OUT',
  ];

  const rows = [];
  for (let i = 0; i < sorted.length; i += 3) {
    const chunk = sorted.slice(i, i + 3);
    const row = [];
    for (const d of chunk) {
      // Match the picture style: "15-Jun-26" for the date
      row.push(dayjs(d.date).format('DD-MMM-YY'));
      row.push(d.in ? d.in : '');
      row.push(d.out ? d.out : '');
    }
    // Pad to 9 columns so every row has the same shape
    while (row.length < 9) row.push('');
    rows.push(row);
  }

  const aoa = [header, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Column widths — DATE a bit wider, IN/OUT medium
  ws['!cols'] = [
    { wch: 12 }, { wch: 10 }, { wch: 10 },
    { wch: 12 }, { wch: 10 }, { wch: 10 },
    { wch: 12 }, { wch: 10 }, { wch: 10 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'DTR');

  return wb;
}

export default function DTRScreen({ route }) {
  const { employee } = route.params;

  const [mode, setMode] = useState('week');
  const [anchor, setAnchor] = useState(dayjs());
  const [range, setRange] = useState({
    start: dayjs().startOf('month'),
    end: dayjs(),
  });

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [rangePickerOpen, setRangePickerOpen] = useState(false);

  const load = useCallback(
    (force = false) => {
      if (!force) setLoading(true);

      let fn;
      if (mode === 'week') {
        fn = getDTRWeek(employee.employee_number, anchor.format('YYYY-MM-DD'), { force });
      } else if (mode === 'month') {
        fn = getDTRMonth(employee.employee_number, anchor.year(), anchor.month() + 1, { force });
      } else {
        fn = getDTRRange(
          employee.employee_number,
          range.start.format('YYYY-MM-DD'),
          range.end.format('YYYY-MM-DD'),
          { force },
        );
      }

      return fn
        .then(setData)
        .catch((err) => console.warn('[DTRScreen]', err?.message))
        .finally(() => {
          setLoading(false);
          setRefreshing(false);
        });
    },
    [mode, anchor, range, employee.employee_number],
  );

  useEffect(() => {
    load(false);
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load(true);
  };

  const shift = (delta) => {
    if (mode === 'range') {
      const days = range.end.diff(range.start, 'day') + 1;
      setRange({
        start: range.start.add(delta * days, 'day'),
        end: range.end.add(delta * days, 'day'),
      });
      return;
    }
    setAnchor((a) => (mode === 'week' ? a.add(delta, 'week') : a.add(delta, 'month')));
  };

  const onConfirmSingleDate = (params) => {
    setPickerOpen(false);
    if (!params?.date) return;
    const picked = dayjs(params.date);
    setAnchor(
      mode === 'week'
        ? picked.subtract(picked.day(), 'day')
        : picked.startOf('month'),
    );
  };

  const onConfirmRange = ({ startDate, endDate }) => {
    setRangePickerOpen(false);
    if (!startDate || !endDate) return;
    setRange({
      start: dayjs(startDate),
      end: dayjs(endDate),
    });
  };

  const openPicker = () => {
    if (mode === 'range') setRangePickerOpen(true);
    else setPickerOpen(true);
  };

  // ── Export handler ────────────────────────────────────────
  const onExport = async () => {
    if (!data?.days?.length) {
      Alert.alert('Nothing to export', 'No DTR data for this range.');
      return;
    }
    try {
      setExporting(true);

      const wb = buildExportWorkbook(data.days, employee, data.range);

      // SheetJS writes an array buffer in RN (no fs available by default)
      const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });

      const safeName = `${employee.last}_${employee.first}_${data.range.start}_to_${data.range.end}`
        .replace(/[^a-z0-9_\-]/gi, '_');
      const fileUri = FileSystem.documentDirectory + `${safeName}.xlsx`;

      await FileSystem.writeAsStringAsync(fileUri, wbout, {
        encoding: FileSystem.EncodingType.Base64,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType:
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          dialogTitle: 'Export DTR',
          UTI: 'com.microsoft.excel.xlsx',
        });
      } else {
        Alert.alert('Saved', `File saved to:\n${fileUri}`);
      }
    } catch (err) {
      console.warn('[Export]', err);
      Alert.alert('Export failed', err?.message ?? 'Unknown error');
    } finally {
      setExporting(false);
    }
  };

  const rangeLabel = (() => {
    if (mode === 'week') {
      return `${startOfSundayWeek(anchor).format('MMM D, YYYY')} – ${endOfSundayWeek(anchor).format('MMM D, YYYY')}`;
    }
    if (mode === 'month') {
      return `${anchor.startOf('month').format('MMM D, YYYY')} – ${anchor.endOf('month').format('MMM D, YYYY')}`;
    }
    return `${range.start.format('MMM D, YYYY')} – ${range.end.format('MMM D, YYYY')}`;
  })();

  const renderTable = () => {
    if (loading || !data) return null;
    return (
      <View style={styles.tableWrap}>
        <DataTable>
          <DataTable.Header>
            <DataTable.Title style={[styles.colDate, styles.centerTitle]}>Date</DataTable.Title>
            <DataTable.Title style={[styles.colIn, styles.centerTitle]}>In</DataTable.Title>
            <DataTable.Title style={[styles.colOut, styles.centerTitle]}>Out</DataTable.Title>
            <DataTable.Title style={[styles.colHrs, styles.centerTitle]}>Hrs</DataTable.Title>
          </DataTable.Header>

          {data.days.map((item) => {
            const status = deriveStatus(item);
            return (
              <DataTable.Row
                key={item.date}
                style={[
                  styles.row,
                  {
                    backgroundColor: STATUS_BG[status],
                    borderLeftColor: STATUS_COLOR[status],
                  },
                ]}
              >
                <DataTable.Cell style={[styles.colDate, styles.centerCell]}>
                  <View style={{ alignItems: 'center' }}>
                    <Text>{dayjs(item.date).format('MMM D ddd')}</Text>
                    <Text style={{ fontSize: 10, color: STATUS_COLOR[status], fontWeight: '600' }}>
                      {status.toUpperCase()}
                    </Text>
                  </View>
                </DataTable.Cell>
                <DataTable.Cell style={[styles.colIn, styles.centerCell]}>{fmtTime(item.in)}</DataTable.Cell>
                <DataTable.Cell style={[styles.colOut, styles.centerCell]}>{fmtTime(item.out)}</DataTable.Cell>
                <DataTable.Cell style={[styles.colHrs, styles.centerCell]}>
                  {item.hours > 0 ? item.hours : '—'}
                </DataTable.Cell>
              </DataTable.Row>
            );
          })}
        </DataTable>

        <View style={{ padding: 12 }}>
          <Divider />
          <Text style={{ marginTop: 12, marginBottom: 6, fontSize: 12, color: '#666' }}>LEGEND</Text>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {LEGEND_ORDER.map((s) => (
              <Chip
                key={s}
                compact
                textStyle={{ color: '#fff', fontSize: 11 }}
                style={{ backgroundColor: STATUS_COLOR[s] }}
              >
                {s.toUpperCase()}
              </Chip>
            ))}
          </View>
        </View>
      </View>
    );
  };

  return (
    <FlatList
      style={{ flex: 1 }}
      data={[null]}
      keyExtractor={() => 'top'}
      renderItem={() => null}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      ListHeaderComponent={
        <>
          <Card style={{ margin: 12 }}>
            <Card.Title
              title={`${employee.last.toUpperCase()}, ${employee.first}`}
              subtitle={`#${employee.employee_number}`}
            />
          </Card>

          <SegmentedButtons
            value={mode}
            onValueChange={setMode}
            buttons={[
              { value: 'week',  label: 'Weekly',  icon: 'calendar-week' },
              { value: 'month', label: 'Monthly', icon: 'calendar-month' },
              { value: 'range', label: 'Range',   icon: 'calendar-range' },
            ]}
            style={{ marginHorizontal: 12 }}
          />

          <View style={styles.navRow}>
            <Button icon="chevron-left" onPress={() => shift(-1)}>Prev</Button>

            <Pressable
              onPress={openPicker}
              style={styles.pickerButton}
              accessibilityRole="button"
              accessibilityLabel="Pick a date range"
            >
              <Text style={styles.rangeLabel}>{rangeLabel}</Text>
              <IconButton icon="calendar" size={18} style={{ margin: 0 }} />
            </Pressable>

            <Button icon="chevron-right" onPress={() => shift(1)}>Next</Button>
          </View>

          {/* ── Export button (range mode only) ─────────────── */}
          {mode === 'range' && (
            <Button
              mode="contained"
              icon="file-excel"
              onPress={onExport}
              loading={exporting}
              disabled={exporting || loading || !data}
              style={{ marginHorizontal: 12, marginTop: 4, marginBottom: 4 }}
            >
              Export to Excel
            </Button>
          )}

          <DatePickerModal
            locale="en"
            mode="single"
            visible={pickerOpen}
            onDismiss={() => setPickerOpen(false)}
            date={anchor.toDate()}
            onConfirm={onConfirmSingleDate}
            saveLabel="Go"
            label={mode === 'week' ? 'Pick any day in the week' : 'Pick any day in the month'}
          />

          <DatePickerModal
            locale="en"
            mode="range"
            visible={rangePickerOpen}
            onDismiss={() => setRangePickerOpen(false)}
            startDate={range.start.toDate()}
            endDate={range.end.toDate()}
            onConfirm={onConfirmRange}
            saveLabel="Go"
            label="Select start and end date"
            startLabel="From"
            endLabel="To"
          />

          {loading && <ActivityIndicator style={{ margin: 24 }} />}

          {!loading && data && (
            <Card style={{ margin: 12 }}>
              <Card.Content>
                <Text variant="labelMedium">TOTAL HOURS</Text>
                <Text variant="displaySmall" style={{ fontWeight: '700' }}>{data.total_hours}</Text>
                <Text variant="bodySmall" style={{ marginTop: 4 }}>
                  {data.range.start} to {data.range.end}
                </Text>
              </Card.Content>
            </Card>
          )}

          {renderTable()}
        </>
      }
    />
  );
}

const styles = StyleSheet.create({
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 4,
    paddingVertical: 8,
  },
  pickerButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rangeLabel: { textAlign: 'center', fontSize: 13 },

  tableWrap: { marginHorizontal: 12, marginBottom: 12 },
  row: { borderLeftWidth: 4 },

  colDate: { flex: 2 },
  colIn: { flex: 1.4 },
  colOut: { flex: 1.4 },
  colHrs: { flex: 1 },

  centerTitle: { justifyContent: 'center', alignItems: 'center' },
  centerCell:  { justifyContent: 'center', alignItems: 'center' },
});