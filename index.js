/**
 * @format
 */

import 'react-native-gesture-handler';

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
globalThis.RNFB_SILENCE_MODULAR_DEPRECATION_WARNINGS = true;
AppRegistry.registerComponent(appName, () => App);
