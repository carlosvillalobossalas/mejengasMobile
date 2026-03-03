import { Linking, Share } from 'react-native';
import type { ChallengeMatch } from '../../repositories/matches/matchesByChallengeRepository';
import type { GroupMemberV2 } from '../../repositories/groupMembersV2/groupMembersV2Repository';

const POSITION_EMOJI: Record<string, string> = {
  POR: '🧤',
  DEF: '🛡️',
  MED: '⚙️',
  DEL: '⚡',
};

const getDisplayName = (groupMemberId: string, allPlayers: GroupMemberV2[]): string => {
  const member = allPlayers.find(p => p.id === groupMemberId);
  return member?.displayName ?? 'Desconocido';
};

const formatPlayerLine = (
  groupMemberId: string,
  position: string,
  goals: number,
  assists: number,
  ownGoals: number,
  allPlayers: GroupMemberV2[],
  isMvp: boolean,
): string => {
  const name = getDisplayName(groupMemberId, allPlayers);
  const posEmoji = POSITION_EMOJI[position] ?? '👤';

  const stats: string[] = [];
  if (goals > 0) stats.push(`⚽ x${goals}`);
  if (assists > 0) stats.push(`🅰️ x${assists}`);
  if (ownGoals > 0) stats.push(`🤦 x${ownGoals}`);
  if (isMvp) stats.push('⭐ MVP');

  const statsStr = stats.length > 0 ? `  ${stats.join('  ')}` : '';
  return `${posEmoji} ${name}${statsStr}`;
};

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  const weekday = date.toLocaleDateString('es-ES', { weekday: 'long' });
  const day = date.getDate();
  const month = date.toLocaleDateString('es-ES', { month: 'long' });
  const year = date.getFullYear();
  const capitalized = weekday.charAt(0).toUpperCase() + weekday.slice(1);
  return `${capitalized}, ${day} de ${month} de ${year}`;
};

const positionOrder = ['POR', 'DEF', 'MED', 'DEL'];

const sortByPosition = <T extends { position: string }>(players: T[]): T[] =>
  [...players].sort(
    (a, b) => positionOrder.indexOf(a.position) - positionOrder.indexOf(b.position),
  );

/**
 * Builds a WhatsApp-friendly text summary for a single challenge match.
 */
export function buildChallengeMatchSummaryText(
  match: ChallengeMatch,
  groupName: string,
  allPlayers: GroupMemberV2[],
): string {
  const lines: string[] = [];

  lines.push(`⚽ *Partido - ${formatDate(match.date)}*`);
  lines.push('');

  const opponentLabel = match.opponentName.trim() || 'Rival';

  if (match.status === 'finished') {
    const resultText =
      match.goalsTeam > match.goalsOpponent
        ? '🏆 Victoria'
        : match.goalsOpponent > match.goalsTeam
          ? '❌ Derrota'
          : '🤝 Empate';

    lines.push(`🔵 *${groupName}*  ${match.goalsTeam} - ${match.goalsOpponent}  *${opponentLabel}* 🔴`);
    lines.push(resultText);
  } else if (match.status === 'scheduled') {
    lines.push(`🔵 *${groupName}* vs *${opponentLabel}* 🔴`);
    lines.push('📅 Partido programado');
  } else {
    lines.push(`🔵 *${groupName}* vs *${opponentLabel}* 🔴`);
    lines.push('❌ Cancelado');
  }

  lines.push('');
  lines.push('──────────────────');

  // Players
  const starters = sortByPosition(match.players.filter(p => !p.isSub));
  const subs = match.players.filter(p => p.isSub);

  if (starters.length > 0) {
    lines.push('');
    lines.push(`🔵 *${groupName.toUpperCase()}*`);
    starters.forEach(p => {
      lines.push(
        formatPlayerLine(
          p.groupMemberId,
          p.position,
          p.goals,
          p.assists,
          p.ownGoals,
          allPlayers,
          p.groupMemberId === match.mvpGroupMemberId,
        ),
      );
    });

    if (subs.length > 0) {
      lines.push('');
      lines.push('👥 *Suplentes*');
      subs.forEach(p => {
        lines.push(
          formatPlayerLine(
            p.groupMemberId,
            p.position,
            p.goals,
            p.assists,
            p.ownGoals,
            allPlayers,
            p.groupMemberId === match.mvpGroupMemberId,
          ),
        );
      });
    }
  }

  lines.push('');
  lines.push('──────────────────');

  if (match.mvpGroupMemberId) {
    const mvpName = getDisplayName(match.mvpGroupMemberId, allPlayers);
    lines.push(`⭐ *MVP:* ${mvpName}`);
    lines.push('');
  }

  lines.push('_Enviado desde Mejengas_ 📱');

  return lines.join('\n');
}

/**
 * Opens WhatsApp with the pre-filled challenge match summary.
 * Falls back to the native Share sheet if WhatsApp is not installed.
 */
export async function shareChallengeMatchOnWhatsApp(
  match: ChallengeMatch,
  groupName: string,
  allPlayers: GroupMemberV2[],
): Promise<void> {
  const text = buildChallengeMatchSummaryText(match, groupName, allPlayers);
  const whatsappUrl = `whatsapp://send?text=${encodeURIComponent(text)}`;

  try {
    const canOpen = await Linking.canOpenURL(whatsappUrl);
    if (canOpen) {
      await Linking.openURL(whatsappUrl);
      return;
    }
  } catch {
    // Fall through to native share sheet
  }

  await Share.share({ message: text });
}
