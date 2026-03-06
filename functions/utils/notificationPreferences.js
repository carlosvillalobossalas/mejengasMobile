const NOTIFICATION_TYPES = [
  'newMatches',
  'matchReminders',
  'matchUpdates',
  'mvpReminders',
  'mvpResults',
  'joinRequests',
  'joinRequestUpdates',
  'invites',
];

const buildDefaultGroupPreferences = () => ({
  all: true,
  newMatches: true,
  matchReminders: true,
  matchUpdates: true,
  mvpReminders: true,
  mvpResults: true,
  joinRequests: true,
  joinRequestUpdates: true,
  invites: true,
});

const isBoolean = value => typeof value === 'boolean';

const normalizeGroupPreferences = value => {
  const defaults = buildDefaultGroupPreferences();
  const raw = typeof value === 'object' && value !== null ? value : {};

  return {
    all: isBoolean(raw.all) ? raw.all : defaults.all,
    newMatches: isBoolean(raw.newMatches) ? raw.newMatches : defaults.newMatches,
    matchReminders: isBoolean(raw.matchReminders) ? raw.matchReminders : defaults.matchReminders,
    matchUpdates: isBoolean(raw.matchUpdates) ? raw.matchUpdates : defaults.matchUpdates,
    mvpReminders: isBoolean(raw.mvpReminders) ? raw.mvpReminders : defaults.mvpReminders,
    mvpResults: isBoolean(raw.mvpResults) ? raw.mvpResults : defaults.mvpResults,
    joinRequests: isBoolean(raw.joinRequests) ? raw.joinRequests : defaults.joinRequests,
    joinRequestUpdates: isBoolean(raw.joinRequestUpdates) ? raw.joinRequestUpdates : defaults.joinRequestUpdates,
    invites: isBoolean(raw.invites) ? raw.invites : defaults.invites,
  };
};

const normalizeUserNotificationPreferences = userData => {
  const raw = typeof userData?.notificationPreferences === 'object' && userData.notificationPreferences !== null
    ? userData.notificationPreferences
    : {};

  const globalEnabled = isBoolean(raw.globalEnabled) ? raw.globalEnabled : true;
  const groupsRaw = typeof raw.groups === 'object' && raw.groups !== null ? raw.groups : {};

  const groups = {};
  for (const [groupId, groupPreferences] of Object.entries(groupsRaw)) {
    groups[groupId] = normalizeGroupPreferences(groupPreferences);
  }

  return {
    globalEnabled,
    groups,
  };
};

const isNotificationEnabled = (userData, groupId, type) => {
  if (!NOTIFICATION_TYPES.includes(type)) {
    return true;
  }

  const prefs = normalizeUserNotificationPreferences(userData);

  if (!prefs.globalEnabled) {
    return false;
  }

  if (!groupId) {
    return true;
  }

  const groupPreferences = prefs.groups[groupId] || buildDefaultGroupPreferences();

  if (groupPreferences.all === false) {
    return groupPreferences[type] === true;
  }

  if (isBoolean(groupPreferences[type])) {
    return groupPreferences[type];
  }

  return true;
};

module.exports = {
  NOTIFICATION_TYPES,
  buildDefaultGroupPreferences,
  normalizeUserNotificationPreferences,
  isNotificationEnabled,
};
