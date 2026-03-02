const { onDocumentCreated } = require('firebase-functions/v2/firestore');
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

const GROUP_MEMBERS_V2_COLLECTION = 'groupMembers_v2';

/**
 * Triggered when a new joinRequest document is created.
 * Notifies all admins and owners of the group.
 */
exports.notifyAdminsOnJoinRequest = onDocumentCreated(
  'joinRequests/{requestId}',
  async event => {
    const requestId = event.params.requestId;
    const data = event.data?.data();

    if (!data) {
      logger.warn('notifyAdminsOnJoinRequest: document has no data', { requestId });
      return;
    }

    const groupId = String(data.groupId ?? '').trim();
    const userDisplayName = String(data.userDisplayName ?? 'Un usuario').trim();

    if (!groupId) {
      logger.warn('notifyAdminsOnJoinRequest: missing groupId', { requestId });
      return;
    }

    const db = admin.firestore();

    // Get group name
    const groupSnap = await db.collection(GROUPS_COLLECTION).doc(groupId).get();
    const groupName = groupSnap.exists
      ? String(groupSnap.data()?.name ?? '').trim()
      : '';

    // Get all admin/owner members with a userId
    const adminMembersSnap = await db
      .collection(GROUP_MEMBERS_V2_COLLECTION)
      .where('groupId', '==', groupId)
      .where('role', 'in', ['admin', 'owner'])
      .get();

    if (adminMembersSnap.empty) {
      logger.info('notifyAdminsOnJoinRequest: no admins found for group', { requestId, groupId });
      return;
    }

    const adminUserIds = adminMembersSnap.docs
      .map(doc => {
        const d = doc.data() ?? {};
        return typeof d.userId === 'string' ? d.userId.trim() : '';
      })
      .filter(Boolean);

    if (adminUserIds.length === 0) {
      logger.info('notifyAdminsOnJoinRequest: no admin userIds found', { requestId });
      return;
    }

    // Fetch FCM tokens for each admin
    const userSnaps = await db
      .collection(USERS_COLLECTION)
      .where(admin.firestore.FieldPath.documentId(), 'in', adminUserIds.slice(0, 30))
      .get();

    const tokens = uniqueNonEmpty(
      userSnaps.docs.flatMap(doc => collectUserTokens(doc.data() ?? {})),
    );

    if (tokens.length === 0) {
      logger.info('notifyAdminsOnJoinRequest: no FCM tokens found for admins', { requestId });
      return;
    }

    const payload = {
      notification: {
        title: 'Nueva solicitud de unión',
        body: groupName
          ? `${userDisplayName} quiere unirse a "${groupName}"`
          : `${userDisplayName} quiere unirse al grupo`,
      },
      data: {
        requestId,
        groupId,
        type: 'join-request-received',
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
        logger.warn('notifyAdminsOnJoinRequest: some notifications failed', {
          requestId,
          failures: response.failureCount,
        });
      }
    }

    logger.info('notifyAdminsOnJoinRequest: notifications sent', { requestId, sentCount });
  },
);
