const admin = require('firebase-admin');
admin.initializeApp();

const { notifyGroupOnNewMatch } = require('./handlers/notifyOnNewMatch');
const { notifyUserOnInvite } = require('./handlers/notifyOnInvite');
const { calculateMvpWinners } = require('./handlers/calculateMvpWinners');
const { remindMvpVoters } = require('./handlers/remindMvpVoters');
const { editMatch } = require('./handlers/editMatch');
const { deleteMatch } = require('./handlers/deleteMatch');
const { notifyAdminsOnJoinRequest } = require('./handlers/notifyOnJoinRequest');
const { notifyUserOnJoinRequestUpdate } = require('./handlers/notifyOnJoinRequestUpdate');
const { sendMatchReminders, onMatchCreated, onMatchUpdated, onChallengeMatchCreated, onChallengeMatchUpdated, onMatchByTeamsCreated, onMatchByTeamsUpdated } = require('./handlers/matchRemindersHandler');
const { editChallengeMatch } = require('./handlers/editChallengeMatch');
const { deleteChallengeMatch } = require('./handlers/deleteChallengeMatch');
const { calculateChallengeMvpWinners } = require('./handlers/calculateChallengeMvpWinners');
const { remindChallengeMvpVoters } = require('./handlers/remindChallengeMvpVoters');
const { migrateUserNotificationPreferences } = require('./handlers/migrateUserNotificationPreferences');
const { migrateGroupDefaultKitColors } = require('./handlers/migrateGroupDefaultKitColors');
const {
	onMatchSignupUpdated,
	onChallengeMatchSignupUpdated,
	onMatchByTeamsSignupUpdated,
} = require('./handlers/matchSignupNotificationsHandler');
const { applyPublicMatchApplication } = require('./handlers/applyPublicMatchApplication');
const { reviewPublicMatchApplication } = require('./handlers/reviewPublicMatchApplication');
const { getOpenPublicMatchListings } = require('./handlers/getOpenPublicMatchListings');
const { getMyPublicMatchApplications } = require('./handlers/getMyPublicMatchApplications');
const { getPendingPublicMatchApplications } = require('./handlers/getPendingPublicMatchApplications');

exports.notifyGroupOnNewMatch = notifyGroupOnNewMatch;
exports.notifyUserOnInvite = notifyUserOnInvite;
exports.calculateMvpWinners = calculateMvpWinners;
exports.remindMvpVoters = remindMvpVoters;
exports.editMatch = editMatch;
exports.deleteMatch = deleteMatch;
exports.notifyAdminsOnJoinRequest = notifyAdminsOnJoinRequest;
exports.notifyUserOnJoinRequestUpdate = notifyUserOnJoinRequestUpdate;
exports.sendMatchReminders = sendMatchReminders;
exports.onMatchCreated = onMatchCreated;
exports.onMatchUpdated = onMatchUpdated;
exports.onChallengeMatchCreated = onChallengeMatchCreated;
exports.onChallengeMatchUpdated = onChallengeMatchUpdated;
exports.onMatchByTeamsCreated = onMatchByTeamsCreated;
exports.onMatchByTeamsUpdated = onMatchByTeamsUpdated;
exports.editChallengeMatch = editChallengeMatch;
exports.deleteChallengeMatch = deleteChallengeMatch;
exports.calculateChallengeMvpWinners = calculateChallengeMvpWinners;
exports.remindChallengeMvpVoters = remindChallengeMvpVoters;
exports.migrateUserNotificationPreferences = migrateUserNotificationPreferences;
exports.migrateGroupDefaultKitColors = migrateGroupDefaultKitColors;
exports.onMatchSignupUpdated = onMatchSignupUpdated;
exports.onChallengeMatchSignupUpdated = onChallengeMatchSignupUpdated;
exports.onMatchByTeamsSignupUpdated = onMatchByTeamsSignupUpdated;
exports.applyPublicMatchApplication = applyPublicMatchApplication;
exports.reviewPublicMatchApplication = reviewPublicMatchApplication;
exports.getOpenPublicMatchListings = getOpenPublicMatchListings;
exports.getMyPublicMatchApplications = getMyPublicMatchApplications;
exports.getPendingPublicMatchApplications = getPendingPublicMatchApplications;
