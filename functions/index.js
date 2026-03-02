const admin = require('firebase-admin');
admin.initializeApp();

const { notifyGroupOnNewMatch } = require('./handlers/notifyOnNewMatch');
const { notifyUserOnInvite } = require('./handlers/notifyOnInvite');
const { calculateMvpWinners } = require('./handlers/calculateMvpWinners');
const { remindMvpVoters } = require('./handlers/remindMvpVoters');
const { editMatch } = require('./handlers/editMatch');

exports.notifyGroupOnNewMatch = notifyGroupOnNewMatch;
exports.notifyUserOnInvite = notifyUserOnInvite;
exports.calculateMvpWinners = calculateMvpWinners;
exports.remindMvpVoters = remindMvpVoters;
exports.editMatch = editMatch;
