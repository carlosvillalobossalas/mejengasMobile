import { getInvitesByEmail, type Invite } from '../../repositories/invites/invitesRepository';
import { getGroupsByIds, type Group } from '../../repositories/groups/groupsRepository';

export type InviteWithGroup = Invite & {
  group: Group | null;
};

/**
 * Get all pending invites for a user with group information
 */
export async function getInvitesWithGroupInfo(email: string): Promise<InviteWithGroup[]> {
  // Get all pending invites
  const invites = await getInvitesByEmail(email);

  if (invites.length === 0) {
    return [];
  }

  // Get unique group IDs
  const groupIds = [...new Set(invites.map(invite => invite.groupId))];

  // Get all groups
  const groupsMap = await getGroupsByIds(groupIds);

  // Map invites with their groups
  return invites.map(invite => ({
    ...invite,
    group: groupsMap.get(invite.groupId) || null,
  }));
}
