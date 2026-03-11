import { Platform } from 'react-native';
import storage from '@react-native-firebase/storage';

/**
 * Each group has exactly one photo stored at this fixed path.
 * Uploading a new photo overwrites the previous one — no manual deletion
 * needed, no orphaned files accumulate.
 */
const getGroupPhotoRef = (groupId: string) =>
  storage().ref(`group-photos/${groupId}/photo`);

/**
 * Uploads a local image URI to Firebase Storage.
 * Always uses the same path per group, so the old photo is replaced automatically.
 * Returns the public download URL.
 */
export async function uploadGroupPhoto(
  groupId: string,
  localUri: string,
): Promise<string> {
  const ref = getGroupPhotoRef(groupId);

  // On iOS the picker may return a ph:// URI; normalise to file://
  const normalizedUri =
    Platform.OS === 'ios' && !localUri.startsWith('file://')
      ? `file://${localUri}`
      : localUri;

  await ref.putFile(normalizedUri);
  return ref.getDownloadURL();
}

/**
 * Deletes the group photo from Firebase Storage.
 * Safe to call even if no photo was ever uploaded.
 */
export async function deleteGroupPhoto(groupId: string): Promise<void> {
  try {
    await getGroupPhotoRef(groupId).delete();
  } catch {
    // Ignore — photo may not exist
  }
}
