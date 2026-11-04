import React, { useState, useEffect, useCallback } from 'react';
import { View, FlatList, StyleSheet, RefreshControl } from 'react-native';
import {
  SegmentedButtons, Button, Card, Text, ActivityIndicator,
  DataTable, Chip, Divider,
} from 'react-native-paper';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import { getDTRWeek, getDTRMonth } from '../api';

dayjs.extend(customParseFormat);

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
  const isSunday = dayjs(item.date).day() === 0;
  const hasIn  = !!item.in;
  const hasOut = !!item.out;
  const hrs    = Number(item.hours) || 0;
  if (!hasIn || !hasOut || hrs <= 0) return 'absent';
  if (isSunday) return 'overtime';
  if (hrs >= OVERTIME_HOURS) return 'overtime';
  if (hrs >= STANDARD_HOURS) return 'complete';
  return 'undertime';
};

export default function DTRScreen({ route }) {
  const { employee } = route.params;
  const [mode, setMode]           = useState('week');
  const [anchor, setAnchor]       = useState(dayjs());
  const [data, setData]           = useState(null);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    (force = false) => {
      if (!force) setLoading(true);
      const fn = mode === 'week'
        ? getDTRWeek(employee.employee_number, anchor.format('YYYY-MM-DD'), { force })
        : getDTRMonth(employee.employee_number, anchor.year(), anchor.month() + 1, { force });

      return fn
        .then(setData)
        .catch((err) => console.warn('[DTRScreen]', err?.message))
        .finally(() => {
          setLoading(false);
          setRefreshing(false);
        });
    },
    [mode, anchor, employee.employee_number]
  );

  useEffect(() => { load(false); }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load(true);
  };

  const shift = (delta) =>
    setAnchor((a) => (mode === 'week' ? a.add(delta, 'week') : a.add(delta, 'month')));

  const renderTable = () => {
    if (loading || !data) return null;
    return (
      <View style={styles.tableWrap}>
        <DataTable>
          <DataTable.Header>
            <DataTable.Title style={[styles.colDate, styles.centerTitle]}>
              Date
            </DataTable.Title>
            <DataTable.Title style={[styles.colIn, styles.centerTitle]}>
              In
            </DataTable.Title>
            <DataTable.Title style={[styles.colOut, styles.centerTitle]}>
              Out
            </DataTable.Title>
            <DataTable.Title style={[styles.colHrs, styles.centerTitle]}>
              Hrs
            </DataTable.Title>
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
                    <Text
                      style={{
                        fontSize: 10,
                        color: STATUS_COLOR[status],
                        fontWeight: '600',
                      }}
                    >
                      {status.toUpperCase()}
                    </Text>
                  </View>
                </DataTable.Cell>
                <DataTable.Cell style={[styles.colIn, styles.centerCell]}>
                  {fmtTime(item.in)}
                </DataTable.Cell>
                <DataTable.Cell style={[styles.colOut, styles.centerCell]}>
                  {fmtTime(item.out)}
                </DataTable.Cell>
                <DataTable.Cell style={[styles.colHrs, styles.centerCell]}>
                  {item.hours > 0 ? item.hours : '—'}
                </DataTable.Cell>
              </DataTable.Row>
            );
          })}
        </DataTable>

        <View style={{ padding: 12 }}>
          <Divider />
          <Text style={{ marginTop: 12, marginBottom: 6, fontSize: 12, color: '#666' }}>
            LEGEND
          </Text>
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
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
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
  rangeLabel: { flex: 1, textAlign: 'center', fontSize: 13 },

  tableWrap: {
    marginHorizontal: 12,
    marginBottom: 12,
  },
  row: {
    borderLeftWidth: 4,
  },

  // Column widths (unchanged — keep alignment)
  colDate: { flex: 2 },
  colIn:   { flex: 1.4 },
  colOut:  { flex: 1.4 },
  colHrs:  { flex: 1 },

  // Center titles inside their column
  centerTitle: {
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Center cell content; for numeric cells (Hrs) this still works because
  // we removed the `numeric` prop from the Hrs column so it behaves like
  // the others and can be centered uniformly.
  centerCell: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});