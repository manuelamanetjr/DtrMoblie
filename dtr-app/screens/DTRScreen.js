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
// UNDERTIME: 0 < hours < 8
// COMPLETE : 8 <= hours < 9
// OVERTIME : hours >= 9
// ABSENT   : no in/out, or hours <= 0
const STANDARD_HOURS = 8;
const OVERTIME_HOURS = 9;

// Legend colors
const STATUS_COLOR = {
  complete:  '#2e7d32', // green
  overtime:  '#1565c0', // blue
  undertime: '#ef6c00', // orange
  absent:    '#9e9e9e', // grey
};

// Row background tint
const STATUS_BG = {
  complete:  '#e8f5e9',
  overtime:  '#e3f2fd',
  undertime: '#fff3e0',
  absent:    '#f5f5f5',
};

const LEGEND_ORDER = ['complete', 'overtime', 'undertime', 'absent'];

// Sunday-start week helpers
const startOfSundayWeek = (d) => d.subtract(d.day(), 'day');
const endOfSundayWeek   = (d) => d.add(6 - d.day(), 'day');

// Convert "HH:mm:ss" → "h:mm A" using dayjs
const fmtTime = (t) => {
  if (!t) return '—';
  const parsed = dayjs(t, ['HH:mm:ss', 'HH:mm', 'H:mm:ss', 'H:mm'], true);
  return parsed.isValid() ? parsed.format('h:mm A') : t;
};

// Derive one of: complete | overtime | undertime | absent
//   ABSENT   : no valid in/out pair, or hours <= 0
//   UNDERTIME: 0 < hours < 8
//   COMPLETE : 8 <= hours < 9
//   OVERTIME : hours >= 9
const deriveStatus = (item) => {
  const hasIn  = !!item.in;
  const hasOut = !!item.out;
  const hrs    = Number(item.hours) || 0;

  if (!hasIn || !hasOut || hrs <= 0) return 'absent';
  if (hrs >= OVERTIME_HOURS) return 'overtime';   // >= 9
  if (hrs >= STANDARD_HOURS) return 'complete';   // 8 <= h < 9
  return 'undertime';                             // 0 < h < 8
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
                <DataTable.Title>Date</DataTable.Title>
                <DataTable.Title>In</DataTable.Title>
                <DataTable.Title>Out</DataTable.Title>
                <DataTable.Title numeric>Hrs</DataTable.Title>
              </DataTable.Header>
            </DataTable>
          )}
        </>
      }
      renderItem={({ item }) => {
        const status = deriveStatus(item);
        return (
          <DataTable.Row
            style={{
              marginHorizontal: 12,
              backgroundColor: STATUS_BG[status],
              borderLeftWidth: 4,
              borderLeftColor: STATUS_COLOR[status],
            }}
          >
            <DataTable.Cell>
              <View>
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
            <DataTable.Cell>{fmtTime(item.in)}</DataTable.Cell>
            <DataTable.Cell>{fmtTime(item.out)}</DataTable.Cell>
            <DataTable.Cell numeric>
              {item.hours > 0 ? item.hours : '—'}
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
});