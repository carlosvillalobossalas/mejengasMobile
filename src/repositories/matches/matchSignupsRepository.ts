import firestore from '@react-native-firebase/firestore';

import { getGroupMemberV2ByUserId } from '../groupMembersV2/groupMembersV2Repository';

type TapResult = 'assigned' | 'moved' | 'unassigned' | 'noop';

type BasePlayer = {
  groupMemberId: string | null;
  position?: 'POR' | 'DEF' | 'MED' | 'DEL' | '';
  goals?: number;
  assists?: number;
  ownGoals?: number;
  isSub?: boolean;
};

type TeamKey = 1 | 2;

type PlayersState = {
  team1: BasePlayer[];
  team2: BasePlayer[];
};

const isIndexValid = (arr: unknown[], index: number): boolean => index >= 0 && index < arr.length;

const toPlayerArray = (value: unknown): BasePlayer[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null)
    .map(entry => ({
      groupMemberId: typeof entry.groupMemberId === 'string' && entry.groupMemberId.trim()
        ? entry.groupMemberId.trim()
        : null,
      position: (entry.position as BasePlayer['position']) ?? '',
      goals: Number(entry.goals ?? 0),
      assists: Number(entry.assists ?? 0),
      ownGoals: Number(entry.ownGoals ?? 0),
      isSub: Boolean(entry.isSub ?? false),
    }));
};

const getCurrentAssignment = (
  playersState: PlayersState,
  targetGroupMemberId: string,
): { team: TeamKey; index: number } | null => {
  const team1Index = playersState.team1.findIndex(player => player.groupMemberId === targetGroupMemberId);
  if (team1Index >= 0) return { team: 1, index: team1Index };

  const team2Index = playersState.team2.findIndex(player => player.groupMemberId === targetGroupMemberId);
  if (team2Index >= 0) return { team: 2, index: team2Index };

  return null;
};

const applyTapOnTeamSlots = (
  playersState: PlayersState,
  targetGroupMemberId: string,
  team: TeamKey,
  index: number,
): { nextState: PlayersState; result: TapResult } => {
  const source = team === 1 ? playersState.team1 : playersState.team2;
  if (index < 0 || index >= source.length) {
    return { nextState: playersState, result: 'noop' };
  }

  const targetSlot = source[index];
  const targetSlotMemberId = targetSlot.groupMemberId;
  const currentAssignment = getCurrentAssignment(playersState, targetGroupMemberId);

  if (targetSlotMemberId && targetSlotMemberId !== targetGroupMemberId) {
    return { nextState: playersState, result: 'noop' };
  }

  const nextState: PlayersState = {
    team1: [...playersState.team1],
    team2: [...playersState.team2],
  };

  if (targetSlotMemberId === targetGroupMemberId) {
    if (team === 1) {
      nextState.team1[index] = { ...nextState.team1[index], groupMemberId: null };
    } else {
      nextState.team2[index] = { ...nextState.team2[index], groupMemberId: null };
    }
    return { nextState, result: 'unassigned' };
  }

  if (currentAssignment) {
    if (currentAssignment.team === 1) {
      nextState.team1[currentAssignment.index] = {
        ...nextState.team1[currentAssignment.index],
        groupMemberId: null,
      };
    } else {
      nextState.team2[currentAssignment.index] = {
        ...nextState.team2[currentAssignment.index],
        groupMemberId: null,
      };
    }
  }

  if (team === 1) {
    nextState.team1[index] = { ...nextState.team1[index], groupMemberId: targetGroupMemberId };
  } else {
    nextState.team2[index] = { ...nextState.team2[index], groupMemberId: targetGroupMemberId };
  }

  return { nextState, result: currentAssignment ? 'moved' : 'assigned' };
};

const applyTapOnSingleTeamSlots = (
  players: BasePlayer[],
  targetGroupMemberId: string,
  index: number,
): { nextPlayers: BasePlayer[]; result: TapResult } => {
  if (index < 0 || index >= players.length) {
    return { nextPlayers: players, result: 'noop' };
  }

  const nextPlayers = [...players];
  const targetSlot = nextPlayers[index];
  const targetSlotMemberId = targetSlot.groupMemberId;

  if (targetSlotMemberId && targetSlotMemberId !== targetGroupMemberId) {
    return { nextPlayers: players, result: 'noop' };
  }

  const currentIndex = nextPlayers.findIndex(player => player.groupMemberId === targetGroupMemberId);

  if (targetSlotMemberId === targetGroupMemberId) {
    nextPlayers[index] = { ...nextPlayers[index], groupMemberId: null };
    return { nextPlayers, result: 'unassigned' };
  }

  if (currentIndex >= 0) {
    nextPlayers[currentIndex] = { ...nextPlayers[currentIndex], groupMemberId: null };
  }

  nextPlayers[index] = { ...nextPlayers[index], groupMemberId: targetGroupMemberId };
  return { nextPlayers, result: currentIndex >= 0 ? 'moved' : 'assigned' };
};

const resolveGroupMemberId = async (
  groupId: string,
  userId: string,
): Promise<string> => {
  const member = await getGroupMemberV2ByUserId(groupId, userId);
  if (!member?.id) {
    throw new Error('No se encontró tu perfil de jugador en este grupo.');
  }
  return member.id;
};

export async function tapScheduledSlotInMatch(params: {
  matchId: string;
  userId: string;
  team: TeamKey;
  slotIndex: number;
}): Promise<TapResult> {
  const { matchId, userId, team, slotIndex } = params;
  const matchRef = firestore().collection('matches').doc(matchId);

  const doc = await matchRef.get();
  if (!doc.exists) throw new Error('Partido no encontrado.');

  const data = (doc.data() ?? {}) as Record<string, unknown>;
  const groupId = String(data.groupId ?? '').trim();
  if (!groupId) throw new Error('Partido inválido.');

  const groupMemberId = await resolveGroupMemberId(groupId, userId);

  return firestore().runTransaction(async tx => {
    const snap = await tx.get(matchRef);
    if (!snap.exists) throw new Error('Partido no encontrado.');

    const match = (snap.data() ?? {}) as Record<string, unknown>;
    if (String(match.status ?? '') !== 'scheduled') {
      throw new Error('Solo puedes anotarte en partidos programados.');
    }

    const playersState: PlayersState = {
      team1: toPlayerArray(match.players1),
      team2: toPlayerArray(match.players2),
    };

    const { nextState, result } = applyTapOnTeamSlots(playersState, groupMemberId, team, slotIndex);
    if (result === 'noop') return result;

    tx.update(matchRef, {
      players1: nextState.team1,
      players2: nextState.team2,
      updatedAt: firestore.FieldValue.serverTimestamp(),
    });

    return result;
  });
}

export async function tapScheduledSlotInChallengeMatch(params: {
  matchId: string;
  userId: string;
  slotIndex: number;
}): Promise<TapResult> {
  const { matchId, userId, slotIndex } = params;
  const matchRef = firestore().collection('matchesByChallenge').doc(matchId);

  const doc = await matchRef.get();
  if (!doc.exists) throw new Error('Partido no encontrado.');

  const data = (doc.data() ?? {}) as Record<string, unknown>;
  const groupId = String(data.groupId ?? '').trim();
  if (!groupId) throw new Error('Partido inválido.');

  const groupMemberId = await resolveGroupMemberId(groupId, userId);

  return firestore().runTransaction(async tx => {
    const snap = await tx.get(matchRef);
    if (!snap.exists) throw new Error('Partido no encontrado.');

    const match = (snap.data() ?? {}) as Record<string, unknown>;
    if (String(match.status ?? '') !== 'scheduled') {
      throw new Error('Solo puedes anotarte en partidos programados.');
    }

    const players = toPlayerArray(match.players);
    const { nextPlayers, result } = applyTapOnSingleTeamSlots(players, groupMemberId, slotIndex);
    if (result === 'noop') return result;

    tx.update(matchRef, {
      players: nextPlayers,
      updatedAt: firestore.FieldValue.serverTimestamp(),
    });

    return result;
  });
}

export async function tapScheduledSlotInMatchByTeams(params: {
  matchId: string;
  userId: string;
  team: TeamKey;
  slotIndex: number;
}): Promise<TapResult> {
  const { matchId, userId, team, slotIndex } = params;
  const matchRef = firestore().collection('matchesByTeams').doc(matchId);

  const doc = await matchRef.get();
  if (!doc.exists) throw new Error('Partido no encontrado.');

  const data = (doc.data() ?? {}) as Record<string, unknown>;
  const groupId = String(data.groupId ?? '').trim();
  if (!groupId) throw new Error('Partido inválido.');

  const groupMemberId = await resolveGroupMemberId(groupId, userId);

  return firestore().runTransaction(async tx => {
    const snap = await tx.get(matchRef);
    if (!snap.exists) throw new Error('Partido no encontrado.');

    const match = (snap.data() ?? {}) as Record<string, unknown>;
    if (String(match.status ?? '') !== 'scheduled') {
      throw new Error('Solo puedes anotarte en partidos programados.');
    }

    const playersState: PlayersState = {
      team1: toPlayerArray(match.players1),
      team2: toPlayerArray(match.players2),
    };

    const { nextState, result } = applyTapOnTeamSlots(playersState, groupMemberId, team, slotIndex);
    if (result === 'noop') return result;

    tx.update(matchRef, {
      players1: nextState.team1,
      players2: nextState.team2,
      updatedAt: firestore.FieldValue.serverTimestamp(),
    });

    return result;
  });
}

export async function removeScheduledSlotInMatch(params: {
  matchId: string;
  team: TeamKey;
  slotIndex: number;
}): Promise<void> {
  const { matchId, team, slotIndex } = params;
  const matchRef = firestore().collection('matches').doc(matchId);

  await firestore().runTransaction(async tx => {
    const snap = await tx.get(matchRef);
    if (!snap.exists) throw new Error('Partido no encontrado.');

    const match = (snap.data() ?? {}) as Record<string, unknown>;
    if (String(match.status ?? '') !== 'scheduled') {
      throw new Error('Solo puedes editar partidos programados.');
    }

    const players1 = toPlayerArray(match.players1);
    const players2 = toPlayerArray(match.players2);
    const source = team === 1 ? players1 : players2;
    if (!isIndexValid(source, slotIndex)) throw new Error('Slot inválido.');

    source[slotIndex] = { ...source[slotIndex], groupMemberId: null };

    tx.update(matchRef, {
      players1,
      players2,
      updatedAt: firestore.FieldValue.serverTimestamp(),
    });
  });
}

export async function moveScheduledSlotInMatch(params: {
  matchId: string;
  team: TeamKey;
  fromSlotIndex: number;
  toSlotIndex: number;
}): Promise<void> {
  const { matchId, team, fromSlotIndex, toSlotIndex } = params;
  const matchRef = firestore().collection('matches').doc(matchId);

  await firestore().runTransaction(async tx => {
    const snap = await tx.get(matchRef);
    if (!snap.exists) throw new Error('Partido no encontrado.');

    const match = (snap.data() ?? {}) as Record<string, unknown>;
    if (String(match.status ?? '') !== 'scheduled') {
      throw new Error('Solo puedes editar partidos programados.');
    }

    const players1 = toPlayerArray(match.players1);
    const players2 = toPlayerArray(match.players2);
    const source = team === 1 ? players1 : players2;

    if (!isIndexValid(source, fromSlotIndex) || !isIndexValid(source, toSlotIndex)) {
      throw new Error('Slot inválido.');
    }

    const fromPlayer = source[fromSlotIndex];
    if (!fromPlayer.groupMemberId) throw new Error('No hay jugador para mover en ese slot.');
    if (source[toSlotIndex].groupMemberId) throw new Error('El slot destino ya está ocupado.');

    source[toSlotIndex] = { ...source[toSlotIndex], groupMemberId: fromPlayer.groupMemberId };
    source[fromSlotIndex] = { ...source[fromSlotIndex], groupMemberId: null };

    tx.update(matchRef, {
      players1,
      players2,
      updatedAt: firestore.FieldValue.serverTimestamp(),
    });
  });
}

export async function switchScheduledSlotTeamInMatch(params: {
  matchId: string;
  fromTeam: TeamKey;
  fromSlotIndex: number;
  toSlotIndex: number;
}): Promise<void> {
  const { matchId, fromTeam, fromSlotIndex, toSlotIndex } = params;
  const matchRef = firestore().collection('matches').doc(matchId);

  await firestore().runTransaction(async tx => {
    const snap = await tx.get(matchRef);
    if (!snap.exists) throw new Error('Partido no encontrado.');

    const match = (snap.data() ?? {}) as Record<string, unknown>;
    if (String(match.status ?? '') !== 'scheduled') {
      throw new Error('Solo puedes editar partidos programados.');
    }

    const players1 = toPlayerArray(match.players1);
    const players2 = toPlayerArray(match.players2);

    const source = fromTeam === 1 ? players1 : players2;
    const destination = fromTeam === 1 ? players2 : players1;

    if (!isIndexValid(source, fromSlotIndex) || !isIndexValid(destination, toSlotIndex)) {
      throw new Error('Slot inválido.');
    }

    const fromPlayer = source[fromSlotIndex];
    if (!fromPlayer.groupMemberId) throw new Error('No hay jugador para mover en ese slot.');
    if (destination[toSlotIndex].groupMemberId) throw new Error('El slot destino ya está ocupado.');

    destination[toSlotIndex] = {
      ...destination[toSlotIndex],
      groupMemberId: fromPlayer.groupMemberId,
    };
    source[fromSlotIndex] = { ...source[fromSlotIndex], groupMemberId: null };

    tx.update(matchRef, {
      players1,
      players2,
      updatedAt: firestore.FieldValue.serverTimestamp(),
    });
  });
}

export async function replaceScheduledSlotInMatch(params: {
  matchId: string;
  team: TeamKey;
  slotIndex: number;
  replacementGroupMemberId: string;
}): Promise<void> {
  const { matchId, team, slotIndex, replacementGroupMemberId } = params;
  const matchRef = firestore().collection('matches').doc(matchId);

  await firestore().runTransaction(async tx => {
    const snap = await tx.get(matchRef);
    if (!snap.exists) throw new Error('Partido no encontrado.');

    const match = (snap.data() ?? {}) as Record<string, unknown>;
    if (String(match.status ?? '') !== 'scheduled') {
      throw new Error('Solo puedes editar partidos programados.');
    }

    const players1 = toPlayerArray(match.players1);
    const players2 = toPlayerArray(match.players2);
    const source = team === 1 ? players1 : players2;

    if (!isIndexValid(source, slotIndex)) throw new Error('Slot inválido.');

    const existingInTeam1 = players1.findIndex(p => p.groupMemberId === replacementGroupMemberId);
    if (existingInTeam1 >= 0) {
      players1[existingInTeam1] = { ...players1[existingInTeam1], groupMemberId: null };
    }
    const existingInTeam2 = players2.findIndex(p => p.groupMemberId === replacementGroupMemberId);
    if (existingInTeam2 >= 0) {
      players2[existingInTeam2] = { ...players2[existingInTeam2], groupMemberId: null };
    }

    source[slotIndex] = { ...source[slotIndex], groupMemberId: replacementGroupMemberId };

    tx.update(matchRef, {
      players1,
      players2,
      updatedAt: firestore.FieldValue.serverTimestamp(),
    });
  });
}

export async function removeScheduledSlotInChallengeMatch(params: {
  matchId: string;
  slotIndex: number;
}): Promise<void> {
  const { matchId, slotIndex } = params;
  const matchRef = firestore().collection('matchesByChallenge').doc(matchId);

  await firestore().runTransaction(async tx => {
    const snap = await tx.get(matchRef);
    if (!snap.exists) throw new Error('Partido no encontrado.');

    const match = (snap.data() ?? {}) as Record<string, unknown>;
    if (String(match.status ?? '') !== 'scheduled') {
      throw new Error('Solo puedes editar partidos programados.');
    }

    const players = toPlayerArray(match.players);
    if (!isIndexValid(players, slotIndex)) throw new Error('Slot inválido.');

    players[slotIndex] = { ...players[slotIndex], groupMemberId: null };

    tx.update(matchRef, {
      players,
      updatedAt: firestore.FieldValue.serverTimestamp(),
    });
  });
}

export async function moveScheduledSlotInChallengeMatch(params: {
  matchId: string;
  fromSlotIndex: number;
  toSlotIndex: number;
}): Promise<void> {
  const { matchId, fromSlotIndex, toSlotIndex } = params;
  const matchRef = firestore().collection('matchesByChallenge').doc(matchId);

  await firestore().runTransaction(async tx => {
    const snap = await tx.get(matchRef);
    if (!snap.exists) throw new Error('Partido no encontrado.');

    const match = (snap.data() ?? {}) as Record<string, unknown>;
    if (String(match.status ?? '') !== 'scheduled') {
      throw new Error('Solo puedes editar partidos programados.');
    }

    const players = toPlayerArray(match.players);
    if (!isIndexValid(players, fromSlotIndex) || !isIndexValid(players, toSlotIndex)) {
      throw new Error('Slot inválido.');
    }

    const fromPlayer = players[fromSlotIndex];
    if (!fromPlayer.groupMemberId) throw new Error('No hay jugador para mover en ese slot.');
    if (players[toSlotIndex].groupMemberId) throw new Error('El slot destino ya está ocupado.');

    players[toSlotIndex] = { ...players[toSlotIndex], groupMemberId: fromPlayer.groupMemberId };
    players[fromSlotIndex] = { ...players[fromSlotIndex], groupMemberId: null };

    tx.update(matchRef, {
      players,
      updatedAt: firestore.FieldValue.serverTimestamp(),
    });
  });
}

export async function replaceScheduledSlotInChallengeMatch(params: {
  matchId: string;
  slotIndex: number;
  replacementGroupMemberId: string;
}): Promise<void> {
  const { matchId, slotIndex, replacementGroupMemberId } = params;
  const matchRef = firestore().collection('matchesByChallenge').doc(matchId);

  await firestore().runTransaction(async tx => {
    const snap = await tx.get(matchRef);
    if (!snap.exists) throw new Error('Partido no encontrado.');

    const match = (snap.data() ?? {}) as Record<string, unknown>;
    if (String(match.status ?? '') !== 'scheduled') {
      throw new Error('Solo puedes editar partidos programados.');
    }

    const players = toPlayerArray(match.players);
    if (!isIndexValid(players, slotIndex)) throw new Error('Slot inválido.');

    const existingIndex = players.findIndex(p => p.groupMemberId === replacementGroupMemberId);
    if (existingIndex >= 0) {
      players[existingIndex] = { ...players[existingIndex], groupMemberId: null };
    }

    players[slotIndex] = { ...players[slotIndex], groupMemberId: replacementGroupMemberId };

    tx.update(matchRef, {
      players,
      updatedAt: firestore.FieldValue.serverTimestamp(),
    });
  });
}
