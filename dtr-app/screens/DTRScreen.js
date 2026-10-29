import React, { useState, useEffect, useCallback } from 'react';
import { View, FlatList, StyleSheet } from 'react-native';
import {
  SegmentedButtons, Button, Card, Text, ActivityIndicator,
  DataTable, Chip, Divider,
} from 'react-native-paper';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import { getDTRWeek, getDTRMonth } from '../api';

dayjs.extend(customParseFormat);

// ── Status thresholds (in hours) ────────────────────────────
const STANDARD_HOURS = 8;
const OVERTIME_HOURS = 9;

const STATUS_COLOR = {
  complete:  '#2e7d32',
  overtime:  '#1565c0',
  undertime: '#ef6c00',
  absent:    '#9e9e9e',
};

const STATUS_BG = {
  complete:  '#e8f5e9',
  overtime:  '#e3f2fd',
  undertime: '#fff3e0',
  absent:    '#f5f5f5',
};

const LEGEND_ORDER = ['complete', 'overtime', 'undertime', 'absent'];

const startOfSundayWeek = (d) => d.subtract(d.day(), 'day');
const endOfSundayWeek   = (d) => d.add(6 - d.day(), 'day');

const fmtTime = (t) => {
  if (!t) return '—';
  const parsed = dayjs(t, ['HH:mm:ss', 'HH:mm', 'H:mm:ss', 'H:mm'], true);
  return parsed.isValid() ? parsed.format('h:mm A') : t;
};

const deriveStatus = (item) => {
  const hasIn  = !!item.in;
  const hasOut = !!item.out;
  const hrs    = Number(item.hours) || 0;
  const isSunday = dayjs(item.date).day() === 0;

  if (isSunday) {
    if (hasIn || hasOut || hrs > 0) return 'overtime';
    return null;
  }

  if (!hasIn || !hasOut || hrs <= 0) return 'absent';
  if (hrs >= OVERTIME_HOURS) return 'overtime';
  if (hrs >= STANDARD_HOURS) return 'complete';
  return 'undertime';
};

// Column flex weights — shared by BOTH header and body so they always line up
const COL = {
  date: 1.4,
  in:   1,
  out:  1,
  hrs:  0.9,
};

export default function DTRScreen({ route }) {
  const { employee } = route.params;
  const [mode, setMode]     = useState('week');
  const [anchor, setAnchor] = useState(dayjs());
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    const p = mode === 'week'
      ? getDTRWeek(employee.employee_number, anchor.format('YYYY-MM-DD'))
      : getDTRMonth(employee.employee_number, anchor.year(), anchor.month() + 1);
    p.then(setData).finally(() => setLoading(false));
  }, [mode, anchor, employee.employee_number]);

  useEffect(() => { load(); }, [load]);

  const shift = (delta) =>
    setAnchor(a => (mode === 'week' ? a.add(delta, 'week') : a.add(delta, 'month')));

  return (
    <FlatList
      style={{ flex: 1 }}
      data={data?.days ?? []}
      keyExtractor={d => d.date}
      ListHeaderComponent={
        <>
          <Card style={{ margin: 12 }}>
            <Card.Title
              title={`${employee.last.toUpperCase()}, ${employee.first}`}
              subtitle={`#${employee.employee_number} • ${employee.company}`}
            />
          </Card>

          <SegmentedButtons
            value={mode}
            onValueChange={setMode}
            buttons={[
              { value: 'week',  label: 'Weekly',  icon: 'calendar-week' },
              { value: 'month', label: 'Monthly', icon: 'calendar-month' },
            ]}
            style={{ marginHorizontal: 12 }}
          />

          <View style={styles.navRow}>
            <Button icon="chevron-left" onPress={() => shift(-1)}>Prev</Button>
            <Text variant="titleMedium" style={styles.rangeLabel}>
              {mode === 'week'
                ? `${startOfSundayWeek(anchor).format('MMM D, YYYY')} – ${endOfSundayWeek(anchor).format('MMM D, YYYY')}`
                : `${anchor.startOf('month').format('MMM D, YYYY')} – ${anchor.endOf('month').format('MMM D, YYYY')}`}
            </Text>
            <Button icon="chevron-right" onPress={() => shift(1)}>Next</Button>
          </View>

          {loading && <ActivityIndicator style={{ margin: 24 }} />}

          {!loading && data && (
            <Card style={{ margin: 12 }}>
              <Card.Content>
                <Text variant="labelMedium">TOTAL HOURS</Text>
                <Text variant="displaySmall" style={{ fontWeight: '700' }}>
                  {data.total_hours}
                </Text>
                <Text variant="bodySmall" style={{ marginTop: 4 }}>
                  {data.range.start} to {data.range.end}
                </Text>
              </Card.Content>
            </Card>
          )}

          {!loading && data && (
            <DataTable style={{ marginHorizontal: 12 }}>
              <DataTable.Header>
                <DataTable.Title style={[styles.colBase, { flex: COL.date }]}>
                  <Text style={styles.headerText}>Date</Text>
                </DataTable.Title>
                <DataTable.Title style={[styles.colBase, { flex: COL.in }]}>
                  <Text style={styles.headerText}>In</Text>
                </DataTable.Title>
                <DataTable.Title style={[styles.colBase, { flex: COL.out }]}>
                  <Text style={styles.headerText}>Out</Text>
                </DataTable.Title>
                <DataTable.Title style={[styles.colBase, { flex: COL.hrs }]}>
                  <Text style={styles.headerText}>Hrs</Text>
                </DataTable.Title>
              </DataTable.Header>
            </DataTable>
          )}
        </>
      }
      renderItem={({ item }) => {
        const status = deriveStatus(item);
        const isSunday = dayjs(item.date).day() === 0;

        const rowBg = status
          ? STATUS_BG[status]
          : (isSunday ? '#fafafa' : 'transparent');
        const borderColor = status
          ? STATUS_COLOR[status]
          : (isSunday ? '#e0e0e0' : 'transparent');

        return (
          <DataTable.Row
            style={{
              marginHorizontal: 12,
              backgroundColor: rowBg,
              borderLeftWidth: 4,
              borderLeftColor: borderColor,
            }}
          >
            <DataTable.Cell style={[styles.colBase, { flex: COL.date }]}>
              <View style={styles.stack}>
                <Text style={styles.cellText}>
                  {dayjs(item.date).format('MMM D ddd')}
                </Text>
                {status ? (
                  <Text
                    style={[
                      styles.cellText,
                      { fontSize: 10, color: STATUS_COLOR[status], fontWeight: '600' },
                    ]}
                  >
                    {status.toUpperCase()}
                  </Text>
                ) : isSunday ? (
                  <Text
                    style={[
                      styles.cellText,
                      { fontSize: 10, color: '#9e9e9e', fontWeight: '600' },
                    ]}
                  >
                    REST DAY
                  </Text>
                ) : null}
              </View>
            </DataTable.Cell>
            <DataTable.Cell style={[styles.colBase, { flex: COL.in }]}>
              <Text style={styles.cellText}>{fmtTime(item.in)}</Text>
            </DataTable.Cell>
            <DataTable.Cell style={[styles.colBase, { flex: COL.out }]}>
              <Text style={styles.cellText}>{fmtTime(item.out)}</Text>
            </DataTable.Cell>
            <DataTable.Cell style={[styles.colBase, { flex: COL.hrs }]}>
              <Text style={styles.cellText}>
                {item.hours > 0 ? item.hours : '—'}
              </Text>
            </DataTable.Cell>
          </DataTable.Row>
        );
      }}
      ListFooterComponent={
        !loading && data && (
          <View style={{ padding: 12 }}>
            <Divider />
            <Text style={{ marginTop: 12, marginBottom: 6, fontSize: 12, color: '#666' }}>
              LEGEND
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {LEGEND_ORDER.map(s => (
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
        )
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
  rangeLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 13,
  },
  // Shared by header Title AND body Cell — same padding, same centering
  colBase: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 0,   // kill RP's default asymmetric padding
  },
  headerText: {
    textAlign: 'center',
    width: '100%',
  },
  stack: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  cellText: {
    textAlign: 'center',
    width: '100%',
  },
});