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

exports.notifyUserOnInvite = onDocumentCreated('invites/{inviteId}', async event => {
  const inviteId = event.params.inviteId;
  const data = event.data?.data();

  if (!data) {
    logger.warn('notifyUserOnInvite: invite document has no data', { inviteId });
    return;
  }

  const email = String(data.email ?? '').trim().toLowerCase();
  const groupName = String(data.groupName ?? '').trim();

  if (!email) {
    logger.warn('notifyUserOnInvite: invite has no email', { inviteId });
    return;
  }

  const db = admin.firestore();

  const usersSnap = await db
    .collection(USERS_COLLECTION)
    .where('email', '==', email)
    .limit(1)
    .get();

  if (usersSnap.empty) {
    logger.info('notifyUserOnInvite: no user found for email', { inviteId, email });
    return;
  }

  const tokens = uniqueNonEmpty(
    usersSnap.docs.flatMap(doc => collectUserTokens(doc.data() ?? {})),
  );

  if (tokens.length === 0) {
    logger.info('notifyUserOnInvite: no FCM tokens for user', { inviteId, email });
    return;
  }

  const payload = {
    notification: {
      title: '¡Tenés una nueva invitación!',
      body: groupName
        ? `Fuiste invitado al grupo "${groupName}"`
        : 'Fuiste invitado a un grupo',
    },
    data: {
      inviteId,
      type: 'invite-received',
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
      logger.warn('notifyUserOnInvite: some notifications failed', {
        inviteId,
        failures: response.failureCount,
      });
    }
  }

  logger.info('notifyUserOnInvite: notification sent', { inviteId, email, sentCount });
});
