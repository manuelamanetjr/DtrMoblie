import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { PaperProvider, MD3LightTheme } from 'react-native-paper';
import EmployeePickerScreen from './screens/EmployeePickerScreen';
import DTRScreen from './screens/DTRScreen';

import dayjs from 'dayjs';
import weekOfYear from 'dayjs/plugin/weekOfYear';
import isoWeek from 'dayjs/plugin/isoWeek';
dayjs.extend(weekOfYear);
dayjs.extend(isoWeek);

const Stack = createNativeStackNavigator();

const theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#1e6bd6',
  },
};

export default function App() {
  return (
    <PaperProvider theme={theme}>
      <NavigationContainer>
        <Stack.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: theme.colors.primary },
            headerTintColor: '#fff',
          }}
        >
          <Stack.Screen
            name="Employees"
            component={EmployeePickerScreen}
            options={{ title: 'Employees' }}
          />
          <Stack.Screen
            name="DTR"
            component={DTRScreen}
            options={{ title: 'DTR' }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </PaperProvider>
  );
}