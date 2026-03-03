const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onDocumentUpdated } = require('firebase-functions/v2/firestore');

const CHALLENGE_MATCHES_COLLECTION = 'matchesByChallenge';
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

const MATCH_REMINDERS_COLLECTION = 'matchReminders';
const MATCHES_COLLECTION = 'matches';
const GROUP_MEMBERS_V2_COLLECTION = 'groupMembers_v2';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatDate = date =>
  date.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Mexico_City' });

const formatTime = date =>
  date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City' });

/**
 * Creates up to 3 reminder documents in matchReminders:
 *   - 24 h before the match
 *   - 12 h before the match
 *   -  6 h before the match
 *
 * Each reminder is only created if its scheduledAt is strictly in the future
 * relative to `fromTimestamp` (the moment the match was saved / updated).
 *
 * @param {string} matchCollection - Firestore collection the match belongs to
 *   ('matches' or 'matchesByChallenge'). Stored on the reminder so
 *   sendPersonalizedReminders knows where to look.
 */
const createReminderDocs = (batch, db, matchId, groupId, matchDateTs, fromTimestamp, matchCollection = MATCHES_COLLECTION) => {
  const OFFSETS_MS = [
    24 * 60 * 60 * 1000, // 24 h
    12 * 60 * 60 * 1000, // 12 h
     6 * 60 * 60 * 1000, //  6 h
  ];

  let created = 0;
  for (const offsetMs of OFFSETS_MS) {
    const scheduledAtMs = matchDateTs.toMillis() - offsetMs;

    // Skip if this reminder would already be in the past
    if (scheduledAtMs <= fromTimestamp.toMillis()) continue;

    const ref = db.collection(MATCH_REMINDERS_COLLECTION).doc();
    batch.set(ref, {
      matchId,
      groupId,
      matchCollection,
      matchDate: matchDateTs,
      scheduledAt: admin.firestore.Timestamp.fromMillis(scheduledAtMs),
      status: 'pending',
      sentAt: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    created++;
  }
  return created;
};

/**
 * Sends personalized FCM notifications for a single match reminder.
 * - Members in the lineup → "you're playing" message
 * - Members in the group but not in lineup → "you can join" message
 *
 * Supports both regular matches (players1 + players2) and challenge matches (players).
 *
 * @param {string} matchCollection - Firestore collection the match belongs to
 */
const sendPersonalizedReminders = async (db, matchId, groupId, matchDateObj, groupName, matchCollection = MATCHES_COLLECTION) => {
  // Fetch match to verify it is still scheduled and get current lineup
  const matchDoc = await db.collection(matchCollection).doc(matchId).get();
  if (!matchDoc.exists) {
    logger.warn('sendPersonalizedReminders: match not found', { matchId, matchCollection });
    return;
  }

  const match = matchDoc.data();

  // Skip if match is no longer scheduled (e.g. was cancelled or already played)
  if (match.status !== 'scheduled') {
    logger.info('sendPersonalizedReminders: match not scheduled, skipping', { matchId, status: match.status });
    return;
  }

  const dateStr = formatDate(matchDateObj);
  const timeStr = formatTime(matchDateObj);

  // Collect members in the current lineup — handle both regular and challenge match shapes
  const isChallengeMatch = matchCollection === CHALLENGE_MATCHES_COLLECTION;
  const lineupIds = new Set(
    isChallengeMatch
      ? (match.players ?? []).map(p => p.groupMemberId)
      : [
          ...(match.players1 ?? []).map(p => p.groupMemberId),
          ...(match.players2 ?? []).map(p => p.groupMemberId),
        ],
  );

  // Fetch all group members that have a linked user account
  const membersSnap = await db
    .collection(GROUP_MEMBERS_V2_COLLECTION)
    .where('groupId', '==', groupId)
    .get();

  if (membersSnap.empty) return;

  const playerUserIds = [];
  const nonPlayerUserIds = [];

  for (const memberDoc of membersSnap.docs) {
    const data = memberDoc.data();
    const userId = String(data.userId ?? '').trim();
    if (!userId) continue;
    if (lineupIds.has(memberDoc.id)) {
      playerUserIds.push(userId);
    } else {
      nonPlayerUserIds.push(userId);
    }
  }

  const usersRef = db.collection(USERS_COLLECTION);

  // ── "You're playing" notifications ──────────────────────────────────────
  if (playerUserIds.length > 0) {
    const userDocs = await Promise.all(playerUserIds.map(id => usersRef.doc(id).get()));
    const tokens = uniqueNonEmpty(
      userDocs.flatMap(doc => collectUserTokens(doc.data() ?? {})),
    );
    if (tokens.length > 0) {
      const payload = {
        notification: {
          title: '⚽ Recordatorio de partido',
          body: groupName
            ? `Recuerda que juegas en "${groupName}" el ${dateStr} a las ${timeStr}`
            : `Recuerda que tienes un partido el ${dateStr} a las ${timeStr}`,
        },
        data: { matchId, groupId, type: 'match-reminder-player' },
        android: { priority: 'high', notification: { channelId: 'mejengas_default_channel' } },
        apns: { headers: { 'apns-priority': '10' } },
      };
      for (const tokensChunk of chunk(tokens, MAX_TOKENS_PER_BATCH)) {
        await admin.messaging().sendEachForMulticast({ tokens: tokensChunk, ...payload });
      }
    }
  }

  // ── "You can join" notifications ─────────────────────────────────────────
  if (nonPlayerUserIds.length > 0) {
    const userDocs = await Promise.all(nonPlayerUserIds.map(id => usersRef.doc(id).get()));
    const tokens = uniqueNonEmpty(
      userDocs.flatMap(doc => collectUserTokens(doc.data() ?? {})),
    );
    if (tokens.length > 0) {
      const payload = {
        notification: {
          title: '📅 Partido programado',
          body: groupName
            ? `Recuerda que puedes anotarte al partido de "${groupName}" del ${dateStr} a las ${timeStr}`
            : `Hay un partido el ${dateStr} a las ${timeStr} en el que puedes anotarte`,
        },
        data: { matchId, groupId, type: 'match-reminder-group' },
        android: { priority: 'high', notification: { channelId: 'mejengas_default_channel' } },
        apns: { headers: { 'apns-priority': '10' } },
      };
      for (const tokensChunk of chunk(tokens, MAX_TOKENS_PER_BATCH)) {
        await admin.messaging().sendEachForMulticast({ tokens: tokensChunk, ...payload });
      }
    }
  }
};

// ─── Scheduled: send pending reminders every hour ─────────────────────────────

/**
 * Runs every 1 hour. Queries matchReminders where status == 'pending' and
 * scheduledAt <= now. For each, sends personalized notifications and marks
 * the reminder as sent.
 *
 * Requires a composite Firestore index on matchReminders:
 *   (status ASC, scheduledAt ASC)
 */
exports.sendMatchReminders = onSchedule('every 1 hours', async () => {
  const db = admin.firestore();
  const now = admin.firestore.Timestamp.now();

  const snap = await db
    .collection(MATCH_REMINDERS_COLLECTION)
    .where('status', '==', 'pending')
    .where('scheduledAt', '<=', now)
    .get();

  if (snap.empty) {
    logger.info('sendMatchReminders: no pending reminders');
    return;
  }

  logger.info('sendMatchReminders: processing', { count: snap.size });

  for (const doc of snap.docs) {
    try {
      const { matchId, groupId, matchDate, matchCollection } = doc.data();
      const matchDateObj = matchDate?.toDate ? matchDate.toDate() : new Date();
      // Default to 'matches' for backward compatibility with existing reminder docs
      const resolvedCollection = matchCollection ?? MATCHES_COLLECTION;

      const groupDoc = await db.collection(GROUPS_COLLECTION).doc(groupId).get();
      const groupName = groupDoc.exists ? String(groupDoc.data().name ?? '').trim() : '';

      await sendPersonalizedReminders(db, matchId, groupId, matchDateObj, groupName, resolvedCollection);

      await doc.ref.update({
        status: 'sent',
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      logger.info('sendMatchReminders: reminder sent', { reminderId: doc.id, matchId });
    } catch (err) {
      logger.error('sendMatchReminders: error processing reminder', {
        reminderId: doc.id,
        error: err?.message ?? String(err),
      });
    }
  }
});

// ─── Trigger: match updated ────────────────────────────────────────────────────

/**
 * Fires on every match document update. Handles two cases:
 *
 * 1. status changed to 'cancelled':
 *    - Cancels all pending reminders in matchReminders
 *    - Sends a "match cancelled" notification to all group members
 *
 * 2. status is still 'scheduled' and date changed:
 *    - Cancels all existing pending reminders
 *    - Creates 3 new reminders based on the new date
 */
exports.onMatchUpdated = onDocumentUpdated('matches/{matchId}', async event => {
  const matchId = event.params.matchId;
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();

  if (!before || !after) return;

  const db = admin.firestore();

  // ── Case 1: Match cancelled ──────────────────────────────────────────────
  if (before.status !== 'cancelled' && after.status === 'cancelled') {
    const groupId = after.groupId;
    if (!groupId) return;

    // Cancel pending reminders
    const remindersSnap = await db
      .collection(MATCH_REMINDERS_COLLECTION)
      .where('matchId', '==', matchId)
      .where('status', '==', 'pending')
      .get();

    if (!remindersSnap.empty) {
      const cancelBatch = db.batch();
      remindersSnap.docs.forEach(doc =>
        cancelBatch.update(doc.ref, { status: 'cancelled' }),
      );
      await cancelBatch.commit();
      logger.info('onMatchUpdated: pending reminders cancelled', { matchId, count: remindersSnap.size });
    }

    // Build cancellation notification
    const groupDoc = await db.collection(GROUPS_COLLECTION).doc(groupId).get();
    const groupName = groupDoc.exists ? String(groupDoc.data().name ?? '').trim() : '';

    const matchDate = after.date?.toDate ? after.date.toDate() : new Date();
    const dateStr = formatDate(matchDate);
    const timeStr = formatTime(matchDate);

    const membersSnap = await db
      .collection(GROUP_MEMBERS_V2_COLLECTION)
      .where('groupId', '==', groupId)
      .get();

    if (membersSnap.empty) return;

    const userIds = uniqueNonEmpty(
      membersSnap.docs.map(doc => String(doc.data().userId ?? '').trim()).filter(Boolean),
    );
    if (userIds.length === 0) return;

    const usersRef = db.collection(USERS_COLLECTION);
    const userDocs = await Promise.all(userIds.map(id => usersRef.doc(id).get()));
    const tokens = uniqueNonEmpty(
      userDocs.flatMap(doc => collectUserTokens(doc.data() ?? {})),
    );
    if (tokens.length === 0) return;

    const payload = {
      notification: {
        title: '❌ Partido cancelado',
        body: groupName
          ? `El partido de "${groupName}" del ${dateStr} a las ${timeStr} ha sido cancelado`
          : `El partido del ${dateStr} a las ${timeStr} ha sido cancelado`,
      },
      data: { matchId, groupId, type: 'match-cancelled' },
      android: { priority: 'high', notification: { channelId: 'mejengas_default_channel' } },
      apns: { headers: { 'apns-priority': '10' } },
    };

    for (const tokensChunk of chunk(tokens, MAX_TOKENS_PER_BATCH)) {
      await admin.messaging().sendEachForMulticast({ tokens: tokensChunk, ...payload });
    }

    logger.info('onMatchUpdated: cancellation notification sent', { matchId, groupId });
    return;
  }

  // ── Case 2: Date changed on a still-scheduled match ─────────────────────
  if (
    after.status === 'scheduled' &&
    before.date?.toMillis() !== after.date?.toMillis()
  ) {
    const groupId = after.groupId;
    const newMatchDate = after.date;
    if (!newMatchDate || !groupId) return;

    const now = admin.firestore.Timestamp.now();

    const existingSnap = await db
      .collection(MATCH_REMINDERS_COLLECTION)
      .where('matchId', '==', matchId)
      .where('status', '==', 'pending')
      .get();

    const batch = db.batch();
    existingSnap.docs.forEach(doc => batch.update(doc.ref, { status: 'cancelled' }));

    const created = createReminderDocs(batch, db, matchId, groupId, newMatchDate, now, MATCHES_COLLECTION);

    await batch.commit();
    logger.info('onMatchUpdated: reminders recalculated', { matchId, created });
  }
});

// ─── Trigger: challenge match updated ─────────────────────────────────────────

/**
 * Mirrors onMatchUpdated for the matchesByChallenge collection.
 *
 * 1. status changed to 'cancelled':
 *    - Cancels all pending reminders
 *    - Sends a "match cancelled" notification to all group members
 *
 * 2. status is still 'scheduled' and date changed:
 *    - Cancels all existing pending reminders
 *    - Creates 3 new reminders based on the new date
 */
exports.onChallengeMatchUpdated = onDocumentUpdated('matchesByChallenge/{matchId}', async event => {
  const matchId = event.params.matchId;
  const before = event.data?.before?.data();
  const after = event.data?.after?.data();

  if (!before || !after) return;

  const db = admin.firestore();

  // ── Case 1: Match cancelled ──────────────────────────────────────────────
  if (before.status !== 'cancelled' && after.status === 'cancelled') {
    const groupId = after.groupId;
    if (!groupId) return;

    // Cancel pending reminders
    const remindersSnap = await db
      .collection(MATCH_REMINDERS_COLLECTION)
      .where('matchId', '==', matchId)
      .where('status', '==', 'pending')
      .get();

    if (!remindersSnap.empty) {
      const cancelBatch = db.batch();
      remindersSnap.docs.forEach(doc =>
        cancelBatch.update(doc.ref, { status: 'cancelled' }),
      );
      await cancelBatch.commit();
      logger.info('onChallengeMatchUpdated: pending reminders cancelled', { matchId, count: remindersSnap.size });
    }

    // Build cancellation notification
    const groupDoc = await db.collection(GROUPS_COLLECTION).doc(groupId).get();
    const groupName = groupDoc.exists ? String(groupDoc.data().name ?? '').trim() : '';

    const matchDate = after.date?.toDate ? after.date.toDate() : new Date();
    const dateStr = formatDate(matchDate);
    const timeStr = formatTime(matchDate);

    const membersSnap = await db
      .collection(GROUP_MEMBERS_V2_COLLECTION)
      .where('groupId', '==', groupId)
      .get();

    if (membersSnap.empty) return;

    const userIds = uniqueNonEmpty(
      membersSnap.docs.map(doc => String(doc.data().userId ?? '').trim()).filter(Boolean),
    );
    if (userIds.length === 0) return;

    const usersRef = db.collection(USERS_COLLECTION);
    const userDocs = await Promise.all(userIds.map(id => usersRef.doc(id).get()));
    const tokens = uniqueNonEmpty(
      userDocs.flatMap(doc => collectUserTokens(doc.data() ?? {})),
    );
    if (tokens.length === 0) return;

    const payload = {
      notification: {
        title: '❌ Partido cancelado',
        body: groupName
          ? `El partido de "${groupName}" del ${dateStr} a las ${timeStr} ha sido cancelado`
          : `El partido del ${dateStr} a las ${timeStr} ha sido cancelado`,
      },
      data: { matchId, groupId, type: 'match-cancelled' },
      android: { priority: 'high', notification: { channelId: 'mejengas_default_channel' } },
      apns: { headers: { 'apns-priority': '10' } },
    };

    for (const tokensChunk of chunk(tokens, MAX_TOKENS_PER_BATCH)) {
      await admin.messaging().sendEachForMulticast({ tokens: tokensChunk, ...payload });
    }

    logger.info('onChallengeMatchUpdated: cancellation notification sent', { matchId, groupId });
    return;
  }

  // ── Case 2: Date changed on a still-scheduled match ─────────────────────
  if (
    after.status === 'scheduled' &&
    before.date?.toMillis() !== after.date?.toMillis()
  ) {
    const groupId = after.groupId;
    const newMatchDate = after.date;
    if (!newMatchDate || !groupId) return;

    const now = admin.firestore.Timestamp.now();

    const existingSnap = await db
      .collection(MATCH_REMINDERS_COLLECTION)
      .where('matchId', '==', matchId)
      .where('status', '==', 'pending')
      .get();

    const batch = db.batch();
    existingSnap.docs.forEach(doc => batch.update(doc.ref, { status: 'cancelled' }));

    const created = createReminderDocs(batch, db, matchId, groupId, newMatchDate, now, CHALLENGE_MATCHES_COLLECTION);

    await batch.commit();
    logger.info('onChallengeMatchUpdated: reminders recalculated', { matchId, created });
  }
});
