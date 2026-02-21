import {
  readAllOldMatches,
  readPlayersByIds,
  buildMemberLookupMap,
  appendLegacyPlayerIdToMember,
  getExistingMigratedMatchIds,
  readAllNewMatches,
  writeGroupMembersV2Batch,
  writeNewMatchesBatch,
  writeSeasonStatsBatch,
  extractSeasonFromDate,
  type GroupMemberV2Input,
  type NewMatchInput,
  type NewMatchPlayerInput,
  type PlayerStatsAcc,
  type GoalkeeperStatsAcc,
  type SeasonStatsInput,
} from '../../repositories/migration/migrationRepository';

// ─────────────────────────────────────────────────────────────────────────────
// Step 1: Migrate groupMembers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reads all old Matches, collects unique (groupId, playerId) pairs,
 * looks up player names from Players collection, and creates groupMembers_v2.
 * Safe to run multiple times — skips already-migrated players.
 */
export async function migrateGroupMembers(): Promise<{
  created: number;
  skipped: number;
}> {
  // 1. Read all old matches to discover all unique players per group
  const oldMatches = await readAllOldMatches();

  // 2. Collect unique (groupId, playerId) pairs
  const uniquePairs = new Map<string, { groupId: string; playerId: string }>();
  oldMatches.forEach(match => {
    const { groupId, players1, players2 } = match;
    if (!groupId) return;
    [...players1, ...players2].forEach(player => {
      if (!player.id) return;
      const key = `${groupId}_${player.id}`;
      if (!uniquePairs.has(key)) {
        uniquePairs.set(key, { groupId, playerId: player.id });
      }
    });
  });

  // 3. Load player info (name, photo, userId) from old Players collection
  const allPlayerIds = [...new Set([...uniquePairs.values()].map(p => p.playerId))];
  const playersMap = await readPlayersByIds(allPlayerIds);

  // 4. Build comprehensive lookup map from existing groupMembers_v2
  const lookupMap = await buildMemberLookupMap();

  // 5. For each pair, resolve via multiple deduplication keys (in priority order)
  const toCreate: GroupMemberV2Input[] = [];
  // Pairs resolved by uid/dname (not pid) — need the pid persisted in Firestore
  const toUpdatePid: Array<{ memberId: string; legacyPlayerId: string }> = [];
  let skipped = 0;

  uniquePairs.forEach(({ groupId, playerId }) => {
    const playerInfo = playersMap.get(playerId);
    const displayName = playerInfo?.name ?? 'Jugador';
    const userId = playerInfo?.userId ?? null;
    const normalizedName = displayName.trim().toLowerCase();

    // Priority 1: exact legacyPlayerId match (most stable)
    const byPid = lookupMap.get(`pid:${groupId}|${playerId}`);
    if (byPid) {
      skipped++;
      return;
    }

    // Priority 2: userId match (same user, different Player document)
    const byUid = userId ? lookupMap.get(`uid:${groupId}|${userId}`) : undefined;
    if (byUid) {
      // Persist the new pid so future runs find it directly by pid too
      toUpdatePid.push({ memberId: byUid, legacyPlayerId: playerId });
      // Register in-memory so subsequent lookups within this run resolve correctly
      lookupMap.set(`pid:${groupId}|${playerId}`, byUid);
      skipped++;
      return;
    }

    // Priority 3: normalized display name match
    const byName = normalizedName
      ? lookupMap.get(`dname:${groupId}|${normalizedName}`)
      : undefined;
    if (byName) {
      toUpdatePid.push({ memberId: byName, legacyPlayerId: playerId });
      lookupMap.set(`pid:${groupId}|${playerId}`, byName);
      skipped++;
      return;
    }

    // No match found — create new groupMember_v2
    toCreate.push({
      groupId,
      legacyPlayerId: playerId,
      userId: null,
      displayName,
      photoUrl: playerInfo?.photoUrl ?? null,
      isGuest: true,
      role: 'member',
    });
  });

  // 6. Persist new members and register them in the in-memory map
  const createdRefs = await writeGroupMembersV2Batch(toCreate);
  createdRefs.forEach(({ member, memberId }) => {
    lookupMap.set(`pid:${member.groupId}|${member.legacyPlayerId}`, memberId);
    const normalized = member.displayName.trim().toLowerCase();
    if (normalized) lookupMap.set(`dname:${member.groupId}|${normalized}`, memberId);
  });

  // 7. For deduped members resolved by uid/dname: persist the extra pid in Firestore
  //    so the next run can find them by pid without falling back to uid/dname
  await Promise.all(
    toUpdatePid.map(({ memberId, legacyPlayerId }) =>
      appendLegacyPlayerIdToMember(memberId, legacyPlayerId),
    ),
  );

  return { created: createdRefs.length, skipped };
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 2: Migrate matches
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reads all old Matches, replaces playerIds with groupMemberIds,
 * and writes them to the new 'matches' collection.
 * Safe to run multiple times — skips already-migrated matches.
 */
export async function migrateMatches(): Promise<{
  created: number;
  skipped: number;
  errors: string[];
  warnings: string[];
}> {
  // 1. Rebuild the lookup map from groupMembers_v2
  const playerToMemberMap = await buildMemberLookupMap();

  // 2. Get already-migrated match IDs
  const existingMatchIds = await getExistingMigratedMatchIds();

  // 3. Read all old matches
  const oldMatches = await readAllOldMatches();

  const toCreate: NewMatchInput[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  let skipped = 0;

  oldMatches.forEach(match => {
    if (existingMatchIds.has(match.id)) {
      skipped++;
      return;
    }

    const { groupId } = match;

    // Returns the mapped players AND a validity flag.
    // valid=false if ANY player is missing a groupMemberId.
    const mapPlayers = (
      players: typeof match.players1,
    ): { mapped: NewMatchPlayerInput[]; valid: boolean } => {
      const mapped: NewMatchPlayerInput[] = [];
      let valid = true;

      players.forEach((player, idx) => {
        const groupMemberId =
          playerToMemberMap.get(`pid:${groupId}|${player.id}`) ?? '';

        if (!groupMemberId) {
          // Hard error: this entire match must be skipped to avoid corrupt data
          valid = false;
          errors.push(
            `Match ${match.id}: playerId "${player.id}" sin groupMember_v2 en grupo "${groupId}" — partido omitido`,
          );
          return;
        }

        const position =
          player.position && player.position.trim()
            ? player.position.trim().toUpperCase()
            : idx === 0
              ? 'POR'
              : 'DEF';

        mapped.push({
          groupMemberId,
          position,
          goals: player.goals,
          assists: player.assists,
          ownGoals: player.ownGoals,
        });
      });

      return { mapped, valid };
    };

    const team1 = mapPlayers(match.players1);
    const team2 = mapPlayers(match.players2);

    // If any player in either team is unresolvable, skip the entire match
    if (!team1.valid || !team2.valid) {
      return;
    }

    // Migrate mvpPlayerId → mvpGroupMemberId (soft warning: mvp cleared if not found)
    let mvpGroupMemberId: string | null = null;
    if (match.mvpPlayerId) {
      mvpGroupMemberId =
        playerToMemberMap.get(`pid:${groupId}|${match.mvpPlayerId}`) ?? null;
      if (!mvpGroupMemberId) {
        warnings.push(
          `Match ${match.id}: mvpPlayerId "${match.mvpPlayerId}" sin groupMember_v2 — mvp limpiado`,
        );
      }
    }

    toCreate.push({
      legacyMatchId: match.id,
      groupId,
      date: match.date,
      goalsTeam1: match.goalsTeam1,
      goalsTeam2: match.goalsTeam2,
      players1: team1.mapped,
      players2: team2.mapped,
      mvpGroupMemberId,
    });
  });

  const created = await writeNewMatchesBatch(toCreate);
  return { created, skipped, errors, warnings };
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 3: Generate seasonStats
// ─────────────────────────────────────────────────────────────────────────────

const emptyPlayerStats = (): PlayerStatsAcc => ({
  matches: 0,
  goals: 0,
  assists: 0,
  ownGoals: 0,
  mvps: 0,
  won: 0,
  lost: 0,
  draw: 0,
});

const emptyGoalkeeperStats = (): GoalkeeperStatsAcc => ({
  matches: 0,
  goalsConceded: 0,
  cleanSheets: 0,
  goals: 0,
  assists: 0,
  ownGoals: 0,
  mvps: 0,
  won: 0,
  lost: 0,
  draw: 0,
});

/**
 * Reads all new matches, aggregates stats per (groupId, season, groupMemberId),
 * and writes/overwrites the seasonStats collection.
 * Always recalculates from scratch to ensure correctness.
 */
export async function generateSeasonStats(): Promise<{
  created: number;
}> {
  // Read all new (migrated) matches
  const newMatches = await readAllNewMatches();

  // Accumulate stats in memory
  const statsMap = new Map<string, SeasonStatsInput>();

  const getOrCreate = (
    groupId: string,
    season: number,
    groupMemberId: string,
  ): SeasonStatsInput => {
    const key = `${groupId}_${season}_${groupMemberId}`;
    if (!statsMap.has(key)) {
      statsMap.set(key, {
        groupId,
        season,
        groupMemberId,
        playerStats: emptyPlayerStats(),
        goalkeeperStats: emptyGoalkeeperStats(),
      });
    }
    return statsMap.get(key)!;
  };

  newMatches.forEach(match => {
    const { groupId, goalsTeam1, goalsTeam2, mvpGroupMemberId, players1, players2 } = match;
    const season = extractSeasonFromDate(match.date);

    const team1Won = goalsTeam1 > goalsTeam2;
    const team2Won = goalsTeam2 > goalsTeam1;
    const isDraw = goalsTeam1 === goalsTeam2;

    const processTeam = (
      players: NewMatchPlayerInput[],
      isTeam1: boolean,
    ) => {
      // goalsConceded for the goalkeeper = goals scored by the rival team
      const rivalGoals = isTeam1 ? goalsTeam2 : goalsTeam1;
      const myTeamWon = isTeam1 ? team1Won : team2Won;

      players.forEach(player => {
        const { groupMemberId } = player;
        if (!groupMemberId) return;

        const acc = getOrCreate(groupId, season, groupMemberId);
        const isMVP = mvpGroupMemberId === groupMemberId;
        const isGoalkeeper = player.position === 'POR';

        if (isGoalkeeper) {
          // ── Goalkeeper stats ────────────────────────────────────────────
          acc.goalkeeperStats.matches++;
          // goalsConceded = final goals of the rival team
          acc.goalkeeperStats.goalsConceded += rivalGoals;
          if (rivalGoals === 0) acc.goalkeeperStats.cleanSheets++;
          acc.goalkeeperStats.goals += player.goals;
          acc.goalkeeperStats.assists += player.assists;
          acc.goalkeeperStats.ownGoals += player.ownGoals;
          if (isMVP) acc.goalkeeperStats.mvps++;
          if (myTeamWon) acc.goalkeeperStats.won++;
          else if (isDraw) acc.goalkeeperStats.draw++;
          else acc.goalkeeperStats.lost++;
        } else {
          // ── Field player stats ───────────────────────────────────────────
          acc.playerStats.matches++;
          acc.playerStats.goals += player.goals;
          acc.playerStats.assists += player.assists;
          acc.playerStats.ownGoals += player.ownGoals;
          if (isMVP) acc.playerStats.mvps++;
          if (myTeamWon) acc.playerStats.won++;
          else if (isDraw) acc.playerStats.draw++;
          else acc.playerStats.lost++;
        }
      });
    };

    processTeam(players1, true);
    processTeam(players2, false);
  });

  const allStats = [...statsMap.values()];
  const created = await writeSeasonStatsBatch(allStats);
  return { created };
}
