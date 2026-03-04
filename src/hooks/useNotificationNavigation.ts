import { useEffect } from 'react';
import messaging, { FirebaseMessagingTypes } from '@react-native-firebase/messaging';

import { navigationRef } from '../navigation/navigationRef';
import type { AppDrawerParamList } from '../navigation/types';
import { store } from '../app/store';
import { selectGroup } from '../features/groups/groupsSlice';

type NotificationData = {
  type?: string;
  [key: string]: string | undefined;
};

// Only screens that can be navigated to without params
type DrawerScreen = {
  [K in keyof AppDrawerParamList]: AppDrawerParamList[K] extends undefined ? K : never;
}[keyof AppDrawerParamList];

/**
 * Maps the notification data payload `type` field to a drawer screen name.
 * Returns null if the type is unknown or missing.
 */
function resolveScreen(data: NotificationData | undefined): DrawerScreen | null {
  switch (data?.type) {
    case 'match-created':
      return 'Matches';
    case 'invite-received':
      return 'Invitations';
    case 'join-request-received':
      // Admin/owner tapped the notification → go directly to the requests list
      return 'JoinRequests';
    case 'join-request-accepted':
    case 'join-request-rejected':
      // User tapped the notification → go to their groups screen
      return 'Groups';
    default:
      return null;
  }
}

function navigateToScreen(screen: DrawerScreen) {
  if (navigationRef.isReady()) {
    navigationRef.navigate(screen);
  }
}

function handleMessage(message: FirebaseMessagingTypes.RemoteMessage) {
  const data = message.data as NotificationData | undefined;
  const screen = resolveScreen(data);
  if (!screen) return;

  // Si la notificación trae un groupId, seleccionarlo antes de navegar para
  // que la pantalla de destino muestre los datos del grupo correcto.
  const groupId = data?.groupId;
  const userId = store.getState().auth.firebaseUser?.uid;
  if (groupId && userId) {
    store.dispatch(selectGroup({ userId, groupId }));
  }

  navigateToScreen(screen);
}

/**
 * Hook that wires up notification-to-screen navigation.
 * Must be called inside AppNavigator (authenticated tree) so the
 * drawer screens are registered before any navigation attempt.
 *
 * Handles three cases:
 * 1. App in background → user taps notification (onNotificationOpenedApp)
 * 2. App killed (cold start) → user taps notification (getInitialNotification)
 * 3. App in foreground → notification arrives (no auto-navigation, just handled silently)
 */
export function useNotificationNavigation() {
  useEffect(() => {
    // Case 2: cold start — app was killed when the notification was tapped
    messaging()
      .getInitialNotification()
      .then(message => {
        if (message) handleMessage(message);
      });

    // Case 1: app was in background when the notification was tapped
    const unsubscribe = messaging().onNotificationOpenedApp(handleMessage);

    return unsubscribe;
  }, []);
}
