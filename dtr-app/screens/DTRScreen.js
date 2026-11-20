import React, { useState, useEffect, useCallback } from 'react';
import { View, FlatList, StyleSheet, RefreshControl, Pressable, Alert, Platform } from 'react-native';
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
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystemLegacy from 'expo-file-system/legacy';

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

// ── PDF HTML Generator ──────────────────────────────────────
function generatePdfHtml(days, employee) {
  const sortedDays = [...days].sort((a, b) => a.date.localeCompare(b.date));
  
  // Exact 47 rows per column, 3 columns per page
  const ROWS_PER_COL = 47;
  const COLS_PER_PAGE = 3;
  const ITEMS_PER_PAGE = ROWS_PER_COL * COLS_PER_PAGE;
  const totalPages = Math.ceil(sortedDays.length / ITEMS_PER_PAGE);
  
  let html = `
    <html>
      <head>
        <style>
          @page { margin: 15px; }
          body { font-family: Helvetica, Arial, sans-serif; font-size: 11px; margin: 0; }
          h1 { font-size: 14px; margin-bottom: 15px; text-transform: uppercase; }
          .page { display: flex; justify-content: space-between; page-break-after: always; }
          .page:last-child { page-break-after: auto; }
          .column { width: 32%; }
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #000; padding: 2px 4px; text-align: left; font-size: 11px; }
          th { font-weight: bold; text-transform: uppercase; }
        </style>
      </head>
      <body>
        <h1>${employee.last.toUpperCase()}, ${employee.first}</h1>
  `;

  for (let p = 0; p < totalPages; p++) {
    html += `<div class="page">`;
    
    for (let c = 0; c < COLS_PER_PAGE; c++) {
      const startIndex = (p * ITEMS_PER_PAGE) + (c * ROWS_PER_COL);
      const endIndex = startIndex + ROWS_PER_COL;
      const chunk = sortedDays.slice(startIndex, endIndex);

      // If this column has no data (e.g., last page with fewer items), keep it empty to maintain layout
      if (chunk.length === 0) {
        html += `<div class="column"></div>`;
        continue;
      }

      html += `
        <div class="column">
          <table>
            <tr>
              <th>DATE</th>
              <th>IN</th>
              <th>OUT</th>
            </tr>
      `;

      chunk.forEach(d => {
        html += `
          <tr>
            <td>${dayjs(d.date).format('DD-MMM-YY')}</td>
            <td>${d.in || ''}</td>
            <td>${d.out || ''}</td>
          </tr>
        `;
      });

      html += `
          </table>
        </div>
      `;
    }
    
    html += `</div>`;
  }

  html += `</body></html>`;
  return html;
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

  // ── Generate PDF as Base64 ────────────────────────────────
  const generatePdfBase64 = async () => {
    if (!data?.days?.length) {
      Alert.alert('Nothing to export', 'No DTR data for this range.');
      return null;
    }

    const html = generatePdfHtml(data.days, employee);
    const { base64 } = await Print.printToFileAsync({ html, base64: true });

    const safeName = `${employee.last}_${employee.first}_${data.range.start}_to_${data.range.end}`
      .replace(/[^a-z0-9_\-]/gi, '_');

    return { base64, fileName: `${safeName}.pdf` };
  };

  // ── Share Handler ─────────────────────────────────────────
  const onShare = async () => {
    try {
      setExporting(true);
      const pdf = await generatePdfBase64();
      if (!pdf) return;

      const tempUri = `${FileSystemLegacy.cacheDirectory}${pdf.fileName}`;
      await FileSystemLegacy.writeAsStringAsync(tempUri, pdf.base64, {
        encoding: FileSystemLegacy.EncodingType.Base64,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(tempUri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Share DTR',
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert('Error', 'Sharing is not available on this device.');
      }
    } catch (err) {
      console.warn('[Share]', err);
      Alert.alert('Share failed', err?.message ?? 'Unknown error');
    } finally {
      setExporting(false);
    }
  };

  // ── Download Handler (SAF) ────────────────────────────────
  const onDownload = async () => {
    if (Platform.OS !== 'android') {
      Alert.alert('Not Supported', 'Direct download is only available on Android. Use Share on iOS.');
      return;
    }

    try {
      setExporting(true);
      const pdf = await generatePdfBase64();
      if (!pdf) return;

      const SAF = FileSystemLegacy.StorageAccessFramework;

      const permissions = await SAF.requestDirectoryPermissionsAsync(
        SAF.getUriForDirectoryInRoot('Download')
      );

      if (!permissions.granted) return;

      const fileUri = await SAF.createFileAsync(
        permissions.directoryUri,
        pdf.fileName,
        'application/pdf'
      );

      await SAF.writeAsStringAsync(fileUri, pdf.base64, {
        encoding: FileSystemLegacy.EncodingType.Base64,
      });

      Alert.alert('Success', 'PDF saved successfully.');
    } catch (err) {
      if (err?.message?.includes('canceled')) return;
      console.warn('[Download]', err);
      Alert.alert('Download failed', err?.message ?? 'Unknown error');
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

          {mode === 'range' && (
            <View style={{ flexDirection: 'row', marginHorizontal: 12, marginTop: 4, marginBottom: 4, gap: 8 }}>
              <Button
                mode="outlined"
                icon="share-variant"
                onPress={onShare}
                loading={exporting}
                disabled={exporting || loading || !data}
                style={{ flex: 1 }}
              >
                Share PDF
              </Button>
              <Button
                mode="contained"
                icon="download"
                onPress={onDownload}
                loading={exporting}
                disabled={exporting || loading || !data}
                style={{ flex: 1 }}
              >
                Download PDF
              </Button>
            </View>
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