const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');
const {
  GROUP_MEMBERS_COLLECTION,
  USERS_COLLECTION,
  GROUPS_COLLECTION,
  MAX_TOKENS_PER_BATCH,
  uniqueNonEmpty,
  chunk,
  resolveGroupId,
  resolveMemberUserId,
  collectUserTokens,
} = require('../utils/helpers');

const notifyGroupMembers = async (matchId, groupId) => {
  const db = admin.firestore();

  // Fetch group name to include in the notification title
  const groupDoc = await db.collection(GROUPS_COLLECTION).doc(groupId).get();
  const groupName = groupDoc.exists ? String(groupDoc.data().name ?? '').trim() : '';

  let membersSnap = await db
    .collection(GROUP_MEMBERS_COLLECTION)
    .where('groupId', '==', groupId)
    .get();

  if (membersSnap.empty) {
    membersSnap = await db
      .collection(GROUP_MEMBERS_COLLECTION)
      .where('groupid', '==', groupId)
      .get();
  }

  if (membersSnap.empty) {
    logger.info('notifyGroupMembers: no group members found', { groupId, matchId });
    return;
  }

  const userIds = uniqueNonEmpty(
    membersSnap.docs.map(doc => resolveMemberUserId(doc.data() ?? {})),
  );

  if (userIds.length === 0) {
    logger.info('notifyGroupMembers: no user IDs resolved', { groupId, matchId });
    return;
  }

  const usersRef = db.collection(USERS_COLLECTION);
  const userDocs = await Promise.all(userIds.map(id => usersRef.doc(id).get()));

  const tokens = uniqueNonEmpty(
    userDocs.flatMap(doc => collectUserTokens(doc.data() ?? {})),
  );

  if (tokens.length === 0) {
    logger.info('notifyGroupMembers: no FCM tokens found', { groupId, matchId });
    return;
  }

  const payload = {
    notification: {
      title: groupName ? `Nuevo partido en "${groupName}"` : 'Nuevo partido',
      body: 'Se agregó un partido en tu grupo.',
    },
    data: {
      matchId,
      groupId,
      type: 'match-created',
    },
    android: { priority: 'high', notification: { channelId: 'mejengas_default_channel' } },
    apns: { headers: { 'apns-priority': '10' } },
  };

  let sentCount = 0;
  for (const tokensChunk of chunk(tokens, MAX_TOKENS_PER_BATCH)) {
    const response = await admin.messaging().sendEachForMulticast({
      tokens: tokensChunk,
      ...payload,
    });
    sentCount += response.successCount;
    if (response.failureCount > 0) {
      logger.warn('notifyGroupMembers: some notifications failed', {
        matchId,
        groupId,
        failures: response.failureCount,
      });
    }
  }

  logger.info('notifyGroupMembers: notification sent', { matchId, groupId, sentCount });
};

exports.notifyGroupOnNewMatch = onDocumentCreated('matches/{matchId}', async event => {
  const matchId = event.params.matchId;
  const data = event.data?.data();

  if (!data) {
    logger.warn('notifyGroupOnNewMatch: match document has no data', { matchId });
    return;
  }

  const groupId = resolveGroupId(data);

  if (!groupId) {
    logger.warn('notifyGroupOnNewMatch: match missing groupId', { matchId });
    return;
  }

  await notifyGroupMembers(matchId, groupId);
});
