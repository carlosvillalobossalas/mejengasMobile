/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import React from 'react';
import 'react-native-reanimated'
import { StatusBar, useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { PaperProvider } from 'react-native-paper';
import { Provider as ReduxProvider } from 'react-redux';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import RootNavigator from './src/navigation/RootNavigator';
import { store } from './src/app/store';
import AuthBootstrapper from './src/features/auth/AuthBootstrapper';
import NotificationsBootstrapper from './src/features/notifications/NotificationsBootstrapper';
import MaterialDesignIcons from '@react-native-vector-icons/material-design-icons';

function App() {
  const isDarkMode = useColorScheme() === 'dark';

  return (
    <ReduxProvider store={store}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <PaperProvider
            settings={{
              icon: props => <MaterialDesignIcons
                {...props}
                name={props.name as any}
              />,
            }}
          >
            <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
            <NavigationContainer>
              <AuthBootstrapper />
              <NotificationsBootstrapper />
              <RootNavigator />
            </NavigationContainer>
          </PaperProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ReduxProvider >
  );
}

export default App;
