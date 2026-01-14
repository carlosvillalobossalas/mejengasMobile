jest.mock('@react-native-firebase/auth', () => {
  const mockAuthInstance = {
    currentUser: null,
    onAuthStateChanged: callback => {
      callback(null);
      return () => undefined;
    },
    signInWithEmailAndPassword: jest.fn(async () => ({
      user: { uid: 'test-uid', email: 'test@example.com' },
    })),
    createUserWithEmailAndPassword: jest.fn(async () => ({
      user: { uid: 'test-uid', email: 'test@example.com' },
    })),
    signInWithCredential: jest.fn(async () => ({
      user: { uid: 'test-uid', email: 'test@example.com' },
    })),
    signOut: jest.fn(async () => undefined),
  };

  const auth = () => mockAuthInstance;
  auth.GoogleAuthProvider = {
    credential: jest.fn(() => ({ providerId: 'google.com' })),
  };

  return auth;
});

jest.mock('@react-native-firebase/firestore', () => {
  const store = new Map();

  const firestore = () => ({
    collection: () => ({
      doc: id => ({
        get: async () => {
          const data = store.get(id);
          return {
            id,
            exists: Boolean(data),
            data: () => data,
          };
        },
        set: async data => {
          const existing = store.get(id) ?? {};
          store.set(id, { ...existing, ...data, uid: id });
        },
      }),
    }),
  });

  firestore.FieldValue = {
    serverTimestamp: () => null,
  };

  return firestore;
});

jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(async () => true),
    signIn: jest.fn(async () => ({ idToken: 'test-token' })),
    signOut: jest.fn(async () => undefined),
  },
}));
