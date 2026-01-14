module.exports = {
  preset: 'react-native',
  setupFiles: ['<rootDir>/jest.setup.js'],
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|@react-navigation|react-native-paper|react-native-safe-area-context|react-native-screens|react-redux|@reduxjs/toolkit|immer|redux|reselect|react-native-vector-icons|@react-native-firebase|@react-native-google-signin)/)',
  ],
};
