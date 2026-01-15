import React, { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
} from 'react-native';
import {
  Button,
  HelperText,
  Surface,
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
        <Surface style={styles.card} elevation={1}>
          <Text variant="headlineMedium" style={styles.title}>
            Crear cuenta
          </Text>
          <Text
            variant="bodyMedium"
            style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}
          >
            Creá tu cuenta con correo y contraseña.
          </Text>

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
            left={<TextInput.Icon icon="email" />}
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
            left={<TextInput.Icon icon="lock" />}
            right={
              <TextInput.Icon
                icon={showPassword ? 'eye-off' : 'eye'}
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
            left={<TextInput.Icon icon="lock-check" />}
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
        </Surface>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
    justifyContent: 'center',
  },
  card: {
    borderRadius: 16,
    padding: 18,
    gap: 8,
  },
  title: {
    marginBottom: 4,
    textAlign: 'center',
  },
  subtitle: {
    marginBottom: 16,
    textAlign: 'center',
  },
  input: {
    marginTop: 8,
  },
  primaryButton: {
    marginTop: 8,
  },
  secondaryAction: {
    marginTop: 4,
  },
});
