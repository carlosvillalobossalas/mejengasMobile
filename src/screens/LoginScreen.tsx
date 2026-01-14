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
  Surface,
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
        <Surface style={styles.card} elevation={1}>
          <Text variant="headlineLarge" style={styles.title}>
            Mejengas
          </Text>
          <Text
            variant="bodyMedium"
            style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}
          >
            Iniciá sesión para armar partidos y anotar resultados.
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
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoComplete="password"
            textContentType="password"
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
          >
            Iniciar sesión
          </Button>

          <View style={styles.dividerRow}>
            <Divider style={styles.divider} />
            <Text
              variant="labelSmall"
              style={[
                styles.dividerText,
                { color: theme.colors.onSurfaceVariant },
              ]}
            >
              O
            </Text>
            <Divider style={styles.divider} />
          </View>

          <Button
            mode="outlined"
            onPress={onGooglePress}
            disabled={isBusy}
            icon="google"
          >
            Continuar con Google
          </Button>

          <Button
            mode="text"
            onPress={onGoToRegisterPress}
            disabled={isBusy}
            style={styles.secondaryAction}
          >
            Crear cuenta
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
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: 14,
  },
  input: {
    marginTop: 8,
  },
  primaryButton: {
    marginTop: 8,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 10,
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
