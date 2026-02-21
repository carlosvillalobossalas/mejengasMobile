import { Linking, Share } from 'react-native';
import type { Match } from '../../repositories/matches/matchesRepository';
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
  // Capitalise first letter
  const capitalized = weekday.charAt(0).toUpperCase() + weekday.slice(1);
  return `${capitalized}, ${day} de ${month} de ${year}`;
};

/**
 * Builds a WhatsApp-friendly text summary for a single match.
 */
export function buildMatchSummaryText(match: Match, allPlayers: GroupMemberV2[]): string {
  const lines: string[] = [];

  lines.push(`⚽ *Partido - ${formatDate(match.date)}*`);
  lines.push('');

  // Score
  const scoreResult =
    match.goalsTeam1 > match.goalsTeam2
      ? '🏆 Victoria Equipo 1'
      : match.goalsTeam2 > match.goalsTeam1
        ? '🏆 Victoria Equipo 2'
        : '🤝 Empate';

  lines.push(`🔵 *Equipo 1*  ${match.goalsTeam1} - ${match.goalsTeam2}  *Equipo 2* 🔴`);
  lines.push(scoreResult);
  lines.push('');
  lines.push('──────────────────');

  // Team 1 players grouped by position order: POR → DEF → MED → DEL
  const positionOrder = ['POR', 'DEF', 'MED', 'DEL'];
  const sortByPosition = <T extends { position: string }>(players: T[]) =>
    [...players].sort(
      (a, b) => positionOrder.indexOf(a.position) - positionOrder.indexOf(b.position),
    );

  lines.push('');
  lines.push('🔵 *EQUIPO 1*');
  sortByPosition(match.players1).forEach(p => {
    if (!p.groupMemberId) return;
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

  lines.push('');
  lines.push('🔴 *EQUIPO 2*');
  sortByPosition(match.players2).forEach(p => {
    if (!p.groupMemberId) return;
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

  lines.push('');
  lines.push('──────────────────');

  // MVP summary line if exists
  if (match.mvpGroupMemberId) {
    const mvpName = getDisplayName(match.mvpGroupMemberId, allPlayers);
    lines.push(`⭐ *MVP:* ${mvpName}`);
    lines.push('');
  }

  lines.push('_Enviado desde Mejengas_ 📱');

  return lines.join('\n');
}

/**
 * Opens WhatsApp with the pre-filled match summary.
 * If WhatsApp is not installed, falls back to the native Share sheet.
 */
export async function shareMatchOnWhatsApp(
  match: Match,
  allPlayers: GroupMemberV2[],
): Promise<void> {
  const text = buildMatchSummaryText(match, allPlayers);
  const whatsappUrl = `whatsapp://send?text=${encodeURIComponent(text)}`;

  try {
    const canOpen = await Linking.canOpenURL(whatsappUrl);

    if (canOpen) {
      await Linking.openURL(whatsappUrl);
      return;
    }
  } catch {
    // canOpenURL or openURL failed (e.g. scheme not in LSApplicationQueriesSchemes)
    // Fall through to native share sheet
  }

  // Fallback: native share sheet (user can still pick WhatsApp if installed)
  await Share.share({ message: text });
}
