import { useEffect, useRef } from 'react';

import { useAppSelector } from '../../app/hooks';
import {
  NotificationUnsubscribers,
  setupNotificationsForUser,
} from '../../services/notifications/notificationsService';

export default function NotificationsBootstrapper() {
  const userId = useAppSelector(state => state.auth.firebaseUser?.uid ?? null);
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
