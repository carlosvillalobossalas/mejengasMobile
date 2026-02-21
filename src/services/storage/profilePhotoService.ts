import storage from '@react-native-firebase/storage';
import firestore from '@react-native-firebase/firestore';

import { updatePhotoUrlByUserId } from '../../repositories/groupMembersV2/groupMembersV2Repository';

/**
 * Each user has exactly one profile photo stored at this fixed path.
 * Uploading a new photo overwrites the previous one automatically —
 * no manual deletion needed, no orphaned files accumulate.
 */
const getProfilePhotoRef = (userId: string) =>
  storage().ref(`profile-photos/${userId}/photo`);

/**
 * Uploads a local image URI to Firebase Storage and updates the user's
 * photoURL in Firestore. Returns the new download URL.
 */
export async function uploadProfilePhoto(
  userId: string,
  localUri: string,
): Promise<string> {
  const ref = getProfilePhotoRef(userId);

  // putFile handles the upload; uploading to the same ref replaces the existing file.
  await ref.putFile(localUri);

  const downloadURL = await ref.getDownloadURL();

  // Update the users collection first — this is the primary write.
  await firestore()
    .collection('users')
    .doc(userId)
    .set(
      {
        photoURL: downloadURL,
        updatedAt: firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

  // Update groupMembers_v2 as a secondary write — failure here should not
  // block or undo the profile update above.
  updatePhotoUrlByUserId(userId, downloadURL).catch(err =>
    console.error('Error updating groupMembers_v2 photoUrl:', err),
  );

  return downloadURL;
}

/**
 * Deletes the user's profile photo from Firebase Storage.
 * Safe to call even if the user never uploaded a photo — the error is
 * swallowed so account deletion is never blocked by a missing file.
 */
export async function deleteProfilePhoto(userId: string): Promise<void> {
  try {
    const ref = getProfilePhotoRef(userId);
    await ref.delete();
  } catch (err: unknown) {
    // storage/object-not-found means the user never uploaded a photo — not an error.
    const code = (err as { code?: string }).code;
    if (code !== 'storage/object-not-found') {
      console.error('Error deleting profile photo from storage:', err);
    }
  }
}
