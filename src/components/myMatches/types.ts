export type MatchTypeFilter = 'all' | 'matches' | 'matchesByTeams' | 'matchesByChallenge';
export type MatchStatusFilter = 'all' | 'scheduled' | 'finished' | 'cancelled';
export type MatchParticipationFilter = 'all' | 'mine';

export type UnifiedMatchItem = {
    id: string;
    key: string;
    groupId: string;
    groupName: string;
    type: Exclude<MatchTypeFilter, 'all'>;
    date: string;
    status: 'scheduled' | 'finished' | 'cancelled';
    leftLabel: string;
    rightLabel: string;
    leftScore: number;
    rightScore: number;
    // true when the current user is listed as a player in this match
    isParticipant: boolean;
};

export type SelectedMatch = {
    id: string;
    groupId: string;
    type: UnifiedMatchItem['type'];
};

export const TYPE_LABEL: Record<UnifiedMatchItem['type'], string> = {
    matches: 'Libre',
    matchesByTeams: 'Por equipos',
    matchesByChallenge: 'Retos',
};

export const statusLabel = (status: MatchStatusFilter | UnifiedMatchItem['status']): string => {
    if (status === 'scheduled') return 'Por jugar';
    if (status === 'cancelled') return 'Cancelado';
    return 'Finalizado';
};
