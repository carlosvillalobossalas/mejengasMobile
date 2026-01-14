/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import React from 'react';
import { StatusBar, useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { PaperProvider } from 'react-native-paper';
import { Provider as ReduxProvider } from 'react-redux';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

import RootNavigator from './src/navigation/RootNavigator';
import { store } from './src/app/store';

function App() {
  const isDarkMode = useColorScheme() === 'dark';

  return (
    <ReduxProvider store={store}>
      <SafeAreaProvider>
        <PaperProvider
          settings={{
            icon: props => <MaterialCommunityIcons {...props} />,
          }}
        >
          <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
          <NavigationContainer>
            <RootNavigator />
          </NavigationContainer>
        </PaperProvider>
      </SafeAreaProvider>
    </ReduxProvider>
  );
}

export default App;
