const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');
const {
  USERS_COLLECTION,
  MAX_TOKENS_PER_BATCH,
  uniqueNonEmpty,
  chunk,
  collectUserTokens,
} = require('../utils/helpers');

/**
 * Fires when a new groupMembers_v2 document is created.
 * If the document has addedViaGroupCopy=true and a userId, sends a push
 * notification informing the user they were added to the new group.
 */
exports.notifyOnGroupMemberAdded = onDocumentCreated(
  'groupMembers_v2/{memberId}',
  async event => {
    const memberId = event.params.memberId;
    const data = event.data?.data();

    if (!data) {
      logger.warn('notifyOnGroupMemberAdded: no data', { memberId });
      return;
    }

    // Only process members added via group copy
    if (!data.addedViaGroupCopy) return;

    const userId = String(data.userId ?? '').trim();
    if (!userId) {
      // Guest member — no account to notify
      return;
    }

    const groupId = String(data.groupId ?? '').trim();
    const groupName = String(data.targetGroupName ?? '').trim();

    const db = admin.firestore();

    const userDoc = await db.collection(USERS_COLLECTION).doc(userId).get();
    if (!userDoc.exists) {
      logger.info('notifyOnGroupMemberAdded: user not found', { memberId, userId });
      return;
    }

    const userData = userDoc.data() ?? {};

    const tokens = uniqueNonEmpty(collectUserTokens(userData));

    if (tokens.length === 0) {
      logger.info('notifyOnGroupMemberAdded: no FCM tokens for user', { memberId, userId });
      return;
    }

    const payload = {
      notification: {
        title: '¡Fuiste agregado a un grupo!',
        body: groupName
          ? `Ahora sos parte del grupo "${groupName}"`
          : 'Fuiste agregado a un nuevo grupo',
      },
      data: {
        memberId,
        groupId,
        type: 'group-member-added',
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
        logger.warn('notifyOnGroupMemberAdded: some notifications failed', {
          memberId,
          failures: response.failureCount,
        });
      }
    }

    logger.info('notifyOnGroupMemberAdded: notification sent', { memberId, userId, sentCount });
  },
);
