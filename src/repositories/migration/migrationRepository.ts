import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

// ─── Collection names ───────────────────────────────────────────────────────
export const OLD_MATCHES_COLLECTION = 'Matches';
export const OLD_PLAYERS_COLLECTION = 'Players';
export const GROUP_MEMBERS_V2_COLLECTION = 'groupMembers_v2';
export const NEW_MATCHES_COLLECTION = 'matches';
export const SEASON_STATS_COLLECTION = 'seasonStats';

// ─── Types ───────────────────────────────────────────────────────────────────

export type OldMatchPlayer = {
  id: string;
  position?: string;
  goals: number;
  assists: number;
  ownGoals: number;
};

export type OldMatch = {
  id: string;
  groupId: string;
  date: FirebaseFirestoreTypes.Timestamp | string | null;
  goalsTeam1: number;
  goalsTeam2: number;
  players1: OldMatchPlayer[];
  players2: OldMatchPlayer[];
  mvpPlayerId: string | null;
};

export type GroupMemberV2Input = {
  groupId: string;
  legacyPlayerId: string;
  userId: null;
  displayName: string;
  photoUrl: string | null; 
  isGuest: true;
  role: 'member';
};

export type NewMatchPlayerInput = {
  groupMemberId: string;
  position: string;
  goals: number;
  assists: number;
  ownGoals: number;
};

export type NewMatchInput = {
  legacyMatchId: string;
  groupId: string;
  date: FirebaseFirestoreTypes.Timestamp | string | null;
  goalsTeam1: number;
  goalsTeam2: number;
  players1: NewMatchPlayerInput[];
  players2: NewMatchPlayerInput[];
  mvpGroupMemberId: string | null;
};

export type PlayerStatsAcc = {
  matches: number;
  goals: number;
  assists: number;
  ownGoals: number;
  mvps: number;
  won: number;
  lost: number;
  draw: number;
};

export type GoalkeeperStatsAcc = {
  matches: number;
  goalsConceded: number;
  cleanSheets: number;
  goals: number;
  assists: number;
  ownGoals: number;
  mvps: number;
  won: number;
  lost: number;
  draw: number;
};

export type SeasonStatsInput = {
  groupId: string;
  season: number;
  groupMemberId: string;
  playerStats: PlayerStatsAcc;
  goalkeeperStats: GoalkeeperStatsAcc;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const BATCH_SIZE = 400;

const chunk = <T>(items: T[], size: number): T[][] => {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
};

export function extractSeasonFromDate(
  date: FirebaseFirestoreTypes.Timestamp | string | null,
): number {
  if (!date) return new Date().getFullYear();
  try {
    if (typeof date === 'object' && typeof (date as FirebaseFirestoreTypes.Timestamp).toDate === 'function') {
      return (date as FirebaseFirestoreTypes.Timestamp).toDate().getFullYear();
    }
    if (typeof date === 'string') {
      return new Date(date).getFullYear();
    }
  } catch {
    // fall through to default
  }
  return new Date().getFullYear();
}

// ─── Read old data ────────────────────────────────────────────────────────────

export async function readAllOldMatches(): Promise<OldMatch[]> {
  const snapshot = await firestore().collection(OLD_MATCHES_COLLECTION).get();
  return snapshot.docs.map(doc => {
    const data = doc.data() as Record<string, unknown>;
    const mapPlayers = (raw: unknown): OldMatchPlayer[] => {
      if (!Array.isArray(raw)) return [];
      return raw
        .filter((p): p is Record<string, unknown> => typeof p === 'object' && p !== null)
        .map(p => ({
          id: String(p.id ?? p.playerId ?? ''),
          position: p.position ? String(p.position) : undefined,
          goals: Number(p.goals ?? 0),
          assists: Number(p.assists ?? 0),
          ownGoals: Number(p.ownGoals ?? 0),
        }));
    };
    return {
      id: doc.id,
      groupId: String(data.groupId ?? ''),
      date: (data.date as FirebaseFirestoreTypes.Timestamp | string | null) ?? null,
      goalsTeam1: Number(data.goalsTeam1 ?? 0),
      goalsTeam2: Number(data.goalsTeam2 ?? 0),
      players1: mapPlayers(data.players1),
      players2: mapPlayers(data.players2),
      mvpPlayerId: data.mvpPlayerId ? String(data.mvpPlayerId) : null,
    };
  });
}

export async function readPlayersByIds(
  playerIds: string[],
): Promise<Map<string, { name: string; photoUrl: string | null; userId: string | null }>> {
  const result = new Map<string, { name: string; photoUrl: string | null; userId: string | null }>();
  if (playerIds.length === 0) return result;

  const batches = chunk(playerIds, 10);
  await Promise.all(
    batches.map(async batch => {
      const snap = await firestore()
        .collection(OLD_PLAYERS_COLLECTION)
        .where(firestore.FieldPath.documentId(), 'in', batch)
        .get();
      snap.docs.forEach(doc => {
        const d = doc.data() as Record<string, unknown>;
        result.set(doc.id, {
          name: String(d.name ?? d.originalName ?? 'Jugador'),
          photoUrl: d.photoURL ? String(d.photoURL) : null,
          userId: d.userId ? String(d.userId) : null,
        });
      });
    }),
  );
  return result;
}

// ─── Read new collections ──────────────────────────────────────────────────

/**
 * Builds a multi-key lookup map from existing groupMembers_v2 documents.
 * Entries:
 *   pid:{groupId}|{legacyPlayerId}   → memberId  (legacyPlayerId + legacyPlayerIds[])
 *   uid:{groupId}|{userId}           → memberId  (if userId non-empty)
 *   dname:{groupId}|{normalizedName} → memberId
 */
export async function buildMemberLookupMap(): Promise<Map<string, string>> {
  const snap = await firestore().collection(GROUP_MEMBERS_V2_COLLECTION).get();
  const map = new Map<string, string>();
  snap.docs.forEach(doc => {
    const d = doc.data() as Record<string, unknown>;
    const groupId = String(d.groupId ?? '');
    const memberId = doc.id;

    // Primary legacyPlayerId (single string)
    if (d.legacyPlayerId) {
      map.set(`pid:${groupId}|${d.legacyPlayerId}`, memberId);
    }
    // Additional legacyPlayerIds (array — populated when deduplication finds the same physical player)
    if (Array.isArray(d.legacyPlayerIds)) {
      (d.legacyPlayerIds as string[]).forEach(pid => {
        map.set(`pid:${groupId}|${pid}`, memberId);
      });
    }
    // userId-based key
    if (d.userId && String(d.userId).trim()) {
      map.set(`uid:${groupId}|${d.userId}`, memberId);
    }
    // Normalized display name
    if (d.displayName) {
      const normalized = String(d.displayName).trim().toLowerCase();
      if (normalized) map.set(`dname:${groupId}|${normalized}`, memberId);
    }
  });
  return map;
}

/**
 * Appends an additional legacyPlayerId to an existing groupMember_v2 document.
 * Called when the same physical player is found via userId or name match
 * so that future buildMemberLookupMap() calls can find them by pid too.
 */
export async function appendLegacyPlayerIdToMember(
  memberId: string,
  legacyPlayerId: string,
): Promise<void> {
  const ref = firestore().collection(GROUP_MEMBERS_V2_COLLECTION).doc(memberId);
  await ref.update({
    legacyPlayerIds: firestore.FieldValue.arrayUnion(legacyPlayerId),
    updatedAt: firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * Returns the set of legacy match IDs already migrated
 */
export async function getExistingMigratedMatchIds(): Promise<Set<string>> {
  const snap = await firestore().collection(NEW_MATCHES_COLLECTION).get();
  const ids = new Set<string>();
  snap.docs.forEach(doc => {
    const legacy = (doc.data() as Record<string, unknown>).legacyMatchId;
    if (typeof legacy === 'string' && legacy) ids.add(legacy);
  });
  return ids;
}

export async function readAllNewMatches(): Promise<
  Array<{
    groupId: string;
    date: FirebaseFirestoreTypes.Timestamp | string | null;
    goalsTeam1: number;
    goalsTeam2: number;
    players1: NewMatchPlayerInput[];
    players2: NewMatchPlayerInput[];
    mvpGroupMemberId: string | null;
  }>
> {
  const snap = await firestore().collection(NEW_MATCHES_COLLECTION).get();
  return snap.docs.map(doc => {
    const d = doc.data() as Record<string, unknown>;
    const mapPlayers = (raw: unknown): NewMatchPlayerInput[] => {
      if (!Array.isArray(raw)) return [];
      return raw
        .filter((p): p is Record<string, unknown> => typeof p === 'object' && p !== null)
        .map(p => ({
          groupMemberId: String(p.groupMemberId ?? ''),
          position: String(p.position ?? 'DEF'),
          goals: Number(p.goals ?? 0),
          assists: Number(p.assists ?? 0),
          ownGoals: Number(p.ownGoals ?? 0),
        }));
    };
    return {
      groupId: String(d.groupId ?? ''),
      date: (d.date as FirebaseFirestoreTypes.Timestamp | string | null) ?? null,
      goalsTeam1: Number(d.goalsTeam1 ?? 0),
      goalsTeam2: Number(d.goalsTeam2 ?? 0),
      players1: mapPlayers(d.players1),
      players2: mapPlayers(d.players2),
      mvpGroupMemberId: d.mvpGroupMemberId ? String(d.mvpGroupMemberId) : null,
    };
  });
}

// ─── Write new collections ─────────────────────────────────────────────────

export async function writeGroupMembersV2Batch(
  members: GroupMemberV2Input[],
): Promise<Array<{ member: GroupMemberV2Input; memberId: string }>> {
  if (members.length === 0) return [];
  const results: Array<{ member: GroupMemberV2Input; memberId: string }> = [];
  const batches = chunk(members, BATCH_SIZE);
  for (const batchItems of batches) {
    const batch = firestore().batch();
    batchItems.forEach(member => {
      const ref = firestore().collection(GROUP_MEMBERS_V2_COLLECTION).doc();
      batch.set(ref, {
        ...member,
        createdAt: firestore.FieldValue.serverTimestamp(),
        updatedAt: firestore.FieldValue.serverTimestamp(),
      });
      results.push({ member, memberId: ref.id });
    });
    await batch.commit();
  }
  return results;
}

export async function writeNewMatchesBatch(
  matches: NewMatchInput[],
): Promise<number> {
  if (matches.length === 0) return 0;
  const batches = chunk(matches, BATCH_SIZE);
  for (const batchItems of batches) {
    const batch = firestore().batch();
    batchItems.forEach(match => {
      const ref = firestore().collection(NEW_MATCHES_COLLECTION).doc();
      batch.set(ref, {
        ...match,
        createdAt: firestore.FieldValue.serverTimestamp(),
        updatedAt: firestore.FieldValue.serverTimestamp(),
      });
    });
    await batch.commit();
  }
  return matches.length;
}

export async function writeSeasonStatsBatch(
  stats: SeasonStatsInput[],
): Promise<number> {
  if (stats.length === 0) return 0;
  const batches = chunk(stats, BATCH_SIZE);
  for (const batchItems of batches) {
    const batch = firestore().batch();
    batchItems.forEach(s => {
      // Document ID: {groupId}_{season}_{groupMemberId}
      const docId = `${s.groupId}_${s.season}_${s.groupMemberId}`;
      const ref = firestore().collection(SEASON_STATS_COLLECTION).doc(docId);
      batch.set(ref, {
        ...s,
        createdAt: firestore.FieldValue.serverTimestamp(),
        updatedAt: firestore.FieldValue.serverTimestamp(),
      });
    });
    await batch.commit();
  }
  return stats.length;
}
