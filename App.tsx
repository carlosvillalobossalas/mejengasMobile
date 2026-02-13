/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import React from 'react';
import 'react-native-reanimated'
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { PaperProvider, MD3LightTheme as DefaultTheme, } from 'react-native-paper';
import { Provider as ReduxProvider } from 'react-redux';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import RootNavigator from './src/navigation/RootNavigator';
import { store } from './src/app/store';
import AuthBootstrapper from './src/features/auth/AuthBootstrapper';
import NotificationsBootstrapper from './src/features/notifications/NotificationsBootstrapper';
import MaterialDesignIcons from '@react-native-vector-icons/material-design-icons';

const customTheme = {
  "colors": {
    "primary": "rgb(186, 26, 32)",
    "onPrimary": "rgb(255, 255, 255)",
    "primaryContainer": "rgb(255, 218, 214)",
    "onPrimaryContainer": "rgb(65, 0, 3)",
    "secondary": "rgb(0, 104, 116)",
    "onSecondary": "rgb(255, 255, 255)",
    "secondaryContainer": "rgb(151, 240, 255)",
    "onSecondaryContainer": "rgb(0, 31, 36)",
    "tertiary": "rgb(185, 29, 26)",
    "onTertiary": "rgb(255, 255, 255)",
    "tertiaryContainer": "rgb(255, 218, 213)",
    "onTertiaryContainer": "rgb(65, 0, 1)",
    "error": "rgb(186, 26, 26)",
    "onError": "rgb(255, 255, 255)",
    "errorContainer": "rgb(255, 218, 214)",
    "onErrorContainer": "rgb(65, 0, 2)",
    "background": "rgb(255, 251, 255)",
    "onBackground": "rgb(32, 26, 25)",
    "surface": "rgb(255, 251, 255)",
    "onSurface": "rgb(32, 26, 25)",
    "surfaceVariant": "rgb(245, 221, 219)",
    "onSurfaceVariant": "rgb(83, 67, 66)",
    "outline": "rgb(133, 115, 113)",
    "outlineVariant": "rgb(216, 194, 191)",
    "shadow": "rgb(0, 0, 0)",
    "scrim": "rgb(0, 0, 0)",
    "inverseSurface": "rgb(54, 47, 46)",
    "inverseOnSurface": "rgb(251, 238, 236)",
    "inversePrimary": "rgb(255, 179, 172)",
    "elevation": {
      "level0": "transparent",
      "level1": "rgb(252, 240, 244)",
      "level2": "rgb(250, 233, 237)",
      "level3": "rgb(247, 226, 231)",
      "level4": "rgb(247, 224, 228)",
      "level5": "rgb(245, 220, 224)"
    },
    "surfaceDisabled": "rgba(32, 26, 25, 0.12)",
    "onSurfaceDisabled": "rgba(32, 26, 25, 0.38)",
    "backdrop": "rgba(59, 45, 44, 0.4)"
  }
}
function App() {

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
            theme={{ ...DefaultTheme, colors: customTheme.colors }}
          >
            <StatusBar barStyle={'light-content'} />
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
