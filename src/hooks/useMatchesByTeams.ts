import { useState, useEffect, useMemo } from 'react';

import {
  subscribeToMatchesByTeamsByGroupId,
  type MatchByTeams,
} from '../repositories/matches/matchesByTeamsRepository';
import { subscribeToTeamsByGroupId, type Team } from '../repositories/teams/teamsRepository';
import {
  getGroupMembersV2ByGroupId,
  type GroupMemberV2,
} from '../repositories/groupMembersV2/groupMembersV2Repository';

export type { MatchByTeams, Team, GroupMemberV2 };

export function useMatchesByTeams(groupId: string | undefined) {
  const [allMatches, setAllMatches] = useState<MatchByTeams[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [groupMembers, setGroupMembers] = useState<GroupMemberV2[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | 'historico'>(
    new Date().getFullYear(),
  );

  // Subscribe to matches in real-time
  useEffect(() => {
    if (!groupId) {
      setAllMatches([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    const unsubscribe = subscribeToMatchesByTeamsByGroupId(
      groupId,
      matches => {
        setAllMatches(matches);
        setIsLoading(false);
      },
      err => {
        setError(err.message);
        setIsLoading(false);
      },
    );

    return () => unsubscribe();
  }, [groupId]);

  // Subscribe to teams in real-time so team names/colors/photos reflect latest data
  useEffect(() => {
    if (!groupId) {
      setTeams([]);
      return;
    }

    const unsubscribe = subscribeToTeamsByGroupId(
      groupId,
      setTeams,
      err => console.error('useMatchesByTeams: teams subscription error', err),
    );

    return () => unsubscribe();
  }, [groupId]);

  // Load group members once per group (one-time fetch is enough for display names)
  useEffect(() => {
    if (!groupId) {
      setGroupMembers([]);
      return;
    }

    getGroupMembersV2ByGroupId(groupId)
      .then(setGroupMembers)
      .catch(err => console.error('useMatchesByTeams: members fetch error', err));
  }, [groupId]);

  const teamsMap = useMemo(
    () => new Map(teams.map(t => [t.id, t])),
    [teams],
  );

  const filteredMatches = useMemo(() => {
    if (selectedYear === 'historico') return allMatches;
    return allMatches.filter(m => new Date(m.date).getFullYear() === selectedYear);
  }, [allMatches, selectedYear]);

  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const options: Array<{ value: number | 'historico'; label: string }> = [
      { value: 'historico', label: 'Histórico' },
    ];
    for (let y = currentYear; y >= 2025; y--) {
      options.push({ value: y, label: y.toString() });
    }
    return options;
  }, []);

  return {
    matches: filteredMatches,
    allMatches,
    teams,
    teamsMap,
    groupMembers,
    isLoading,
    error,
    selectedYear,
    setSelectedYear,
    yearOptions,
  };
}
