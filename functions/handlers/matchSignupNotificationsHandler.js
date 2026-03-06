const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');
const {
  USERS_COLLECTION,
  GROUPS_COLLECTION,
  MAX_TOKENS_PER_BATCH,
  uniqueNonEmpty,
  chunk,
  collectUserTokens,
} = require('../utils/helpers');
const { isNotificationEnabled } = require('../utils/notificationPreferences');

const GROUP_MEMBERS_V2_COLLECTION = 'groupMembers_v2';
const READY_NOTIFIED_AT_FIELD = 'readyNotifiedAt';
const SIGNUP_NOTIFIED_FIELD = 'signupNotifiedGroupMemberIds';

const isTruthyString = value => typeof value === 'string' && value.trim().length > 0;

const toPlayers = value => (Array.isArray(value) ? value : []);

const toAssignedMemberIds = players =>
  uniqueNonEmpty(
    toPlayers(players)
      .map(player => String(player?.groupMemberId ?? '').trim())
      .filter(Boolean),
  );

const toAssignedStarterMemberIds = players =>
  uniqueNonEmpty(
    toPlayers(players)
      .filter(player => !Boolean(player?.isSub))
      .map(player => String(player?.groupMemberId ?? '').trim())
      .filter(Boolean),
  );

const areStartersComplete = players => {
  const starters = toPlayers(players).filter(player => !Boolean(player?.isSub));
  if (starters.length === 0) return false;
  return starters.every(player => isTruthyString(String(player?.groupMemberId ?? '')));
};

const getShape = matchData => {
  if (Array.isArray(matchData?.players1) && Array.isArray(matchData?.players2)) {
    return 'dual';
  }
  if (Array.isArray(matchData?.players)) {
    return 'single';
  }
  return 'unknown';
};

const getAssignedByShape = (matchData, shape, startersOnly = false) => {
  if (shape === 'dual') {
    const read = startersOnly ? toAssignedStarterMemberIds : toAssignedMemberIds;
    return uniqueNonEmpty([...read(matchData.players1), ...read(matchData.players2)]);
  }
  if (shape === 'single') {
    return startersOnly
      ? toAssignedStarterMemberIds(matchData.players)
      : toAssignedMemberIds(matchData.players);
  }
  return [];
};

const isCompleteByShape = (matchData, shape) => {
  if (shape === 'dual') {
    return areStartersComplete(matchData.players1) && areStartersComplete(matchData.players2);
  }
  if (shape === 'single') {
    return areStartersComplete(matchData.players);
  }
  return false;
};

const getSetDiff = (afterSet, beforeSet) => {
  const diff = [];
  for (const value of afterSet) {
    if (!beforeSet.has(value)) diff.push(value);
  }
  return diff;
};

const loadGroupMembersMap = async (db, memberIds) => {
  if (memberIds.length === 0) return new Map();
  const docs = await Promise.all(
    memberIds.map(memberId => db.collection(GROUP_MEMBERS_V2_COLLECTION).doc(memberId).get()),
  );

  const map = new Map();
  for (const doc of docs) {
    if (!doc.exists) continue;
    map.set(doc.id, doc.data() ?? {});
  }
  return map;
};

const sendNotificationToUserIds = async ({
  db,
  userIds,
  groupId,
  type,
  title,
  body,
  data,
}) => {
  const uniqueUserIds = uniqueNonEmpty(userIds);
  if (uniqueUserIds.length === 0) return 0;

  const userDocs = await Promise.all(
    uniqueUserIds.map(userId => db.collection(USERS_COLLECTION).doc(userId).get()),
  );

  const tokens = uniqueNonEmpty(
    userDocs
      .filter(doc => doc.exists)
      .filter(doc => isNotificationEnabled(doc.data() ?? {}, groupId, type))
      .flatMap(doc => collectUserTokens(doc.data() ?? {})),
  );

  if (tokens.length === 0) return 0;

  const payload = {
    notification: { title, body },
    data,
    android: { priority: 'high', notification: { channelId: 'mejengas_default_channel' } },
    apns: { headers: { 'apns-priority': '10' } },
  };

  let sent = 0;
  for (const tokensChunk of chunk(tokens, MAX_TOKENS_PER_BATCH)) {
    const response = await admin.messaging().sendEachForMulticast({
      tokens: tokensChunk,
      ...payload,
    });
    sent += response.successCount;
  }

  return sent;
};

const buildReadyBody = groupName => {
  if (groupName) return `El partido en "${groupName}" ya está completo y listo para jugarse.`;
  return 'El partido ya está completo y listo para jugarse.';
};

const buildSignupBody = ({ groupName, playerNames }) => {
  const names = playerNames.filter(Boolean);
  if (names.length === 0) {
    return groupName
      ? `Se apuntó un jugador al partido de "${groupName}".`
      : 'Se apuntó un jugador al partido.';
  }

  if (names.length === 1) {
    return groupName
      ? `${names[0]} se apuntó al partido de "${groupName}".`
      : `${names[0]} se apuntó al partido.`;
  }

  return groupName
    ? `${names.length} jugadores se apuntaron al partido de "${groupName}".`
    : `${names.length} jugadores se apuntaron al partido.`;
};

const buildUnsignupBody = ({ groupName, playerNames }) => {
  const names = playerNames.filter(Boolean);
  if (names.length === 0) {
    return groupName
      ? `Un jugador se bajó del partido de "${groupName}".`
      : 'Un jugador se bajó del partido.';
  }

  if (names.length === 1) {
    return groupName
      ? `${names[0]} se bajó del partido de "${groupName}".`
      : `${names[0]} se bajó del partido.`;
  }

  return groupName
    ? `${names.length} jugadores se bajaron del partido de "${groupName}".`
    : `${names.length} jugadores se bajaron del partido.`;
};

const handleMatchSignupUpdates = async ({ event, matchCollection }) => {
  const before = event.data?.before?.data() ?? null;
  const after = event.data?.after?.data() ?? null;
  if (!before || !after) return;

  const status = String(after.status ?? '');
  if (status !== 'scheduled') return;

  const groupId = String(after.groupId ?? '').trim();
  const matchId = String(event.params?.matchId ?? '').trim();
  if (!groupId || !matchId) return;

  const shape = getShape(after);
  if (shape === 'unknown') return;

  const beforeAssignedSet = new Set(getAssignedByShape(before, shape));
  const afterAssignedSet = new Set(getAssignedByShape(after, shape));

  const joinedMemberIds = getSetDiff(afterAssignedSet, beforeAssignedSet);
  const leftMemberIds = getSetDiff(beforeAssignedSet, afterAssignedSet);

  const beforeComplete = isCompleteByShape(before, shape);
  const afterComplete = isCompleteByShape(after, shape);

  const db = admin.firestore();
  const matchRef = event.data.after.ref;

  const groupDoc = await db.collection(GROUPS_COLLECTION).doc(groupId).get();
  const groupName = groupDoc.exists
    ? String(groupDoc.data()?.name ?? '').trim() || null
    : null;

  const signupNotifiedSet = new Set(
    Array.isArray(after[SIGNUP_NOTIFIED_FIELD])
      ? after[SIGNUP_NOTIFIED_FIELD].map(value => String(value))
      : [],
  );

  const joinedFirstTimeIds = joinedMemberIds.filter(memberId => !signupNotifiedSet.has(memberId));

  const memberIdsForLookup = uniqueNonEmpty([...joinedFirstTimeIds, ...leftMemberIds]);
  const membersMap = await loadGroupMembersMap(db, memberIdsForLookup);

  const joinedNames = joinedFirstTimeIds.map(
    memberId => String(membersMap.get(memberId)?.displayName ?? '').trim(),
  );
  const leftNames = leftMemberIds.map(
    memberId => String(membersMap.get(memberId)?.displayName ?? '').trim(),
  );

  const creatorUserId = String(after.createdByUserId ?? '').trim();

  if (creatorUserId && joinedFirstTimeIds.length > 0) {
    const sent = await sendNotificationToUserIds({
      db,
      userIds: [creatorUserId],
      groupId,
      type: 'matchSignups',
      title: 'Nuevo jugador apuntado',
      body: buildSignupBody({ groupName, playerNames: joinedNames }),
      data: {
        type: 'match-signup',
        groupId,
        matchId,
        matchCollection,
      },
    });

    if (sent > 0) {
      await matchRef.update({
        [SIGNUP_NOTIFIED_FIELD]: admin.firestore.FieldValue.arrayUnion(...joinedFirstTimeIds),
      });
    }
  }

  if (creatorUserId && leftMemberIds.length > 0) {
    await sendNotificationToUserIds({
      db,
      userIds: [creatorUserId],
      groupId,
      type: 'matchUnsignups',
      title: 'Jugador desanotado',
      body: buildUnsignupBody({ groupName, playerNames: leftNames }),
      data: {
        type: 'match-unsignup',
        groupId,
        matchId,
        matchCollection,
      },
    });
  }

  const readyNotifiedAt = after[READY_NOTIFIED_AT_FIELD] ?? null;
  if (!beforeComplete && afterComplete && !readyNotifiedAt) {
    const participantMemberIds = getAssignedByShape(after, shape, false);
    const participantMembers = await loadGroupMembersMap(db, participantMemberIds);

    const participantUserIds = uniqueNonEmpty(
      participantMemberIds
        .map(memberId => String(participantMembers.get(memberId)?.userId ?? '').trim())
        .filter(Boolean),
    );

    const sent = await sendNotificationToUserIds({
      db,
      userIds: participantUserIds,
      groupId,
      type: 'matchReady',
      title: 'Partido completo ✅',
      body: buildReadyBody(groupName),
      data: {
        type: 'match-ready',
        groupId,
        matchId,
        matchCollection,
      },
    });

    if (sent > 0) {
      await matchRef.update({
        [READY_NOTIFIED_AT_FIELD]: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  }
};

exports.onMatchSignupUpdated = onDocumentUpdated('matches/{matchId}', async event => {
  try {
    await handleMatchSignupUpdates({ event, matchCollection: 'matches' });
  } catch (error) {
    logger.error('onMatchSignupUpdated: failed', {
      matchId: event.params?.matchId,
      error: error?.message ?? String(error),
    });
  }
});

exports.onChallengeMatchSignupUpdated = onDocumentUpdated('matchesByChallenge/{matchId}', async event => {
  try {
    await handleMatchSignupUpdates({ event, matchCollection: 'matchesByChallenge' });
  } catch (error) {
    logger.error('onChallengeMatchSignupUpdated: failed', {
      matchId: event.params?.matchId,
      error: error?.message ?? String(error),
    });
  }
});

exports.onMatchByTeamsSignupUpdated = onDocumentUpdated('matchesByTeams/{matchId}', async event => {
  try {
    await handleMatchSignupUpdates({ event, matchCollection: 'matchesByTeams' });
  } catch (error) {
    logger.error('onMatchByTeamsSignupUpdated: failed', {
      matchId: event.params?.matchId,
      error: error?.message ?? String(error),
    });
  }
});
