import { createNavigationContainerRef } from '@react-navigation/native';

import type { AppDrawerParamList } from './types';

/**
 * A global ref to the NavigationContainer. Attach it via the `ref` prop on
 * <NavigationContainer> so it can be used outside of React components
 * (e.g. from notification handlers running before the navigator is in scope).
 */
export const navigationRef = createNavigationContainerRef<AppDrawerParamList>();
