import firestore from '@react-native-firebase/firestore';
import { User } from '../../repositories/users/usersRepository';
import { Player } from '../../repositories/players/playerSeasonStatsRepository';

export type UserSearchResult = {
  type: 'user';
  id: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  userId: string;
};

export type PlayerSearchResult = {
  type: 'player';
  id: string;
  name: string;
  originalName?: string;
  photoURL?: string;
  playerId: string;
};

export type SearchResult = UserSearchResult | PlayerSearchResult;

const USERS_COLLECTION = 'users';
const PLAYERS_COLLECTION = 'Players';

/**
 * Search across users (by displayName/email) and players (by name/originalName)
 * @param searchTerm Term to search for
 * @param limit Maximum number of results to return
 */
export async function searchUsersAndPlayers(
  searchTerm: string,
  limit: number = 10,
): Promise<SearchResult[]> {
  if (!searchTerm || searchTerm.trim().length < 2) {
    return [];
  }

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const results: SearchResult[] = [];

  // Search in users collection (by displayName or email)
  const usersSnapshot = await firestore()
    .collection(USERS_COLLECTION)
    .limit(50)
    .get();

  usersSnapshot.docs.forEach(doc => {
    const data = doc.data() as Partial<User>;
    const displayName = data.displayName || '';
    const email = data.email || '';

    const matchesDisplayName = displayName.toLowerCase().includes(normalizedSearch);
    const matchesEmail = email.toLowerCase().includes(normalizedSearch);

    if (matchesDisplayName || matchesEmail) {
      results.push({
        type: 'user',
        id: doc.id,
        displayName: data.displayName || null,
        email: data.email || null,
        photoURL: data.photoURL || null,
        userId: String(data.uid || doc.id),
      });
    }
  });

  // Search in Players collection (by name or originalName)
  const playersSnapshot = await firestore()
    .collection(PLAYERS_COLLECTION)
    .limit(50)
    .get();

  playersSnapshot.docs.forEach(doc => {
    const data = doc.data() as Partial<Player>;
    const name = data.name || '';
    const originalName = data.originalName || '';

    const matchesName = name.toLowerCase().includes(normalizedSearch);
    const matchesOriginalName = originalName.toLowerCase().includes(normalizedSearch);

    if (matchesName || matchesOriginalName) {
      // Check if this player is already represented by a user result
      const isDuplicate = results.some(result => {
        if (result.type !== 'user') return false;

        // Check if player name matches user email or displayName
        const nameMatchesEmail = name.toLowerCase() === (result.email || '').toLowerCase();
        const nameMatchesDisplayName = name.toLowerCase() === (result.displayName || '').toLowerCase();
        const originalNameMatchesEmail = originalName.toLowerCase() === (result.email || '').toLowerCase();
        const originalNameMatchesDisplayName = originalName.toLowerCase() === (result.displayName || '').toLowerCase();

        // Check if player is linked to this user
        const isLinkedToUser = data.userId && data.userId === result.userId;

        return nameMatchesEmail || nameMatchesDisplayName || 
               originalNameMatchesEmail || originalNameMatchesDisplayName || 
               isLinkedToUser;
      });

      // Only add player if it's not a duplicate
      if (!isDuplicate) {
        results.push({
          type: 'player',
          id: doc.id,
          name: data.name || '',
          originalName: data.originalName,
          photoURL: data.photoURL,
          playerId: doc.id,
        });
      }
    }
  });

  // Sort results: users first, then players, then alphabetically
  results.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'user' ? -1 : 1;
    }

    const nameA = a.type === 'user' ? (a.displayName || '') : a.name;
    const nameB = b.type === 'user' ? (b.displayName || '') : b.name;

    return nameA.localeCompare(nameB);
  });

  return results.slice(0, limit);
}
