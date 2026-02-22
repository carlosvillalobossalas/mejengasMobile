import { useState, useEffect, useCallback, useMemo } from 'react';

import { useAppSelector } from '../app/hooks';
import {
  subscribeToTeamsByGroupId,
  type Team,
  type TeamPlayer,
} from '../repositories/teams/teamsRepository';
import {
  subscribeToGroupMembersV2ByGroupId,
  type GroupMemberV2,
} from '../repositories/groupMembersV2/groupMembersV2Repository';
import { saveMatchByTeams } from '../services/matches/matchesByTeamsSaveService';

export type MatchPosition = 'POR' | 'DEF' | 'MED' | 'DEL';

export type MatchTeamPlayer = {
  groupMemberId: string;
  displayName: string;
  position: MatchPosition;
  goals: number;
  assists: number;
  ownGoals: number;
  /** True when the player entered the match as a substitute. */
  isSub: boolean;
};

/** Minimum squad size per group type. */
const REQUIRED_PLAYERS_BY_TYPE: Record<string, number> = {
  futbol_5: 5,
  futbol_7: 7,
  futbol_11: 11,
};

/**
 * Slots to fill per formation, in order.
 * Picks players whose defaultPosition matches each slot first;
 * any remaining unfilled slots are filled from whoever is left.
 */
const FORMATION_SLOTS: Record<string, MatchPosition[]> = {
  futbol_5:  ['POR', 'DEF', 'DEF', 'DEL', 'DEL'],
  futbol_7:  ['POR', 'DEF', 'DEF', 'DEF', 'MED', 'MED', 'DEL'],
  futbol_11: ['POR', 'DEF', 'DEF', 'DEF', 'DEF', 'MED', 'MED', 'MED', 'DEL', 'DEL', 'DEL'],
};

export function useAddMatchTeams() {
  const { selectedGroupId, groups } = useAppSelector(state => state.groups);
  const selectedGroup = groups.find(g => g.id === selectedGroupId);
  const requiredPlayersPerTeam =
    REQUIRED_PLAYERS_BY_TYPE[selectedGroup?.type ?? ''] ?? 5;

  const [availableTeams, setAvailableTeams] = useState<Team[]>([]);
  const [groupMembers, setGroupMembers] = useState<GroupMemberV2[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [selectedTeam1Id, setSelectedTeam1Id] = useState<string | null>(null);
  const [selectedTeam2Id, setSelectedTeam2Id] = useState<string | null>(null);
  const [team1Players, setTeam1Players] = useState<MatchTeamPlayer[]>([]);
  const [team2Players, setTeam2Players] = useState<MatchTeamPlayer[]>([]);
  // Full roster keeps ALL players in the team, not just the ones currently in the lineup
  const [team1FullRoster, setTeam1FullRoster] = useState<TeamPlayer[]>([]);
  const [team2FullRoster, setTeam2FullRoster] = useState<TeamPlayer[]>([]);
  const [date, setDate] = useState(new Date());

  // Subscribe to teams and group members with real-time Firestore listeners
  useEffect(() => {
    if (!selectedGroupId) return;

    setIsLoading(true);
    setError(null);

    // Track whether each listener has delivered its first snapshot
    let teamsReady = false;
    let membersReady = false;
    const checkDone = () => {
      if (teamsReady && membersReady) setIsLoading(false);
    };

    const unsubTeams = subscribeToTeamsByGroupId(
      selectedGroupId,
      teams => {
        setAvailableTeams(
          teams.filter(t => t.players.length >= requiredPlayersPerTeam),
        );
        teamsReady = true;
        checkDone();
      },
      () => {
        setError('Error al cargar los equipos');
        setIsLoading(false);
      },
    );

    const unsubMembers = subscribeToGroupMembersV2ByGroupId(
      selectedGroupId,
      members => {
        setGroupMembers(members);
        membersReady = true;
        checkDone();
      },
      () => {
        setError('Error al cargar los integrantes');
        setIsLoading(false);
      },
    );

    return () => {
      unsubTeams();
      unsubMembers();
    };
  }, [selectedGroupId, requiredPlayersPerTeam]);

  /** Map a team's roster to the initial match-player structure using formation slots.
   *  For each slot we first try to pick a roster player whose defaultPosition matches;
   *  any unfilled slots are filled from the remaining unassigned players. */
  const buildMatchPlayers = useCallback(
    (team: Team): MatchTeamPlayer[] => {
      const slots =
        FORMATION_SLOTS[selectedGroup?.type ?? ''] ??
        team.players.slice(0, requiredPlayersPerTeam).map(() => 'DEF' as MatchPosition);

      const remaining = [...team.players];
      const picked: Array<{ tp: TeamPlayer; assignedPosition: MatchPosition }> = [];

      for (const slot of slots) {
        const idx = remaining.findIndex(p => p.defaultPosition === slot);
        if (idx !== -1) {
          picked.push({ tp: remaining.splice(idx, 1)[0], assignedPosition: slot });
        } else {
          // No player with that position left — take the next available
          const fallback = remaining.shift();
          if (fallback) {
            picked.push({ tp: fallback, assignedPosition: slot });
          }
        }
      }

      return picked.map(({ tp, assignedPosition }) => ({
        groupMemberId: tp.groupMemberId,
        displayName:
          groupMembers.find(m => m.id === tp.groupMemberId)?.displayName ??
          tp.groupMemberId,
        position: assignedPosition,
        goals: 0,
        assists: 0,
        ownGoals: 0,
        isSub: false,
      }));
    },
    [groupMembers, requiredPlayersPerTeam, selectedGroup?.type],
  );

  // Score is derived automatically from player stats:
  // team goals = own goals scored + opponent own goals
  const goalsTeam1 = useMemo(
    () =>
      team1Players.reduce((sum, p) => sum + p.goals, 0) +
      team2Players.reduce((sum, p) => sum + p.ownGoals, 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(team1Players.map(p => p.goals)), JSON.stringify(team2Players.map(p => p.ownGoals))],
  );

  const goalsTeam2 = useMemo(
    () =>
      team2Players.reduce((sum, p) => sum + p.goals, 0) +
      team1Players.reduce((sum, p) => sum + p.ownGoals, 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(team2Players.map(p => p.goals)), JSON.stringify(team1Players.map(p => p.ownGoals))],
  );

  const selectTeam1 = useCallback(
    (teamId: string) => {
      setSelectedTeam1Id(teamId);
      const team = availableTeams.find(t => t.id === teamId);
      if (team) {
        setTeam1FullRoster(team.players);
        setTeam1Players(buildMatchPlayers(team));
      }
    },
    [availableTeams, buildMatchPlayers],
  );

  const selectTeam2 = useCallback(
    (teamId: string) => {
      setSelectedTeam2Id(teamId);
      const team = availableTeams.find(t => t.id === teamId);
      if (team) {
        setTeam2FullRoster(team.players);
        setTeam2Players(buildMatchPlayers(team));
      }
    },
    [availableTeams, buildMatchPlayers],
  );

  const updateTeam1Player = useCallback(
    (
      index: number,
      updates: Partial<Pick<MatchTeamPlayer, 'position' | 'goals' | 'assists' | 'ownGoals'>>,
    ) => {
      setTeam1Players(prev =>
        prev.map((p, i) => (i === index ? { ...p, ...updates } : p)),
      );
    },
    [],
  );

  const updateTeam2Player = useCallback(
    (
      index: number,
      updates: Partial<Pick<MatchTeamPlayer, 'position' | 'goals' | 'assists' | 'ownGoals'>>,
    ) => {
      setTeam2Players(prev =>
        prev.map((p, i) => (i === index ? { ...p, ...updates } : p)),
      );
    },
    [],
  );

  /** Build a fresh MatchTeamPlayer from a roster entry (resets stats to 0). */
  const buildSwapPlayer = useCallback(
    (tp: TeamPlayer): MatchTeamPlayer => ({
      groupMemberId: tp.groupMemberId,
      displayName:
        groupMembers.find(m => m.id === tp.groupMemberId)?.displayName ??
        tp.groupMemberId,
      position: tp.defaultPosition,
      goals: 0,
      assists: 0,
      ownGoals: 0,
      isSub: false,
    }),
    [groupMembers],
  );

  const swapTeam1Player = useCallback(
    (index: number, newGroupMemberId: string) => {
      const tp = team1FullRoster.find(p => p.groupMemberId === newGroupMemberId);
      if (!tp) return;
      // Preserve the isSub flag of the slot being replaced
      setTeam1Players(prev =>
        prev.map((p, i) => (i === index ? { ...buildSwapPlayer(tp), isSub: p.isSub } : p)),
      );
    },
    [team1FullRoster, buildSwapPlayer],
  );

  const swapTeam2Player = useCallback(
    (index: number, newGroupMemberId: string) => {
      const tp = team2FullRoster.find(p => p.groupMemberId === newGroupMemberId);
      if (!tp) return;
      // Preserve the isSub flag of the slot being replaced
      setTeam2Players(prev =>
        prev.map((p, i) => (i === index ? { ...buildSwapPlayer(tp), isSub: p.isSub } : p)),
      );
    },
    [team2FullRoster, buildSwapPlayer],
  );

  /** Add a substitute from the bench to team 1's lineup. */
  const addTeam1Sub = useCallback(
    (groupMemberId: string) => {
      const tp = team1FullRoster.find(p => p.groupMemberId === groupMemberId);
      if (!tp) return;
      setTeam1Players(prev => [...prev, { ...buildSwapPlayer(tp), isSub: true }]);
    },
    [team1FullRoster, buildSwapPlayer],
  );

  /** Add a substitute from the bench to team 2's lineup. */
  const addTeam2Sub = useCallback(
    (groupMemberId: string) => {
      const tp = team2FullRoster.find(p => p.groupMemberId === groupMemberId);
      if (!tp) return;
      setTeam2Players(prev => [...prev, { ...buildSwapPlayer(tp), isSub: true }]);
    },
    [team2FullRoster, buildSwapPlayer],
  );

  /** Clears all form selections so the screen starts fresh on next focus. */
  const resetForm = useCallback(() => {
    setSelectedTeam1Id(null);
    setSelectedTeam2Id(null);
    setTeam1Players([]);
    setTeam2Players([]);
    setTeam1FullRoster([]);
    setTeam2FullRoster([]);
    setDate(new Date());
  }, []);

  // Saves to matchesByTeams and atomically updates seasonStats + seasonStatsByTeams
  const handleSave = useCallback(async () => {
    if (!selectedGroupId || !selectedTeam1Id || !selectedTeam2Id) return;

    setSaveError(null);
    setIsSaving(true);
    try {
      await saveMatchByTeams({
        groupId: selectedGroupId,
        date,
        team1Id: selectedTeam1Id,
        team2Id: selectedTeam2Id,
        goalsTeam1,
        goalsTeam2,
        // Strip displayName — not stored in Firestore (derived from groupMembersV2)
        players1: team1Players.map(p => ({
          groupMemberId: p.groupMemberId,
          position: p.position,
          goals: p.goals,
          assists: p.assists,
          ownGoals: p.ownGoals,
          isSub: p.isSub,
        })),
        players2: team2Players.map(p => ({
          groupMemberId: p.groupMemberId,
          position: p.position,
          goals: p.goals,
          assists: p.assists,
          ownGoals: p.ownGoals,
          isSub: p.isSub,
        })),
      });
      resetForm();
    } catch {
      setSaveError('Error al guardar el partido. Intenta de nuevo.');
    } finally {
      setIsSaving(false);
    }
  }, [
    selectedGroupId,
    selectedTeam1Id,
    selectedTeam2Id,
    date,
    team1Players,
    team2Players,
    goalsTeam1,
    goalsTeam2,
    resetForm,
  ]);

  const selectedTeam1 = availableTeams.find(t => t.id === selectedTeam1Id) ?? null;
  const selectedTeam2 = availableTeams.find(t => t.id === selectedTeam2Id) ?? null;
  // Each selector only shows teams not already chosen in the other selector
  const availableForTeam1 = availableTeams.filter(t => t.id !== selectedTeam2Id);
  const availableForTeam2 = availableTeams.filter(t => t.id !== selectedTeam1Id);

  return {
    selectedGroup,
    requiredPlayersPerTeam,
    isLoading,
    isSaving,
    saveError,
    error,
    selectedTeam1,
    selectedTeam2,
    availableForTeam1,
    availableForTeam2,
    team1Players,
    team2Players,
    team1FullRoster,
    team2FullRoster,
    groupMembers,
    goalsTeam1,
    goalsTeam2,
    date,
    setDate,
    selectTeam1,
    selectTeam2,
    updateTeam1Player,
    updateTeam2Player,
    swapTeam1Player,
    swapTeam2Player,
    addTeam1Sub,
    addTeam2Sub,
    resetForm,
    handleSave,
  };
}
