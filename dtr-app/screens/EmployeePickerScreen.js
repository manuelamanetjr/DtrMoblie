import React, { useEffect, useState, useCallback, useRef } from 'react';
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
  const [timedOut, setTimedOut]     = useState(false);

  // Single source of truth for "we are still trying to connect"
  const connectingRef = useRef(true);

  const load = useCallback((force = false) => {
    if (!force) setLoading(true);
    setError(null);

    return getEmployees({ force })
      .then((data) => {
        setEmployees(data);
        setFiltered(data);
        setTimedOut(false);
        setError(null);
        connectingRef.current = false;
        setLoading(false);
      })
      .catch((err) => {
        console.error('[EmployeePicker]', err);
        // NEVER surface error while connecting — just stay on skeleton.
        if (connectingRef.current) {
          setLoading(true);
          return;
        }
        setError(
          err?.response?.data?.error ||
          err?.message ||
          'Could not load employees'
        );
        setLoading(false);
      })
      .finally(() => {
        setRefreshing(false);
      });
  }, []);

  useEffect(() => { load(false); }, [load]);

  // 6-second timer: latches `timedOut` true and keeps it true until
  // the user presses Retry or a connection succeeds. No auto-retry.
  useEffect(() => {
    if (!loading || timedOut) return;
    const timer = setTimeout(() => {
      setTimedOut(true);
    }, 6000);
    return () => clearTimeout(timer);
  }, [loading, timedOut]);

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

  const onRefresh = () => {
    setRefreshing(true);
    load(true);
  };

  const onForceRefreshPress = () => {
    if (refreshing) return;
    setRefreshing(true);
    load(true);
  };

  // Retry: only thing that clears the failed-connection UI.
  const onRetryConnection = () => {
    connectingRef.current = true;
    setTimedOut(false);
    setError(null);
    setLoading(true);
    load(true);
  };

  // ── Skeleton (always the background while connecting / failed) ──
  const renderSkeleton = () => (
    <View style={{ flex: 1 }}>
      <View style={styles.searchRow}>
        <View style={styles.skeletonSearchbar} />
        <View style={styles.skeletonIcon} />
      </View>
      <View style={styles.countRow}>
        <View style={styles.skeletonChip} />
      </View>
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <View key={i} style={styles.skeletonRow}>
          <View style={styles.skeletonAvatar} />
          <View style={{ flex: 1, marginLeft: 16 }}>
            <View style={styles.skeletonLineWide} />
            <View style={styles.skeletonLineNarrow} />
          </View>
        </View>
      ))}
      <View style={styles.skeletonLoadingIndicator}>
        {timedOut ? (
          <IconButton icon="close-circle" iconColor="#d32f2f" size={24} />
        ) : (
          <ActivityIndicator size="small" />
        )}
        <Text style={{ marginLeft: 8, color: timedOut ? '#d32f2f' : '#999' }}>
          {timedOut ? 'Connection failed' : 'Connecting…'}
        </Text>
      </View>
      {timedOut && (
        <View style={styles.failedOverlay}>
          <Text style={{ marginBottom: 16, textAlign: 'center', fontSize: 16 }}>
            Please Connect To Accuform Wi-fi
          </Text>
          <Button mode="contained" icon="refresh" onPress={onRetryConnection}>
            Retry
          </Button>
        </View>
      )}
    </View>
  );

  // ── While connecting (or 6s-failed): skeleton only, error never visible ──
  if (connectingRef.current || loading || timedOut) {
    return renderSkeleton();
  }

  // ── Non-connect error (server returned 500, etc.) ──
  if (error) {
    return (
      <View style={styles.center}>
        <Text style={{ marginBottom: 8, textAlign: 'center' }}>
          Failed to load employees.
        </Text>
        <Text style={{ marginBottom: 16, color: '#666', textAlign: 'center' }}>
          {error}
        </Text>
        <Button mode="contained" icon="refresh" onPress={onRetryConnection}>
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
  // ── Skeleton styles ──
  skeletonSearchbar: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#e0e0e0',
  },
  skeletonIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e0e0e0',
    marginLeft: 8,
  },
  skeletonChip: {
    width: 120,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#e0e0e0',
    marginVertical: 6,
  },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  skeletonAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e0e0e0',
  },
  skeletonLineWide: {
    height: 14,
    borderRadius: 4,
    backgroundColor: '#e0e0e0',
    width: '70%',
    marginBottom: 8,
  },
  skeletonLineNarrow: {
    height: 12,
    borderRadius: 4,
    backgroundColor: '#e0e0e0',
    width: '35%',
  },
  skeletonLoadingIndicator: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
  },
  failedOverlay: {
    marginTop: 24,
    alignItems: 'center',
    paddingHorizontal: 24,
  },
});