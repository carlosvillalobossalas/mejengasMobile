const { onCall, HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const admin = require('firebase-admin');

const GROUPS_COLLECTION = 'groups';
const GROUP_MEMBERS_V2_COLLECTION = 'groupMembers_v2';
const BATCH_LIMIT = 400;
const DEFAULT_TEAM_1_COLOR = '#000000';
const DEFAULT_TEAM_2_COLOR = '#FFFFFF';

exports.migrateGroupDefaultKitColors = onCall(async request => {
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

  logger.info('migrateGroupDefaultKitColors: started', { requestedBy: uid });

  const groupsSnap = await db.collection(GROUPS_COLLECTION).get();

  let migratedGroups = 0;
  let batch = db.batch();
  let writesInBatch = 0;

  const flushBatch = async () => {
    if (writesInBatch === 0) return;
    await batch.commit();
    batch = db.batch();
    writesInBatch = 0;
  };

  for (const groupDoc of groupsSnap.docs) {
    const data = groupDoc.data() ?? {};
    const hasDefaultTeam1Color = typeof data.defaultTeam1Color === 'string' && data.defaultTeam1Color.trim().length > 0;
    const hasDefaultTeam2Color = typeof data.defaultTeam2Color === 'string' && data.defaultTeam2Color.trim().length > 0;

    if (hasDefaultTeam1Color && hasDefaultTeam2Color) {
      continue;
    }

    batch.set(
      groupDoc.ref,
      {
        defaultTeam1Color: hasDefaultTeam1Color ? data.defaultTeam1Color : DEFAULT_TEAM_1_COLOR,
        defaultTeam2Color: hasDefaultTeam2Color ? data.defaultTeam2Color : DEFAULT_TEAM_2_COLOR,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    migratedGroups += 1;
    writesInBatch += 1;

    if (writesInBatch >= BATCH_LIMIT) {
      await flushBatch();
    }
  }

  await flushBatch();

  logger.info('migrateGroupDefaultKitColors: completed', {
    requestedBy: uid,
    groupsProcessed: groupsSnap.size,
    groupsMigrated: migratedGroups,
  });

  return {
    ok: true,
    groupsProcessed: groupsSnap.size,
    groupsMigrated: migratedGroups,
  };
});
