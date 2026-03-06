const { onCall, HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');
const { buildDefaultGroupPreferences } = require('../utils/notificationPreferences');

const USERS_COLLECTION = 'users';
const GROUP_MEMBERS_V2_COLLECTION = 'groupMembers_v2';
const BATCH_LIMIT = 400;

exports.migrateUserNotificationPreferences = onCall(async request => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError('unauthenticated', 'Debes iniciar sesión para ejecutar la migración.');
  }

  const db = admin.firestore();

  const membershipSnap = await db
    .collection(GROUP_MEMBERS_V2_COLLECTION)
    .where('userId', '==', uid)
    .where('role', 'in', ['owner', 'admin'])
    .limit(1)
    .get();

  if (membershipSnap.empty) {
    throw new HttpsError('permission-denied', 'No tienes permisos para ejecutar la migración.');
  }

  logger.info('migrateUserNotificationPreferences: started', { requestedBy: uid });

  const [usersSnap, membersSnap] = await Promise.all([
    db.collection(USERS_COLLECTION).get(),
    db.collection(GROUP_MEMBERS_V2_COLLECTION).get(),
  ]);

  const groupIdsByUserId = new Map();

  for (const memberDoc of membersSnap.docs) {
    const data = memberDoc.data() ?? {};
    const userId = String(data.userId ?? '').trim();
    const groupId = String(data.groupId ?? '').trim();

    if (!userId || !groupId) continue;

    if (!groupIdsByUserId.has(userId)) {
      groupIdsByUserId.set(userId, new Set());
    }

    groupIdsByUserId.get(userId).add(groupId);
  }

  let migratedUsers = 0;
  let batch = db.batch();
  let writesInBatch = 0;

  const flushBatch = async () => {
    if (writesInBatch === 0) return;
    await batch.commit();
    batch = db.batch();
    writesInBatch = 0;
  };

  for (const userDoc of usersSnap.docs) {
    const userData = userDoc.data() ?? {};

    const existingPrefsRaw =
      typeof userData.notificationPreferences === 'object' && userData.notificationPreferences !== null
        ? userData.notificationPreferences
        : {};

    const existingGroupsRaw =
      typeof existingPrefsRaw.groups === 'object' && existingPrefsRaw.groups !== null
        ? existingPrefsRaw.groups
        : {};

    const groupIdSet = new Set(Object.keys(existingGroupsRaw));
    const memberGroupIds = groupIdsByUserId.get(userDoc.id) ?? new Set();

    for (const groupId of memberGroupIds) {
      groupIdSet.add(groupId);
    }

    const groups = {};
    for (const groupId of groupIdSet) {
      groups[groupId] = buildDefaultGroupPreferences();
    }

    batch.set(
      userDoc.ref,
      {
        notificationPreferences: {
          globalEnabled: true,
          groups,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    migratedUsers += 1;
    writesInBatch += 1;

    if (writesInBatch >= BATCH_LIMIT) {
      await flushBatch();
    }
  }

  await flushBatch();

  logger.info('migrateUserNotificationPreferences: completed', {
    requestedBy: uid,
    usersProcessed: usersSnap.size,
    usersMigrated: migratedUsers,
  });

  return {
    ok: true,
    usersProcessed: usersSnap.size,
    usersMigrated: migratedUsers,
  };
});
