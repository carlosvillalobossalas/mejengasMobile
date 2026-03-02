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

/**
 * Triggered when a joinRequest document is updated.
 * When status changes from 'pending' to 'accepted' or 'rejected',
 * notifies the requesting user.
 */
exports.notifyUserOnJoinRequestUpdate = onDocumentUpdated(
  'joinRequests/{requestId}',
  async event => {
    const requestId = event.params.requestId;
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();

    if (!before || !after) {
      logger.warn('notifyUserOnJoinRequestUpdate: missing before/after data', { requestId });
      return;
    }

    const prevStatus = String(before.status ?? '');
    const newStatus = String(after.status ?? '');

    // Only fire when transitioning from pending to accepted/rejected
    if (prevStatus !== 'pending' || (newStatus !== 'accepted' && newStatus !== 'rejected')) {
      return;
    }

    const userId = String(after.userId ?? '').trim();
    const groupId = String(after.groupId ?? '').trim();

    if (!userId || !groupId) {
      logger.warn('notifyUserOnJoinRequestUpdate: missing userId or groupId', { requestId });
      return;
    }

    const db = admin.firestore();

    // Get group name
    const groupSnap = await db.collection(GROUPS_COLLECTION).doc(groupId).get();
    const groupName = groupSnap.exists
      ? String(groupSnap.data()?.name ?? '').trim()
      : '';

    // Fetch requesting user FCM tokens
    const userSnap = await db.collection(USERS_COLLECTION).doc(userId).get();
    if (!userSnap.exists) {
      logger.info('notifyUserOnJoinRequestUpdate: user not found', { requestId, userId });
      return;
    }

    const tokens = uniqueNonEmpty(collectUserTokens(userSnap.data() ?? {}));

    if (tokens.length === 0) {
      logger.info('notifyUserOnJoinRequestUpdate: no FCM tokens for user', { requestId, userId });
      return;
    }

    const isAccepted = newStatus === 'accepted';
    const payload = {
      notification: {
        title: isAccepted ? '¡Solicitud aceptada!' : 'Solicitud rechazada',
        body: groupName
          ? isAccepted
            ? `Tu solicitud para unirte a "${groupName}" fue aceptada`
            : `Tu solicitud para unirte a "${groupName}" no fue aceptada`
          : isAccepted
            ? 'Tu solicitud fue aceptada'
            : 'Tu solicitud no fue aceptada',
      },
      data: {
        requestId,
        groupId,
        type: isAccepted ? 'join-request-accepted' : 'join-request-rejected',
      },
      android: { priority: 'high' },
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
        logger.warn('notifyUserOnJoinRequestUpdate: some notifications failed', {
          requestId,
          failures: response.failureCount,
        });
      }
    }

    logger.info('notifyUserOnJoinRequestUpdate: notification sent', {
      requestId,
      userId,
      newStatus,
      sentCount,
    });
  },
);
