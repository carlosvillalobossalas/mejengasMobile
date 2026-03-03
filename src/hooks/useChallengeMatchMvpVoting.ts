import { useState, useEffect, useCallback } from 'react';
import { FirebaseFirestoreTypes } from '@react-native-firebase/firestore';

import { castMvpVoteByChallengeMatch } from '../repositories/matches/matchesByChallengeRepository';
import { getGroupMemberV2ByUserId } from '../repositories/groupMembersV2/groupMembersV2Repository';

export type VotableChallengeMatch = {
  mvpVoting: {
    status: string;
    closesAt: FirebaseFirestoreTypes.Timestamp | null;
  } | null;
  mvpVotes: Record<string, string>;
  players: Array<{ groupMemberId: string }>;
};

export type UseChallengeMatchMvpVotingReturn = {
  currentUserGroupMemberId: string | null;
  canVoteInMatch: (match: VotableChallengeMatch) => boolean;
  castVote: (matchId: string, votedGroupMemberId: string) => Promise<void>;
  isVoting: boolean;
  voteError: string | null;
  clearVoteError: () => void;
};

export function useChallengeMatchMvpVoting(
  selectedGroupId: string | null,
  userId: string | null,
): UseChallengeMatchMvpVotingReturn {
  const [currentUserGroupMemberId, setCurrentUserGroupMemberId] = useState<string | null>(null);
  const [isVoting, setIsVoting] = useState(false);
  const [voteError, setVoteError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedGroupId || !userId) {
      setCurrentUserGroupMemberId(null);
      return;
    }
    getGroupMemberV2ByUserId(selectedGroupId, userId)
      .then(member => setCurrentUserGroupMemberId(member?.id ?? null))
      .catch(() => setCurrentUserGroupMemberId(null));
  }, [selectedGroupId, userId]);

  const canVoteInMatch = useCallback(
    (match: VotableChallengeMatch): boolean => {
      if (!currentUserGroupMemberId) return false;
      if (match.mvpVoting?.status !== 'open') return false;
      if (!match.mvpVoting.closesAt) return false;
      if (match.mvpVoting.closesAt.toMillis() <= Date.now()) return false;
      // Only group's own players can vote
      return match.players.some(p => p.groupMemberId === currentUserGroupMemberId);
    },
    [currentUserGroupMemberId],
  );

  const castVote = useCallback(
    async (matchId: string, votedGroupMemberId: string): Promise<void> => {
      if (!currentUserGroupMemberId) {
        throw new Error('No se encontró tu perfil de jugador en este grupo');
      }
      setIsVoting(true);
      setVoteError(null);
      try {
        await castMvpVoteByChallengeMatch(matchId, currentUserGroupMemberId, votedGroupMemberId);
      } catch (err) {
        const msg = (err as Error).message ?? 'Error al registrar el voto';
        setVoteError(msg);
        throw err;
      } finally {
        setIsVoting(false);
      }
    },
    [currentUserGroupMemberId],
  );

  const clearVoteError = useCallback(() => setVoteError(null), []);

  return {
    currentUserGroupMemberId,
    canVoteInMatch,
    castVote,
    isVoting,
    voteError,
    clearVoteError,
  };
}
