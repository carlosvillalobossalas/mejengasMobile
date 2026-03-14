import React, { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import {
  Button,
  HelperText,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { AuthStackParamList } from '../navigation/types';
import { useAppDispatch, useAppSelector } from '../app/hooks';
import { clearAuthError, registerWithEmail } from '../features/auth/authSlice';

type Props = NativeStackScreenProps<AuthStackParamList, 'Register'>;

export default function RegisterScreen({ navigation }: Props) {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const { status, error } = useAppSelector(state => state.auth);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const isBusy = status === 'loading';
  const passwordsMatch = password.length > 0 && password === confirmPassword;
  const isValid = useMemo(() => {
    const trimmedEmail = email.trim();
    return trimmedEmail.length > 0 && password.length >= 6 && passwordsMatch;
  }, [email, password, passwordsMatch]);

  const onRegisterPress = async () => {
    dispatch(clearAuthError());
    await dispatch(registerWithEmail({ email, password }));
  };

  const onBackToLoginPress = () => {
    dispatch(clearAuthError());
    navigation.goBack();
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Brand area */}
        <View style={styles.brandArea}>
          <Text variant="displaySmall" style={[styles.title, { color: theme.colors.primary }]}>
            Mejengas
          </Text>
          <Text variant="bodyMedium" style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}>
            Creá tu cuenta con correo y contraseña.
          </Text>
        </View>

        {/* Card */}
        <View style={styles.card}>
          <TextInput
            label="Correo"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            mode="outlined"
            style={styles.input}
            left={<TextInput.Icon icon="email-outline" />}
          />

          <TextInput
            label="Contraseña"
            value={password}
            onChangeText={text => {
              setPassword(text);
              if (confirmPassword.length > 0 && text !== confirmPassword) {
                dispatch(clearAuthError());
              }
            }}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            mode="outlined"
            style={styles.input}
            left={<TextInput.Icon icon="lock-outline" />}
            right={
              <TextInput.Icon
                icon={showPassword ? 'eye-off-outline' : 'eye-outline'}
                onPress={() => setShowPassword(prev => !prev)}
              />
            }
          />

          <TextInput
            label="Confirmar contraseña"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            mode="outlined"
            style={styles.input}
            left={<TextInput.Icon icon="lock-check-outline" />}
          />

          <HelperText
            type={
              error
                ? 'error'
                : passwordsMatch || confirmPassword.length === 0
                  ? 'info'
                  : 'error'
            }
            visible={Boolean(error) || confirmPassword.length > 0}
          >
            {error ??
              (passwordsMatch
                ? 'Todo bien con la contraseña.'
                : 'Las contraseñas no coinciden.')}
          </HelperText>

          <Button
            mode="contained"
            onPress={onRegisterPress}
            disabled={!isValid || isBusy}
            loading={isBusy}
            style={styles.primaryButton}
            contentStyle={styles.buttonContent}
          >
            Crear cuenta
          </Button>

          <Button
            mode="text"
            onPress={onBackToLoginPress}
            disabled={isBusy}
            style={styles.secondaryAction}
          >
            Volver
          </Button>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F4F7',
  },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
    justifyContent: 'center',
    gap: 8,
  },
  brandArea: {
    alignItems: 'center',
    marginBottom: 24,
    gap: 6,
  },
  title: {
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  subtitle: {
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 16,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  input: {
    backgroundColor: '#FFFFFF',
    marginTop: 4,
  },
  primaryButton: {
    marginTop: 4,
    borderRadius: 10,
  },
  buttonContent: {
    paddingVertical: 4,
  },
  secondaryAction: {
    marginTop: 4,
  },
});
