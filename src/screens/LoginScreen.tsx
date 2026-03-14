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
  Divider,
  HelperText,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { AuthStackParamList } from '../navigation/types';
import { useAppDispatch, useAppSelector } from '../app/hooks';
import {
  clearAuthError,
  signInWithEmail,
  signInWithGoogle,
  signInWithApple,
} from '../features/auth/authSlice';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export default function LoginScreen({ navigation }: Props) {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const { status, error } = useAppSelector(state => state.auth);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const isBusy = status === 'loading';
  const isValid = useMemo(() => {
    const trimmedEmail = email.trim();
    return trimmedEmail.length > 0 && password.length >= 6;
  }, [email, password]);

  const onLoginPress = async () => {
    dispatch(clearAuthError());
    await dispatch(signInWithEmail({ email, password }));
  };

  const onGooglePress = async () => {
    dispatch(clearAuthError());
    await dispatch(signInWithGoogle());
  };

  const onApplePress = async () => {
    dispatch(clearAuthError());
    await dispatch(signInWithApple());
  };

  const onGoToRegisterPress = () => {
    dispatch(clearAuthError());
    navigation.navigate('Register');
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
        {/* Logo / brand area */}
        <View style={styles.brandArea}>
          <Text variant="displaySmall" style={[styles.title, { color: theme.colors.primary }]}>
            Mejengas
          </Text>
          <Text variant="bodyMedium" style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}>
            Iniciá sesión para armar partidos y anotar resultados.
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
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoComplete="password"
            textContentType="password"
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

          <HelperText
            type={error ? 'error' : 'info'}
            visible={Boolean(error) || password.length > 0}
          >
            {error ?? 'La contraseña debe tener al menos 6 caracteres.'}
          </HelperText>

          <Button
            mode="contained"
            onPress={onLoginPress}
            disabled={!isValid || isBusy}
            loading={isBusy}
            style={styles.primaryButton}
            contentStyle={styles.buttonContent}
          >
            Iniciar sesión
          </Button>

          <View style={styles.dividerRow}>
            <Divider style={styles.divider} />
            <Text variant="labelSmall" style={[styles.dividerText, { color: theme.colors.onSurfaceVariant }]}>
              O
            </Text>
            <Divider style={styles.divider} />
          </View>

          <Button
            mode="outlined"
            onPress={onGooglePress}
            disabled={isBusy}
            icon="google"
            style={styles.socialButton}
            contentStyle={styles.buttonContent}
          >
            Continuar con Google
          </Button>

          {Platform.OS === 'ios' && (
            <Button
              mode="outlined"
              onPress={onApplePress}
              disabled={isBusy}
              icon="apple"
              style={styles.socialButton}
              contentStyle={styles.buttonContent}
            >
              Continuar con Apple
            </Button>
          )}

          <Button
            mode="text"
            onPress={onGoToRegisterPress}
            disabled={isBusy}
            style={styles.secondaryAction}
          >
            Crear cuenta
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
  socialButton: {
    borderRadius: 10,
  },
  buttonContent: {
    paddingVertical: 4,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 8,
  },
  divider: {
    flex: 1,
  },
  dividerText: {
    letterSpacing: 1,
  },
  secondaryAction: {
    marginTop: 4,
  },
});
