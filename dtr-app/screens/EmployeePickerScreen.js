import React, { useEffect, useState, useCallback } from 'react';
import { View, FlatList, StyleSheet } from 'react-native';
import {
  Searchbar, List, ActivityIndicator, Text, Avatar, Button, Chip,
} from 'react-native-paper';
import { getEmployees } from '../api';

export default function EmployeePickerScreen({ navigation }) {
  const [employees, setEmployees] = useState([]);
  const [filtered, setFiltered]   = useState([]);
  const [query, setQuery]         = useState('');
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    getEmployees()
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
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

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
        <Button mode="contained" icon="refresh" onPress={load}>
          Retry
        </Button>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <Searchbar
        placeholder="Search name or employee #"
        value={query}
        onChangeText={setQuery}
        style={{ margin: 12 }}
      />

      <View style={styles.countRow}>
        <Chip compact icon="account-multiple">
          {filtered.length} employee{filtered.length === 1 ? '' : 's'}
        </Chip>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.employee_number)}
        keyboardShouldPersistTaps="handled"
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
  countRow: {
    paddingHorizontal: 12,
    paddingBottom: 4,
    flexDirection: 'row',
  },
});