import { useState, useCallback } from 'react';
import { Alert, Platform } from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';

import { uploadProfilePhoto } from '../services/storage/profilePhotoService';
import { useAppDispatch } from '../app/hooks';
import { refreshFirestoreUser } from '../features/auth/authSlice';

type UseProfilePhotoResult = {
  isUploading: boolean;
  pickAndUpload: (userId: string) => Promise<void>;
};

export function useProfilePhoto(): UseProfilePhotoResult {
  const dispatch = useAppDispatch();
  const [isUploading, setIsUploading] = useState(false);

  const pickAndUpload = useCallback(async (userId: string) => {
    const result = await launchImageLibrary({
      mediaType: 'photo',
      quality: 0.8,
      // Resize to a reasonable max to avoid uploading huge files
      maxWidth: 800,
      maxHeight: 800,
      includeBase64: false,
    });

    if (result.didCancel || !result.assets?.length) {
      return;
    }

    const asset = result.assets[0];

    if (!asset.uri) {
      Alert.alert('Error', 'No se pudo obtener la imagen seleccionada');
      return;
    }

    // On Android the URI is already a file:// path; on iOS it may be a ph:// asset URI.
    // react-native-image-picker resolves it to a usable file URI automatically.
    const localUri =
      Platform.OS === 'ios' && !asset.uri.startsWith('file://')
        ? `file://${asset.uri}`
        : asset.uri;

    setIsUploading(true);
    try {
      await uploadProfilePhoto(userId, localUri);
      // Sync the new photoURL back into Redux so the avatar updates everywhere.
      await dispatch(refreshFirestoreUser());
    } catch (error) {
      console.error('Error uploading profile photo:', error);
      Alert.alert('Error', 'No se pudo subir la foto. Intentá de nuevo.');
    } finally {
      setIsUploading(false);
    }
  }, [dispatch]);

  return { isUploading, pickAndUpload };
}
