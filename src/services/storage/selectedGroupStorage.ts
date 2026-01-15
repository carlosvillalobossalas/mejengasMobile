import AsyncStorage from '@react-native-async-storage/async-storage';

const keyForUser = (userId: string) => `selectedGroupId:${userId}`;

export async function getStoredSelectedGroupId(
  userId: string,
): Promise<string | null> {
  const raw = await AsyncStorage.getItem(keyForUser(userId));
  const trimmed = raw?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

export async function setStoredSelectedGroupId(
  userId: string,
  groupId: string | null,
): Promise<void> {
  const key = keyForUser(userId);

  if (!groupId) {
    await AsyncStorage.removeItem(key);
    return;
  }

  await AsyncStorage.setItem(key, groupId);
}
