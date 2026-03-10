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

export function useMatchesByTeams(groupIds: string[]) {
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
    if (groupIds.length === 0) {
      setAllMatches([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    const matchesByGroup = new Map<string, MatchByTeams[]>();
    const unsubscribers = groupIds.map(groupId =>
      subscribeToMatchesByTeamsByGroupId(
        groupId,
        matches => {
          matchesByGroup.set(groupId, matches);
          const merged = Array.from(matchesByGroup.values())
            .flat()
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          setAllMatches(merged);
          setIsLoading(false);
        },
        err => {
          setError(err.message);
          setIsLoading(false);
        },
      ),
    );

    return () => {
      unsubscribers.forEach(unsubscribe => unsubscribe());
    };
  }, [groupIds]);

  // Subscribe to teams in real-time so team names/colors/photos reflect latest data
  useEffect(() => {
    if (groupIds.length === 0) {
      setTeams([]);
      return;
    }

    const teamsByGroup = new Map<string, Team[]>();
    const unsubscribers = groupIds.map(groupId =>
      subscribeToTeamsByGroupId(
        groupId,
        nextTeams => {
          teamsByGroup.set(groupId, nextTeams);
          const merged = Array.from(teamsByGroup.values()).flat();
          const unique = new Map<string, Team>();
          merged.forEach(team => unique.set(team.id, team));
          setTeams(Array.from(unique.values()));
        },
        err => console.error('useMatchesByTeams: teams subscription error', err),
      ),
    );

    return () => {
      unsubscribers.forEach(unsubscribe => unsubscribe());
    };
  }, [groupIds]);

  // Load group members once per group (one-time fetch is enough for display names)
  useEffect(() => {
    if (groupIds.length === 0) {
      setGroupMembers([]);
      return;
    }

    Promise.all(groupIds.map(groupId => getGroupMembersV2ByGroupId(groupId)))
      .then(rows => {
        const merged = rows.flat();
        const unique = new Map<string, GroupMemberV2>();
        merged.forEach(member => unique.set(member.id, member));
        setGroupMembers(Array.from(unique.values()));
      })
      .catch(err => console.error('useMatchesByTeams: members fetch error', err));
  }, [groupIds]);

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
