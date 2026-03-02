const USERS_COLLECTION = 'users';
const GROUP_MEMBERS_COLLECTION = 'groupMembers';
const GROUPS_COLLECTION = 'groups';
const MAX_TOKENS_PER_BATCH = 500;

const uniqueNonEmpty = values => {
  const result = new Set();
  for (const value of values) {
    if (value) result.add(value);
  }
  return Array.from(result);
};

const chunk = (items, size) => {
  if (size <= 0) return [items];
  const result = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
};

const resolveGroupId = data => String(data.groupId ?? data.groupid ?? '').trim();

const resolveMemberUserId = data => String(data.userId ?? data.userid ?? '').trim();

const collectUserTokens = data => {
  const tokens = [];

  const token = typeof data.fcmToken === 'string' ? data.fcmToken.trim() : '';
  if (token) tokens.push(token);

  const tokenList = Array.isArray(data.fcmTokens) ? data.fcmTokens : [];
  for (const entry of tokenList) {
    if (typeof entry === 'string' && entry.trim()) tokens.push(entry.trim());
  }

  return tokens;
};

module.exports = {
  USERS_COLLECTION,
  GROUP_MEMBERS_COLLECTION,
  GROUPS_COLLECTION,
  MAX_TOKENS_PER_BATCH,
  uniqueNonEmpty,
  chunk,
  resolveGroupId,
  resolveMemberUserId,
  collectUserTokens,
};
