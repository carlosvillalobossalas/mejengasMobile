/* eslint-env jest */

require('react-native-gesture-handler/jestSetup');

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => undefined),
    removeItem: jest.fn(async () => undefined),
    clear: jest.fn(async () => undefined),
  },
}));

jest.mock('@react-native-vector-icons/material-design-icons', () => ({
  MaterialDesignIcons: 'Icon',
}));

jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');

jest.mock('@gorhom/bottom-sheet', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: React.forwardRef(() => null),
    BottomSheetBackdrop: () => null,
    BottomSheetFlatList: require('react-native').FlatList,
  };
});

jest.mock('react-native-reanimated', () => {
  const ReactNative = require('react-native');

  const Animated = {
    View: ReactNative.View,
    Text: ReactNative.Text,
    Image: ReactNative.Image,
    ScrollView: ReactNative.ScrollView,
    FlatList: ReactNative.FlatList,
    createAnimatedComponent: component => component,
  };

  return {
    __esModule: true,
    default: Animated,
    ReduceMotion: { Never: 0 },
    interpolate: value => value,
    runOnJS: fn => fn,
    runOnUI: fn => fn,
    useAnimatedProps: () => ({}),
    useAnimatedStyle: () => ({}),
    useDerivedValue: initializer => ({ value: initializer() }),
    useSharedValue: initialValue => ({ value: initialValue }),
    withSpring: value => value,
    withTiming: value => value,
  };
});

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
