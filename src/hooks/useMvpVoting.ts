import { useState, useEffect, useCallback } from 'react';

import {
  castMvpVote,
  type Match,
} from '../repositories/matches/matchesRepository';
import { getGroupMemberV2ByUserId } from '../repositories/groupMembersV2/groupMembersV2Repository';

export type UseMvpVotingReturn = {
  /** groupMemberId of the logged-in user in the currently selected group, null if not a member */
  currentUserGroupMemberId: string | null;
  /** True when the user is eligible to vote in a given match */
  canVoteInMatch: (match: Match) => boolean;
  /** Cast or overwrite the user's MVP vote */
  castVote: (matchId: string, votedGroupMemberId: string) => Promise<void>;
  isVoting: boolean;
  voteError: string | null;
  clearVoteError: () => void;
};

export function useMvpVoting(
  selectedGroupId: string | null,
  userId: string | null,
): UseMvpVotingReturn {
  const [currentUserGroupMemberId, setCurrentUserGroupMemberId] = useState<string | null>(null);
  const [isVoting, setIsVoting] = useState(false);
  const [voteError, setVoteError] = useState<string | null>(null);

  // Resolve the current user's groupMemberId whenever the group or user changes
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
    (match: Match): boolean => {
      if (!currentUserGroupMemberId) return false;
      if (match.mvpVoting?.status !== 'open') return false;
      if (!match.mvpVoting.closesAt) return false;
      // Voting window must still be open
      if (match.mvpVoting.closesAt.toMillis() <= Date.now()) return false;
      // User must have played in this match
      const participants = [
        ...match.players1.map(p => p.groupMemberId),
        ...match.players2.map(p => p.groupMemberId),
      ];
      return participants.includes(currentUserGroupMemberId);
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
        await castMvpVote(matchId, currentUserGroupMemberId, votedGroupMemberId);
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
