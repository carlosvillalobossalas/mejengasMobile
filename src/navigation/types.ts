export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};

export type AppStackParamList = {
  Home: undefined;
};

export type AppDrawerParamList = {
  Home: undefined;
  Groups: undefined;
  PlayersTable: undefined;
  GoalkeepersTable: undefined;
  MyMatches: undefined;
  Matches: undefined;
  MatchesByTeams: undefined;
  ChallengeMatches: undefined;
  Profile: undefined;
  Invitations: undefined;
  PublicMatchApplications: undefined;
  Admin: undefined;
  JoinRequests: undefined;
  AddMatch: undefined;
  AddMatchTeams: undefined;
  AddChallengeMatch: undefined;
  AddPlayer: undefined;
  LinkPlayers: undefined;
  ManageMembers: undefined;
  GroupSettings: undefined;
  ManageTeams: undefined;
  TeamStandings: undefined;
  TeamForm: { teamId?: string };
  EditMatch: { matchId: string };
  EditChallengeMatch: { matchId: string };
  AddScheduledChallengeMatch: undefined;
  Logout: undefined;
};
