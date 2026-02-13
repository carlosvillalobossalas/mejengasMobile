import firestore from '@react-native-firebase/firestore';

const PLAYERS_COLLECTION = 'Players';

/**
 * Create a new player in the Players collection
 */
export async function createPlayer(groupId: string, playerName: string): Promise<string> {
  try {
    const docRef = await firestore().collection(PLAYERS_COLLECTION).add({
      groupId,
      name: playerName,
      originalName: playerName,
      userId: null,
      createdAt: firestore.FieldValue.serverTimestamp(),
      updatedAt: firestore.FieldValue.serverTimestamp(),
    });

    return docRef.id;
  } catch (error) {
    console.error('Error creating player:', error);
    throw error;
  }
}
