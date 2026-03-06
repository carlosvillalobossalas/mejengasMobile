import firestore, {
  FirebaseFirestoreTypes,
} from '@react-native-firebase/firestore';
import { firebase } from '@react-native-firebase/app';
import auth from '@react-native-firebase/auth';

const USERS_COLLECTION = 'users';
const CLOUD_FUNCTIONS_REGION = 'us-central1';

export const NOTIFICATION_TYPES = [
  'newMatches',
  'matchReminders',
  'matchUpdates',
  'matchSignups',
  'matchUnsignups',
  'matchReady',
  'mvpReminders',
  'mvpResults',
  'joinRequests',
  'joinRequestUpdates',
  'invites',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export type GroupNotificationPreferences = {
  all: boolean;
} & Record<NotificationType, boolean>;

export type UserNotificationPreferences = {
  globalEnabled: boolean;
  groups: Record<string, GroupNotificationPreferences>;
};

const buildDefaultGroupNotificationPreferences = (): GroupNotificationPreferences => ({
  all: true,
  newMatches: true,
  matchReminders: true,
  matchUpdates: true,
  matchSignups: true,
  matchUnsignups: true,
  matchReady: true,
  mvpReminders: true,
  mvpResults: true,
  joinRequests: true,
  joinRequestUpdates: true,
  invites: true,
});

export const buildDefaultUserNotificationPreferences = (
  groupIds: string[] = [],
): UserNotificationPreferences => {
  const groups: Record<string, GroupNotificationPreferences> = {};

  for (const groupId of groupIds) {
    if (groupId) {
      groups[groupId] = buildDefaultGroupNotificationPreferences();
    }
  }

  return {
    globalEnabled: true,
    groups,
  };
};

const parseBoolean = (value: unknown, fallback: boolean): boolean => {
  if (typeof value === 'boolean') return value;
  return fallback;
};

const normalizeGroupPreferences = (
  value: unknown,
): GroupNotificationPreferences => {
  const raw =
    typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>)
      : {};

  const defaults = buildDefaultGroupNotificationPreferences();
  const normalized: GroupNotificationPreferences = {
    all: parseBoolean(raw.all, defaults.all),
    newMatches: parseBoolean(raw.newMatches, defaults.newMatches),
    matchReminders: parseBoolean(raw.matchReminders, defaults.matchReminders),
    matchUpdates: parseBoolean(raw.matchUpdates, defaults.matchUpdates),
    matchSignups: parseBoolean(raw.matchSignups, defaults.matchSignups),
    matchUnsignups: parseBoolean(raw.matchUnsignups, defaults.matchUnsignups),
    matchReady: parseBoolean(raw.matchReady, defaults.matchReady),
    mvpReminders: parseBoolean(raw.mvpReminders, defaults.mvpReminders),
    mvpResults: parseBoolean(raw.mvpResults, defaults.mvpResults),
    joinRequests: parseBoolean(raw.joinRequests, defaults.joinRequests),
    joinRequestUpdates: parseBoolean(raw.joinRequestUpdates, defaults.joinRequestUpdates),
    invites: parseBoolean(raw.invites, defaults.invites),
  };

  return normalized;
};

const normalizeUserNotificationPreferences = (
  value: unknown,
): UserNotificationPreferences => {
  const raw =
    typeof value === 'object' && value !== null
      ? (value as Record<string, unknown>)
      : {};

  const globalEnabled = parseBoolean(raw.globalEnabled, true);

  const groupsRaw =
    typeof raw.groups === 'object' && raw.groups !== null
      ? (raw.groups as Record<string, unknown>)
      : {};

  const groups: Record<string, GroupNotificationPreferences> = {};
  for (const [groupId, groupPrefs] of Object.entries(groupsRaw)) {
    if (!groupId) continue;
    groups[groupId] = normalizeGroupPreferences(groupPrefs);
  }

  return {
    globalEnabled,
    groups,
  };
};

export async function getUserNotificationPreferences(
  userId: string,
): Promise<UserNotificationPreferences> {
  if (!userId) {
    return buildDefaultUserNotificationPreferences();
  }

  const userSnap = await firestore().collection(USERS_COLLECTION).doc(userId).get();
  const userData = (userSnap.data() ?? {}) as Record<string, unknown>;

  return normalizeUserNotificationPreferences(userData.notificationPreferences);
}

export async function updateGlobalNotificationsEnabled(
  userId: string,
  enabled: boolean,
): Promise<void> {
  const userRef = firestore().collection(USERS_COLLECTION).doc(userId);

  await userRef.set(
    {
      notificationPreferences: {
        globalEnabled: enabled,
        updatedAt: firestore.FieldValue.serverTimestamp(),
      },
      updatedAt: firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

export async function updateGroupNotificationPreference(
  userId: string,
  groupId: string,
  key: keyof GroupNotificationPreferences,
  value: boolean,
): Promise<void> {
  if (!userId || !groupId) return;

  const userRef = firestore().collection(USERS_COLLECTION).doc(userId);

  await userRef.set(
    {
      notificationPreferences: {
        groups: {
          [groupId]: {
            [key]: value,
          },
        },
        updatedAt: firestore.FieldValue.serverTimestamp(),
      },
      updatedAt: firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

export async function ensureGroupNotificationDefaults(
  userId: string,
  groupId: string,
): Promise<void> {
  if (!userId || !groupId) return;

  const userRef = firestore().collection(USERS_COLLECTION).doc(userId);
  const defaultGroup = buildDefaultGroupNotificationPreferences();

  await userRef.set(
    {
      notificationPreferences: {
        globalEnabled: true,
        groups: {
          [groupId]: defaultGroup,
        },
        updatedAt: firestore.FieldValue.serverTimestamp(),
      },
      updatedAt: firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

export function makeNotificationPreferencesForNewUser(
  now: FirebaseFirestoreTypes.FieldValue,
) {
  return {
    globalEnabled: true,
    groups: {},
    updatedAt: now,
  };
}

export async function runNotificationPreferencesMigration(): Promise<{
  ok: boolean;
  usersProcessed: number;
  usersMigrated: number;
}> {
  const currentUser = auth().currentUser;
  if (!currentUser) {
    throw new Error('Debes iniciar sesión para ejecutar la migración.');
  }

  const projectId = firebase.app().options.projectId;
  if (!projectId) {
    throw new Error('No se pudo obtener el proyecto de Firebase para ejecutar la migración.');
  }

  const idToken = await currentUser.getIdToken();
  const endpoint = `https://${CLOUD_FUNCTIONS_REGION}-${projectId}.cloudfunctions.net/migrateUserNotificationPreferences`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ data: {} }),
  });

  const payload = (await response.json().catch(() => null)) as
    | { result?: unknown; data?: unknown; error?: { message?: string } }
    | null;

  if (!response.ok || payload?.error) {
    const backendMessage = payload?.error?.message;
    throw new Error(backendMessage || 'No se pudo ejecutar la migración.');
  }

  const data = (payload?.result ?? payload?.data ?? {}) as {
    ok?: boolean;
    usersProcessed?: number;
    usersMigrated?: number;
  };

  return {
    ok: Boolean(data.ok),
    usersProcessed: Number(data.usersProcessed ?? 0),
    usersMigrated: Number(data.usersMigrated ?? 0),
  };
}
