import React, { useEffect, useState } from 'react';
import { View, FlatList, StyleSheet } from 'react-native';
import { Searchbar, List, ActivityIndicator, Text, Avatar, Chip } from 'react-native-paper';
import { getEmployees } from '../api';

export default function EmployeePickerScreen({ navigation }) {
  const [employees, setEmployees] = useState([]);
  const [filtered, setFiltered]   = useState([]);
  const [query, setQuery]         = useState('');
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    getEmployees()
      .then(data => { setEmployees(data); setFiltered(data); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const q = query.toLowerCase();
    setFiltered(employees.filter(e =>
      `${e.last} ${e.first}`.toLowerCase().includes(q) ||
      e.employee_number.includes(q)
    ));
  }, [query, employees]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={{ marginTop: 12 }}>Loading employees…</Text>
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
      <FlatList
        data={filtered}
        keyExtractor={item => item.employee_number}
        ListEmptyComponent={
          <Text style={{ textAlign: 'center', marginTop: 24 }}>No matches</Text>
        }
        renderItem={({ item }) => (
          <List.Item
            title={`${item.last.toUpperCase()}, ${item.first} ${item.mi ? item.mi.toUpperCase() : ''}`}
            description={`#${item.employee_number}`}
            left={props => (
              <Avatar.Text
                {...props}
                size={40}
                label={item.first[0].toUpperCase() + item.last[0].toUpperCase()}
              />
            )}
            right={() => (
              <View style={{ justifyContent: 'center' }}>
                <Chip compact>{item.company}</Chip>
              </View>
            )}
            onPress={() => navigation.navigate('DTR', { employee: item })}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});