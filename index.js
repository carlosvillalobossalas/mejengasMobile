/**
 * @format
 */

import 'react-native-gesture-handler';

import { AppRegistry } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import App from './App';
import { name as appName } from './app.json';
globalThis.RNFB_SILENCE_MODULAR_DEPRECATION_WARNINGS = true;

messaging().setBackgroundMessageHandler(async () => undefined);

AppRegistry.registerComponent(appName, () => App);
