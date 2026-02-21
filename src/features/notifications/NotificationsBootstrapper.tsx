import { useEffect, useRef } from 'react';

import { useAppSelector } from '../../app/hooks';
import {
  NotificationUnsubscribers,
  setupNotificationsForUser,
} from '../../services/notifications/notificationsService';

export default function NotificationsBootstrapper() {
  // Wait for the Firestore user doc to exist before registering the FCM token.
  // Reacting to firebaseUser too early causes a race: updateUserFcmToken creates
  // the doc before ensureFirestoreUserForAuthUser, which means createdAt and
  // displayName never get written (the else/update branch runs instead).
  const userId = useAppSelector(state => state.auth.firestoreUser?.id ?? null);
  const unsubscribersRef = useRef<NotificationUnsubscribers | null>(null);

  useEffect(() => {
    let isActive = true;

    const cleanup = () => {
      const current = unsubscribersRef.current;
      current?.foreground?.();
      current?.opened?.();
      current?.tokenRefresh?.();
      unsubscribersRef.current = null;
    };

    if (!userId) {
      cleanup();
      return () => undefined;
    }

    setupNotificationsForUser(userId).then(unsubs => {
      if (!isActive) {
        unsubs.foreground?.();
        unsubs.opened?.();
        unsubs.tokenRefresh?.();
        return;
      }

      unsubscribersRef.current = unsubs;
    });

    return () => {
      isActive = false;
      cleanup();
    };
  }, [userId]);

  return null;
}
