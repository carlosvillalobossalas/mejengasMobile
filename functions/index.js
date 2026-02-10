const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');
admin.initializeApp();

const GROUP_MEMBERS_COLLECTION = 'groupMembers';
const USERS_COLLECTION = 'users';
const MAX_TOKENS_PER_BATCH = 500;

const uniqueNonEmpty = values => {
  const result = new Set();
  for (const value of values) {
    if (value) {
      result.add(value);
    }
  }
  return Array.from(result);
};

const chunk = (items, size) => {
  if (size <= 0) {
    return [items];
  }

  const result = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
};

const resolveGroupId = data => {
  return String(data.groupId ?? data.groupid ?? '').trim();
};

const resolveMemberUserId = data => {
  return String(data.userId ?? data.userid ?? '').trim();
};

const collectUserTokens = data => {
  const tokens = [];

  const token = typeof data.fcmToken === 'string' ? data.fcmToken.trim() : '';
  if (token) {
    tokens.push(token);
  }

  const tokenList = Array.isArray(data.fcmTokens) ? data.fcmTokens : [];
  for (const entry of tokenList) {
    if (typeof entry === 'string' && entry.trim()) {
      tokens.push(entry.trim());
    }
  }

  return tokens;
};

const notifyGroupMembers = async (matchId, groupId) => {
  const firestore = admin.firestore();
  let membersSnap = await firestore
    .collection(GROUP_MEMBERS_COLLECTION)
    .where('groupId', '==', groupId)
    .get();

  if (membersSnap.empty) {
    membersSnap = await firestore
      .collection(GROUP_MEMBERS_COLLECTION)
      .where('groupid', '==', groupId)
      .get();
  }

  if (membersSnap.empty) {
    logger.info('No group members found', { groupId, matchId });
    return;
  }

  const userIds = uniqueNonEmpty(
    membersSnap.docs.map(doc => resolveMemberUserId(doc.data() ?? {})),
  );

  if (userIds.length === 0) {
    logger.info('No user IDs resolved for group', { groupId, matchId });
    return;
  }

  const usersRef = firestore.collection(USERS_COLLECTION);
  const userDocs = await Promise.all(userIds.map(id => usersRef.doc(id).get()));

  const tokens = uniqueNonEmpty(
    userDocs.flatMap(doc => collectUserTokens(doc.data() ?? {})),
  );

  if (tokens.length === 0) {
    logger.info('No FCM tokens found for group', { groupId, matchId });
    return;
  }

  const payload = {
    notification: {
      title: 'Nuevo partido',
      body: 'Se agregó un partido en tu grupo.',
    },
    data: {
      matchId,
      groupId,
      type: 'match-created',
    },
    android: {
      priority: 'high',
    },
    apns: {
      headers: {
        'apns-priority': '10',
      },
    },
  };

  let sentCount = 0;
  for (const tokensChunk of chunk(tokens, MAX_TOKENS_PER_BATCH)) {
    const response = await admin.messaging().sendEachForMulticast({
      tokens: tokensChunk,
      ...payload,
    });

    sentCount += response.successCount;

    if (response.failureCount > 0) {
      logger.warn('Some notifications failed', {
        matchId,
        groupId,
        failures: response.failureCount,
      });
    }
  }

  logger.info('Match notification sent', { matchId, groupId, sentCount });
};

const handleMatchCreated = async (matchId, data) => {
  if (!data) {
    logger.warn('Match document has no data', { matchId });
    return;
  }

  const groupId = resolveGroupId(data);

  if (!groupId) {
    logger.warn('Match missing groupId', { matchId });
    return;
  }

  await notifyGroupMembers(matchId, groupId);
};

exports.notifyGroupOnNewMatch = onDocumentCreated(
  'Matches/{matchId}',
  async event => {
    await handleMatchCreated(event.params.matchId, event.data?.data());
  },
);

