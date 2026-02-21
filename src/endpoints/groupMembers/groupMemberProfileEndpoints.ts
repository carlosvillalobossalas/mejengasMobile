import firestore, { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

import { getGroupsByIds, type Group } from '../../repositories/groups/groupsRepository';
import { type GroupMemberV2 } from '../../repositories/groupMembersV2/groupMembersV2Repository';
import { getUserById, type User } from '../../repositories/users/usersRepository';

const SEASON_STATS_COLLECTION = 'seasonStats';
const GROUP_MEMBERS_COLLECTION = 'groupMembers_v2';

// ─── Types ───────────────────────────────────────────────────────────────────

export type PlayerStatBlock = {
  matches: number;
  goals: number;
  assists: number;
  ownGoals: number;
  won: number;
  draw: number;
  lost: number;
  mvp: number;
};

export type GoalkeeperStatBlock = {
  matches: number;
  goalsConceded: number;
  cleanSheets: number;
  goals: number;
  assists: number;
  ownGoals: number;
  won: number;
  draw: number;
  lost: number;
  mvp: number;
};

/** A single card shown in the "Por Temporada" section. */
export type SeasonStatCard = {
  /** Unique key for React lists */
  id: string;
  season: number;
  group: Group | null;
  /** Whether this card shows goalkeeper or field-player stats */
  type: 'player' | 'goalkeeper';
  playerStats?: PlayerStatBlock;
  goalkeeperStats?: GoalkeeperStatBlock;
};

export type GroupMemberProfileData = {
  member: GroupMemberV2;
  seasonCards: SeasonStatCard[];
  historicPlayer: PlayerStatBlock;
  historicGoalkeeper: GoalkeeperStatBlock;
  hasPlayerStats: boolean;
  hasGoalkeeperStats: boolean;
};

/**
 * Aggregated profile data for a user across all their group memberships.
 * Uses the new seasonStats collection — no legacy Players/GoalkeeperSeasonStats.
 */
export type UserProfileData = {
  user: User;
  seasonCards: SeasonStatCard[];
  historicPlayer: PlayerStatBlock;
  historicGoalkeeper: GoalkeeperStatBlock;
  hasPlayerStats: boolean;
  hasGoalkeeperStats: boolean;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const toIsoString = (value: unknown): string | null => {
  if (!value) return null;
  if (typeof value === 'string') return value;
  const ts = value as Partial<FirebaseFirestoreTypes.Timestamp>;
  if (typeof ts.toDate === 'function') return ts.toDate().toISOString();
  return null;
};

const mapGroupMemberDoc = (doc: FirebaseFirestoreTypes.DocumentSnapshot): GroupMemberV2 => {
  const d = (doc.data() ?? {}) as Record<string, unknown>;
  return {
    id: doc.id,
    groupId: String(d.groupId ?? ''),
    userId: d.userId ? String(d.userId) : null,
    displayName: String(d.displayName ?? ''),
    photoUrl: d.photoUrl ? String(d.photoUrl) : null,
    isGuest: Boolean(d.isGuest ?? true),
    role: String(d.role ?? 'member'),
    legacyPlayerId: String(d.legacyPlayerId ?? ''),
    legacyPlayerIds: Array.isArray(d.legacyPlayerIds)
      ? (d.legacyPlayerIds as string[]).map(String)
      : [],
    createdAt: toIsoString(d.createdAt),
    updatedAt: toIsoString(d.updatedAt),
  };
};

const emptyPlayerStats = (): PlayerStatBlock => ({
  matches: 0,
  goals: 0,
  assists: 0,
  ownGoals: 0,
  won: 0,
  draw: 0,
  lost: 0,
  mvp: 0,
});

const emptyGoalkeeperStats = (): GoalkeeperStatBlock => ({
  matches: 0,
  goalsConceded: 0,
  cleanSheets: 0,
  goals: 0,
  assists: 0,
  ownGoals: 0,
  won: 0,
  draw: 0,
  lost: 0,
  mvp: 0,
});

// ─── Main endpoint ────────────────────────────────────────────────────────────

/**
 * Fetch full profile data for a groupMember_v2 using the seasonStats collection.
 *
 * - Returns null if the member document does not exist.
 * - Builds separate SeasonStatCards for goalkeeper and field-player roles
 *   (a member may have both in the same season).
 * - Aggregates historic totals separately for each role.
 */
export async function getGroupMemberProfileData(
  groupMemberId: string,
): Promise<GroupMemberProfileData | null> {
  // 1. Fetch the groupMember document
  const memberDoc = await firestore()
    .collection(GROUP_MEMBERS_COLLECTION)
    .doc(groupMemberId)
    .get();

  if (!memberDoc.exists) return null;

  const member = mapGroupMemberDoc(memberDoc);

  // 2. Fetch all seasonStats documents for this groupMember
  const statsSnap = await firestore()
    .collection(SEASON_STATS_COLLECTION)
    .where('groupMemberId', '==', groupMemberId)
    .get();

  if (statsSnap.empty) {
    return {
      member,
      seasonCards: [],
      historicPlayer: emptyPlayerStats(),
      historicGoalkeeper: emptyGoalkeeperStats(),
      hasPlayerStats: false,
      hasGoalkeeperStats: false,
    };
  }

  // 3. Collect unique group IDs and resolve group names
  const groupIds = [
    ...new Set(statsSnap.docs.map(d => String((d.data() as { groupId?: string }).groupId ?? ''))),
  ].filter(Boolean);

  const groupsMap = await getGroupsByIds(groupIds);

  // 4. Build season cards and accumulate historic totals
  const seasonCards: SeasonStatCard[] = [];
  const historicPlayer = emptyPlayerStats();
  const historicGoalkeeper = emptyGoalkeeperStats();

  statsSnap.docs.forEach(doc => {
    const d = doc.data() as {
      groupId: string;
      season: number;
      groupMemberId: string;
      playerStats?: Record<string, number>;
      goalkeeperStats?: Record<string, number>;
    };

    const { groupId, season, playerStats, goalkeeperStats } = d;
    const group = groupsMap.get(groupId) ?? null;

    // Field player card — only when the member played as field player this season
    if (playerStats && (playerStats.matches ?? 0) > 0) {
      const ps: PlayerStatBlock = {
        matches: playerStats.matches ?? 0,
        goals: playerStats.goals ?? 0,
        assists: playerStats.assists ?? 0,
        ownGoals: playerStats.ownGoals ?? 0,
        won: playerStats.won ?? 0,
        draw: playerStats.draw ?? 0,
        lost: playerStats.lost ?? 0,
        // Stored as 'mvps' (plural) in Firestore by the migration/save service
        mvp: playerStats.mvps ?? 0,
      };

      seasonCards.push({
        id: `${doc.id}_player`,
        season,
        group,
        type: 'player',
        playerStats: ps,
      });

      historicPlayer.matches += ps.matches;
      historicPlayer.goals += ps.goals;
      historicPlayer.assists += ps.assists;
      historicPlayer.ownGoals += ps.ownGoals;
      historicPlayer.won += ps.won;
      historicPlayer.draw += ps.draw;
      historicPlayer.lost += ps.lost;
      historicPlayer.mvp += ps.mvp;
    }

    // Goalkeeper card — only when the member played as goalkeeper this season
    if (goalkeeperStats && (goalkeeperStats.matches ?? 0) > 0) {
      const gs: GoalkeeperStatBlock = {
        matches: goalkeeperStats.matches ?? 0,
        goalsConceded: goalkeeperStats.goalsConceded ?? 0,
        cleanSheets: goalkeeperStats.cleanSheets ?? 0,
        goals: goalkeeperStats.goals ?? 0,
        assists: goalkeeperStats.assists ?? 0,
        ownGoals: goalkeeperStats.ownGoals ?? 0,
        won: goalkeeperStats.won ?? 0,
        draw: goalkeeperStats.draw ?? 0,
        lost: goalkeeperStats.lost ?? 0,
        // Stored as 'mvps' (plural) in Firestore
        mvp: goalkeeperStats.mvps ?? 0,
      };

      seasonCards.push({
        id: `${doc.id}_goalkeeper`,
        season,
        group,
        type: 'goalkeeper',
        goalkeeperStats: gs,
      });

      historicGoalkeeper.matches += gs.matches;
      historicGoalkeeper.goalsConceded += gs.goalsConceded;
      historicGoalkeeper.cleanSheets += gs.cleanSheets;
      historicGoalkeeper.goals += gs.goals;
      historicGoalkeeper.assists += gs.assists;
      historicGoalkeeper.ownGoals += gs.ownGoals;
      historicGoalkeeper.won += gs.won;
      historicGoalkeeper.draw += gs.draw;
      historicGoalkeeper.lost += gs.lost;
      historicGoalkeeper.mvp += gs.mvp;
    }
  });

  // 5. Sort: newest season first, then by group name, player cards before goalkeeper cards
  seasonCards.sort((a, b) => {
    if (b.season !== a.season) return b.season - a.season;
    const nameA = a.group?.name ?? '';
    const nameB = b.group?.name ?? '';
    if (nameA !== nameB) return nameA.localeCompare(nameB);
    return a.type === 'player' ? -1 : 1;
  });

  return {
    member,
    seasonCards,
    historicPlayer,
    historicGoalkeeper,
    hasPlayerStats: historicPlayer.matches > 0,
    hasGoalkeeperStats: historicGoalkeeper.matches > 0,
  };
}

/**
 * Fetch full profile data for the authenticated user across ALL their group memberships.
 *
 * - Finds every groupMembers_v2 record for the userId.
 * - Queries seasonStats for all those memberIds in a single batched request.
 * - Aggregates historic totals and builds SeasonStatCards.
 * - Returns null if the user doc does not exist.
 */
export async function getUserProfileData(userId: string): Promise<UserProfileData | null> {
  // 1. Fetch the User document
  const user = await getUserById(userId);
  if (!user) return null;

  // 2. Find all groupMembers_v2 linked to this user
  const membersSnap = await firestore()
    .collection(GROUP_MEMBERS_COLLECTION)
    .where('userId', '==', userId)
    .get();

  if (membersSnap.empty) {
    return {
      user,
      seasonCards: [],
      historicPlayer: emptyPlayerStats(),
      historicGoalkeeper: emptyGoalkeeperStats(),
      hasPlayerStats: false,
      hasGoalkeeperStats: false,
    };
  }

  const memberIds = membersSnap.docs.map(d => d.id);

  // 3. Query seasonStats for all memberIds — Firestore 'in' supports up to 30 items;
  //    chunk if the user belongs to more groups than that.
  const CHUNK_SIZE = 30;
  const chunks: string[][] = [];
  for (let i = 0; i < memberIds.length; i += CHUNK_SIZE) {
    chunks.push(memberIds.slice(i, i + CHUNK_SIZE));
  }

  const statsSnaps = await Promise.all(
    chunks.map(chunk =>
      firestore()
        .collection(SEASON_STATS_COLLECTION)
        .where('groupMemberId', 'in', chunk)
        .get(),
    ),
  );

  const allStatsDocs = statsSnaps.flatMap(s => s.docs);

  // 4. Collect unique group IDs and resolve them
  const groupIds = [
    ...new Set(
      allStatsDocs.map(d => String((d.data() as { groupId?: string }).groupId ?? '')),
    ),
  ].filter(Boolean);

  const groupsMap = await getGroupsByIds(groupIds);

  // 5. Build season cards and accumulate historic totals
  const seasonCards: SeasonStatCard[] = [];
  const historicPlayer = emptyPlayerStats();
  const historicGoalkeeper = emptyGoalkeeperStats();

  allStatsDocs.forEach(doc => {
    const d = doc.data() as {
      groupId: string;
      season: number;
      groupMemberId: string;
      playerStats?: Record<string, number>;
      goalkeeperStats?: Record<string, number>;
    };

    const { groupId, season, playerStats, goalkeeperStats } = d;
    const group = groupsMap.get(groupId) ?? null;

    if (playerStats && (playerStats.matches ?? 0) > 0) {
      const ps: PlayerStatBlock = {
        matches: playerStats.matches ?? 0,
        goals: playerStats.goals ?? 0,
        assists: playerStats.assists ?? 0,
        ownGoals: playerStats.ownGoals ?? 0,
        won: playerStats.won ?? 0,
        draw: playerStats.draw ?? 0,
        lost: playerStats.lost ?? 0,
        mvp: playerStats.mvps ?? 0,
      };
      seasonCards.push({ id: `${doc.id}_player`, season, group, type: 'player', playerStats: ps });
      historicPlayer.matches += ps.matches;
      historicPlayer.goals += ps.goals;
      historicPlayer.assists += ps.assists;
      historicPlayer.ownGoals += ps.ownGoals;
      historicPlayer.won += ps.won;
      historicPlayer.draw += ps.draw;
      historicPlayer.lost += ps.lost;
      historicPlayer.mvp += ps.mvp;
    }

    if (goalkeeperStats && (goalkeeperStats.matches ?? 0) > 0) {
      const gs: GoalkeeperStatBlock = {
        matches: goalkeeperStats.matches ?? 0,
        goalsConceded: goalkeeperStats.goalsConceded ?? 0,
        cleanSheets: goalkeeperStats.cleanSheets ?? 0,
        goals: goalkeeperStats.goals ?? 0,
        assists: goalkeeperStats.assists ?? 0,
        ownGoals: goalkeeperStats.ownGoals ?? 0,
        won: goalkeeperStats.won ?? 0,
        draw: goalkeeperStats.draw ?? 0,
        lost: goalkeeperStats.lost ?? 0,
        mvp: goalkeeperStats.mvps ?? 0,
      };
      seasonCards.push({ id: `${doc.id}_goalkeeper`, season, group, type: 'goalkeeper', goalkeeperStats: gs });
      historicGoalkeeper.matches += gs.matches;
      historicGoalkeeper.goalsConceded += gs.goalsConceded;
      historicGoalkeeper.cleanSheets += gs.cleanSheets;
      historicGoalkeeper.goals += gs.goals;
      historicGoalkeeper.assists += gs.assists;
      historicGoalkeeper.ownGoals += gs.ownGoals;
      historicGoalkeeper.won += gs.won;
      historicGoalkeeper.draw += gs.draw;
      historicGoalkeeper.lost += gs.lost;
      historicGoalkeeper.mvp += gs.mvp;
    }
  });

  // 6. Sort: newest season first, then by group name, player cards before goalkeeper cards
  seasonCards.sort((a, b) => {
    if (b.season !== a.season) return b.season - a.season;
    const nameA = a.group?.name ?? '';
    const nameB = b.group?.name ?? '';
    if (nameA !== nameB) return nameA.localeCompare(nameB);
    return a.type === 'player' ? -1 : 1;
  });

  return {
    user,
    seasonCards,
    historicPlayer,
    historicGoalkeeper,
    hasPlayerStats: historicPlayer.matches > 0,
    hasGoalkeeperStats: historicGoalkeeper.matches > 0,
  };
}
