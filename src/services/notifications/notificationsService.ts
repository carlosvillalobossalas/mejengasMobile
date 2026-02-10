import messaging, { FirebaseMessagingTypes } from '@react-native-firebase/messaging';

import { updateUserFcmToken } from '../../repositories/auth/authRepository';

export type NotificationHandlers = {
    onMessage?: (message: FirebaseMessagingTypes.RemoteMessage) => void;
    onNotificationOpened?: (message: FirebaseMessagingTypes.RemoteMessage) => void;
    onTokenRefresh?: (token: string) => void;
};

const isPermissionEnabled = (
    status: FirebaseMessagingTypes.AuthorizationStatus,
): boolean => {
    return (
        status === messaging.AuthorizationStatus.AUTHORIZED ||
        status === messaging.AuthorizationStatus.PROVISIONAL
    );
};

export async function requestNotificationPermission(): Promise<boolean> {
    const status = await messaging().requestPermission();
    return isPermissionEnabled(status);
}

export async function registerDeviceTokenForUser(
    userId: string,
): Promise<string | null> {
    const token = await messaging().getToken();

    if (token) {
        await updateUserFcmToken(userId, token);
    }

    return token ?? null;
}

export function listenToTokenRefresh(
    userId: string,
    handler?: (token: string) => void,
): () => void {
    return messaging().onTokenRefresh(async (token: any) => {
        await updateUserFcmToken(userId, token);
        handler?.(token);
    });
}

export function listenToForegroundMessages(
    handler?: (message: FirebaseMessagingTypes.RemoteMessage) => void,
): () => void {
    return messaging().onMessage(async (message: any) => {
        handler?.(message);
    });
}

export function listenToNotificationOpen(
    handler?: (message: FirebaseMessagingTypes.RemoteMessage) => void,
): () => void {
    return messaging().onNotificationOpenedApp((message: any) => {
        handler?.(message);
    });
}

export async function handleInitialNotification(
    handler?: (message: FirebaseMessagingTypes.RemoteMessage) => void,
): Promise<FirebaseMessagingTypes.RemoteMessage | null> {
    const initialMessage = await messaging().getInitialNotification();

    if (initialMessage) {
        handler?.(initialMessage);
    }

    return initialMessage;
}

export type NotificationUnsubscribers = {
    foreground?: () => void;
    opened?: () => void;
    tokenRefresh?: () => void;
};

export async function setupNotificationsForUser(
    userId: string,
    handlers: NotificationHandlers = {},
): Promise<NotificationUnsubscribers> {
    const permissionGranted = await requestNotificationPermission();

    if (!permissionGranted) {
        return {};
    }

    await registerDeviceTokenForUser(userId);
    await handleInitialNotification(handlers.onNotificationOpened);

    return {
        foreground: listenToForegroundMessages(handlers.onMessage),
        opened: listenToNotificationOpen(handlers.onNotificationOpened),
        tokenRefresh: listenToTokenRefresh(userId, handlers.onTokenRefresh),
    };
}
