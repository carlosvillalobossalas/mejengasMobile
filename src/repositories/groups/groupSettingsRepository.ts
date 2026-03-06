import firestore from '@react-native-firebase/firestore';
import { firebase } from '@react-native-firebase/app';
import auth from '@react-native-firebase/auth';

const GROUPS_COLLECTION = 'groups';
const CLOUD_FUNCTIONS_REGION = 'us-central1';

const normalizeHexColor = (value: string): string => {
  const raw = value.trim();
  if (!raw) return '#000000';
  const prefixed = raw.startsWith('#') ? raw : `#${raw}`;
  const normalized = prefixed.toUpperCase();
  const isValidHex = /^#[0-9A-F]{6}$/.test(normalized);
  return isValidHex ? normalized : '#000000';
};

export async function updateGroupSettings(params: {
  groupId: string;
  name: string;
  defaultTeam1Color: string;
  defaultTeam2Color: string;
}): Promise<void> {
  const { groupId, name, defaultTeam1Color, defaultTeam2Color } = params;
  if (!groupId) throw new Error('Grupo inválido.');
  if (!name.trim()) throw new Error('El nombre del grupo es obligatorio.');

  await firestore().collection(GROUPS_COLLECTION).doc(groupId).set(
    {
      name: name.trim(),
      defaultTeam1Color: normalizeHexColor(defaultTeam1Color),
      defaultTeam2Color: normalizeHexColor(defaultTeam2Color),
      updatedAt: firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

export async function runGroupDefaultKitColorsMigration(): Promise<{
  ok: boolean;
  groupsProcessed: number;
  groupsMigrated: number;
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
  const endpoint = `https://${CLOUD_FUNCTIONS_REGION}-${projectId}.cloudfunctions.net/migrateGroupDefaultKitColors`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ data: {} }),
  });

  const rawBody = await response.text();
  let payload: { result?: unknown; data?: unknown; error?: { message?: string } } | null = null;
  try {
    payload = rawBody ? (JSON.parse(rawBody) as { result?: unknown; data?: unknown; error?: { message?: string } }) : null;
  } catch {
    payload = null;
  }

  const parsedPayload = payload as
    | { result?: unknown; data?: unknown; error?: { message?: string } }
    | null;

  if (!response.ok || parsedPayload?.error) {
    const backendMessage = parsedPayload?.error?.message;
    const fallbackMessage = rawBody && rawBody.trim().length > 0
      ? rawBody
      : `HTTP ${response.status} ${response.statusText}`;
    throw new Error(backendMessage || fallbackMessage || 'No se pudo ejecutar la migración.');
  }

  const data = (parsedPayload?.result ?? parsedPayload?.data ?? {}) as {
    ok?: boolean;
    groupsProcessed?: number;
    groupsMigrated?: number;
  };

  return {
    ok: Boolean(data.ok),
    groupsProcessed: Number(data.groupsProcessed ?? 0),
    groupsMigrated: Number(data.groupsMigrated ?? 0),
  };
}
