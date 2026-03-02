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
  Matches: undefined;
  MatchesByTeams: undefined;
  Profile: undefined;
  Invitations: undefined;
  Admin: undefined;
  JoinRequests: undefined;
  AddMatch: undefined;
  AddMatchTeams: undefined;
  AddPlayer: undefined;
  LinkPlayers: undefined;
  ManageMembers: undefined;
  ManageTeams: undefined;
  TeamStandings: undefined;
  TeamForm: { teamId?: string };
  EditMatch: { matchId: string };
  Logout: undefined;
};
