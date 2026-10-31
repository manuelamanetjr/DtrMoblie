import React, { useEffect, useState, useCallback } from 'react';
import { View, FlatList, StyleSheet, RefreshControl } from 'react-native';
import {
  Searchbar, List, ActivityIndicator, Text, Avatar, Button, Chip,
  IconButton,
} from 'react-native-paper';
import { getEmployees } from '../api';

export default function EmployeePickerScreen({ navigation }) {
  const [employees, setEmployees]   = useState([]);
  const [filtered, setFiltered]     = useState([]);
  const [query, setQuery]           = useState('');
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState(null);

  const load = useCallback((force = false) => {
    if (!force) setLoading(true);
    setError(null);

    return getEmployees({ force })
      .then((data) => {
        setEmployees(data);
        setFiltered(data);
      })
      .catch((err) => {
        console.error('[EmployeePicker]', err);
        setError(
          err?.response?.data?.error ||
          err?.message ||
          'Could not load employees'
        );
      })
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  }, []);

  useEffect(() => { load(false); }, [load]);

  useEffect(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      setFiltered(employees);
      return;
    }
    setFiltered(
      employees.filter((e) => {
        const full = `${e.last ?? ''} ${e.first ?? ''}`.toLowerCase();
        return full.includes(q) || String(e.employee_number).includes(q);
      })
    );
  }, [query, employees]);

  // Pull-to-refresh: bypass cache
  const onRefresh = () => {
    setRefreshing(true);
    load(true);
  };

  // Header button: bypass cache (works even if list is empty)
  const onForceRefreshPress = () => {
    if (refreshing) return;
    setRefreshing(true);
    load(true);
  };

  // ── Loading ──
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={{ marginTop: 12 }}>Loading employees…</Text>
      </View>
    );
  }

  // ── Error ──
  if (error) {
    return (
      <View style={styles.center}>
        <Text style={{ marginBottom: 8, textAlign: 'center' }}>
          Failed to load employees.
        </Text>
        <Text style={{ marginBottom: 16, color: '#666', textAlign: 'center' }}>
          {error}
        </Text>
        <Button mode="contained" icon="refresh" onPress={() => load(true)}>
          Retry
        </Button>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.searchRow}>
        <Searchbar
          placeholder="Search name or employee #"
          value={query}
          onChangeText={setQuery}
          style={styles.searchbar}
        />
        <IconButton
          icon="refresh"
          size={24}
          onPress={onForceRefreshPress}
          disabled={refreshing}
          accessibilityLabel="Force refresh employees"
        />
      </View>

      <View style={styles.countRow}>
        <Chip compact icon="account-multiple">
          {filtered.length} employee{filtered.length === 1 ? '' : 's'}
        </Chip>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.employee_number)}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <Text style={{ textAlign: 'center', marginTop: 24 }}>
            No matches
          </Text>
        }
        renderItem={({ item }) => {
          const last  = (item.last  ?? '').toString();
          const first = (item.first ?? '').toString();
          const mi    = (item.mi    ?? '').toString();
          const initials =
            (first[0] || '').toUpperCase() +
            (last[0]  || '').toUpperCase();

          return (
            <List.Item
              title={`${last.toUpperCase()}, ${first} ${mi ? mi.toUpperCase() : ''}`.trim()}
              description={`#${item.employee_number}`}
              left={(props) => (
                <Avatar.Text
                  {...props}
                  size={40}
                  label={initials || '?'}
                />
              )}
              onPress={() =>
                navigation.navigate('DTR', { employee: item })
              }
            />
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    marginTop: 12,
  },
  searchbar: {
    flex: 1,
  },
  countRow: {
    paddingHorizontal: 12,
    paddingBottom: 4,
    flexDirection: 'row',
  },
});