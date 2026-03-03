import { useState, useEffect, useMemo } from 'react';

import {
  subscribeToMatchesByChallengeByGroupId,
  type ChallengeMatch,
} from '../repositories/matches/matchesByChallengeRepository';
import {
  getGroupMembersV2ByGroupId,
  type GroupMemberV2,
} from '../repositories/groupMembersV2/groupMembersV2Repository';

export type { ChallengeMatch, GroupMemberV2 };

export function useChallengeMatches(groupId: string | undefined) {
  const [allMatches, setAllMatches] = useState<ChallengeMatch[]>([]);
  const [groupMembers, setGroupMembers] = useState<GroupMemberV2[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | 'historico'>(
    new Date().getFullYear(),
  );

  // Subscribe to challenge matches in real-time
  useEffect(() => {
    console.log(groupId)
    if (!groupId) {
      setAllMatches([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    const unsubscribe = subscribeToMatchesByChallengeByGroupId(
      groupId,
      matches => {
        console.log(matches)
        setAllMatches(matches);
        setIsLoading(false);
      },
      err => {
        console.log(err)
        setError(err.message);
        setIsLoading(false);
      },
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
      .catch(err => console.error('useChallengeMatches: members fetch error', err));
  }, [groupId]);

  const membersMap = useMemo(
    () => new Map(groupMembers.map(m => [m.id, m])),
    [groupMembers],
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
    groupMembers,
    membersMap,
    isLoading,
    error,
    selectedYear,
    setSelectedYear,
    yearOptions,
  };
}
