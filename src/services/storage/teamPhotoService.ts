import { Platform } from 'react-native';
import storage from '@react-native-firebase/storage';

/**
 * Each team has exactly one photo stored at this fixed path.
 * Uploading a new photo overwrites the previous one — no manual deletion
 * needed, no orphaned files accumulate.
 */
const getTeamPhotoRef = (teamId: string) =>
  storage().ref(`team-photos/${teamId}/photo`);

/**
 * Uploads a local image URI to Firebase Storage.
 * Always uses the same path per team, so the old photo is replaced automatically.
 * Returns the public download URL.
 */
export async function uploadTeamPhoto(
  teamId: string,
  localUri: string,
): Promise<string> {
  const ref = getTeamPhotoRef(teamId);

  // On iOS the picker may return a ph:// URI; normalise to file://
  const normalizedUri =
    Platform.OS === 'ios' && !localUri.startsWith('file://')
      ? `file://${localUri}`
      : localUri;

  await ref.putFile(normalizedUri);
  return ref.getDownloadURL();
}

/**
 * Deletes the team photo from Firebase Storage.
 * Safe to call even if no photo was ever uploaded.
 */
export async function deleteTeamPhoto(teamId: string): Promise<void> {
  try {
    await getTeamPhotoRef(teamId).delete();
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code !== 'storage/object-not-found') {
      console.error('Error deleting team photo:', err);
    }
  }
}
