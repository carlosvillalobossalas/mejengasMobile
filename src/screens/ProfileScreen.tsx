import React, { useEffect, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import auth from '@react-native-firebase/auth';
import {
  Text,
  Card,
  Avatar,
  useTheme,
  Surface,
  Divider,
  TextInput,
  Button,
  Portal,
  Dialog,
  Snackbar,
  Chip,
} from 'react-native-paper';
import { MaterialDesignIcons as Icon } from '@react-native-vector-icons/material-design-icons';

import { useAppDispatch, useAppSelector } from '../app/hooks';
import { fetchProfileData } from '../features/profile/profileSlice';
import { deleteAccount } from '../features/auth/authSlice';
import { updateUserDisplayName } from '../repositories/users/usersRepository';
import { updatePlayerNameByUserId } from '../repositories/players/playerSeasonStatsRepository';
import { updateDisplayNameByUserId } from '../repositories/groupMembersV2/groupMembersV2Repository';
import { useProfilePhoto } from '../hooks/useProfilePhoto';

export default function ProfileScreen() {
  const theme = useTheme();
  const dispatch = useAppDispatch();

  const { firestoreUser } = useAppSelector(state => state.auth);
  const { data: profileData, isLoading, error } = useAppSelector(state => state.profile);

  const [showEditNameDialog, setShowEditNameDialog] = useState(false);
  const [newName, setNewName] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [authProvider, setAuthProvider] = useState<'password' | 'google' | 'apple'>('password');

  const { isUploading, pickAndUpload } = useProfilePhoto();
  const [showCopied, setShowCopied] = useState(false);

  const handleCopyEmail = (email: string) => {
    Clipboard.setString(email);
    setShowCopied(true);
  };

  useEffect(() => {
    if (firestoreUser?.uid) {
      dispatch(fetchProfileData({ userId: firestoreUser.uid }));
    }
  }, [dispatch, firestoreUser?.uid]);

  const handleEditName = () => {
    setNewName(profileData?.user?.displayName ?? '');
    setShowEditNameDialog(true);
  };

  const handleSaveName = async () => {
    if (!firestoreUser?.uid || !newName.trim()) {
      return;
    }

    setIsUpdating(true);
    try {
      await Promise.all([
        updateUserDisplayName(firestoreUser.uid, newName.trim()),
        updatePlayerNameByUserId(firestoreUser.uid, newName.trim()),
        updateDisplayNameByUserId(firestoreUser.uid, newName.trim()),
      ]);

      // Refresh profile data
      await dispatch(fetchProfileData({ userId: firestoreUser.uid }));

      setShowEditNameDialog(false);
    } catch (error) {
      console.error('Error updating name:', error);
      // TODO: Show error toast
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteAccount = () => {
    // Detect auth provider from Firebase Auth
    const currentUser = auth().currentUser;
    if (!currentUser) {
      Alert.alert('Error', 'No hay usuario autenticado');
      return;
    }

    let detectedProvider: 'password' | 'google' | 'apple' = 'password';
    const providers = currentUser.providerData;
    
    if (providers.some(p => p.providerId === 'google.com')) {
      detectedProvider = 'google';
    } else if (providers.some(p => p.providerId === 'apple.com')) {
      detectedProvider = 'apple';
    }

    setAuthProvider(detectedProvider);

    Alert.alert(
      'Eliminar Cuenta',
      '¿Estás seguro que deseas eliminar tu cuenta? Esta acción es irreversible y se eliminarán todos tus datos.',
      [
        {
          text: 'Cancelar',
          style: 'cancel',
        },
        {
          text: 'Continuar',
          style: 'destructive',
          onPress: () => {
            setShowDeleteDialog(true);
          },
        },
      ],
    );
  };

  const handleConfirmDelete = async () => {
    if (!firestoreUser?.uid) {
      Alert.alert('Error', 'No se pudo obtener la información del usuario');
      return;
    }

    // Validate password if email/password provider
    if (authProvider === 'password' && !deletePassword.trim()) {
      Alert.alert('Error', 'Por favor ingresa tu contraseña');
      return;
    }

    setIsDeleting(true);
    try {
      await dispatch(
        deleteAccount({
          userId: firestoreUser.uid,
          provider: authProvider,
          password: authProvider === 'password' ? deletePassword : undefined,
        }),
      ).unwrap();
      
      setShowDeleteDialog(false);
      setDeletePassword('');
    } catch (error) {
      console.error('Error deleting account:', error);
      const errorMessage = typeof error === 'string' ? error : 'No se pudo eliminar la cuenta. Por favor intenta de nuevo.';
      Alert.alert('Error al eliminar cuenta', errorMessage);
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Cargando perfil...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Icon name="alert-circle" size={48} color={theme.colors.error} />
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  if (!profileData) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>No se encontró información del usuario</Text>
      </View>
    );
  }

  const { user, historicPlayer, historicGoalkeeper, hasPlayerStats, hasGoalkeeperStats, seasonCards } = profileData;

  const getInitials = (name: string | null) => {
    if (!name) return '?';
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const formatRecord = (won: number, draw: number, lost: number) => {
    return `${won}-${draw}-${lost}`;
  };

  return (
    <ScrollView style={styles.container}>
      {/* User Info Section */}
      <Surface style={styles.profileSection}>
        <TouchableOpacity
          style={styles.avatarContainer}
          onPress={() => firestoreUser?.uid && pickAndUpload(firestoreUser.uid)}
          disabled={isUploading}
        >
          {firestoreUser?.photoURL ? (
            <Avatar.Image size={100} source={{ uri: firestoreUser.photoURL }} />
          ) : (
            <Avatar.Text size={100} label={getInitials(user.displayName)} />
          )}
          <View style={[styles.cameraIconContainer, isUploading && styles.cameraIconUploading]}>
            {isUploading ? (
              <ActivityIndicator size={16} color="#FFFFFF" />
            ) : (
              <Icon name="camera" size={20} color="#FFFFFF" />
            )}
          </View>
        </TouchableOpacity>

        <View style={styles.nameContainer}>
          <Text style={styles.userName}>{user.displayName || 'Sin nombre'}</Text>
          <TouchableOpacity onPress={handleEditName} style={styles.editButton}>
            <Icon name="pencil" size={20} color={theme.colors.primary} />
          </TouchableOpacity>
        </View>
        {user.email && (
          <TouchableOpacity
            style={styles.emailRow}
            onPress={() => handleCopyEmail(user.email!)}
            activeOpacity={0.6}
          >
            <Text style={styles.userEmail}>{user.email}</Text>
            <Icon name="content-copy" size={14} color="#9E9E9E" style={styles.copyIcon} />
          </TouchableOpacity>
        )}
      </Surface>

      {/* ── Historic player totals ── */}
      {hasPlayerStats && (
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.cardHeader}>
              <Icon name="chart-bar" size={24} color={theme.colors.primary} />
              <Text style={styles.cardTitle}>
                {hasGoalkeeperStats ? 'Histórico como Jugador' : 'Histórico Total'}
              </Text>
            </View>
            <View style={styles.statsGrid}>
              <View style={styles.statItem}>
                <Icon name="soccer" size={28} color="#2196F3" />
                <Text style={styles.statValue}>{historicPlayer.goals}</Text>
                <Text style={styles.statLabel}>Goles</Text>
              </View>
              <View style={styles.statItem}>
                <Icon name="shoe-sneaker" size={28} color="#4CAF50" />
                <Text style={styles.statValue}>{historicPlayer.assists}</Text>
                <Text style={styles.statLabel}>Asistencias</Text>
              </View>
              <View style={styles.statItem}>
                <Icon name="tshirt-crew" size={28} color="#FF9800" />
                <Text style={styles.statValue}>
                  {formatRecord(historicPlayer.won, historicPlayer.draw, historicPlayer.lost)}
                </Text>
                <Text style={styles.statLabel}>V-E-D</Text>
              </View>
              <View style={styles.statItem}>
                <Icon name="star" size={28} color="#FFC107" />
                <Text style={styles.statValue}>{historicPlayer.mvp}</Text>
                <Text style={styles.statLabel}>MVPs</Text>
              </View>
            </View>
          </Card.Content>
        </Card>
      )}

      {/* ── Historic goalkeeper totals ── */}
      {hasGoalkeeperStats && (
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.cardHeader}>
              <Icon name="hand-back-right" size={24} color="#9C27B0" />
              <Text style={styles.cardTitle}>
                {hasPlayerStats ? 'Histórico como Portero' : 'Histórico Total'}
              </Text>
            </View>
            <View style={styles.statsGrid}>
              <View style={styles.statItem}>
                <Icon name="shield-check" size={28} color="#4CAF50" />
                <Text style={styles.statValue}>{historicGoalkeeper.cleanSheets}</Text>
                <Text style={styles.statLabel}>Vallas invictas</Text>
              </View>
              <View style={styles.statItem}>
                <Icon name="soccer" size={28} color="#F44336" />
                <Text style={styles.statValue}>{historicGoalkeeper.goalsConceded}</Text>
                <Text style={styles.statLabel}>Goles recibidos</Text>
              </View>
              <View style={styles.statItem}>
                <Icon name="tshirt-crew" size={28} color="#FF9800" />
                <Text style={styles.statValue}>
                  {formatRecord(historicGoalkeeper.won, historicGoalkeeper.draw, historicGoalkeeper.lost)}
                </Text>
                <Text style={styles.statLabel}>V-E-D</Text>
              </View>
              <View style={styles.statItem}>
                <Icon name="star" size={28} color="#FFC107" />
                <Text style={styles.statValue}>{historicGoalkeeper.mvp}</Text>
                <Text style={styles.statLabel}>MVPs</Text>
              </View>
            </View>
          </Card.Content>
        </Card>
      )}

      {/* ── Per-season cards ── */}
      {seasonCards.length > 0 && (
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.cardHeader}>
              <Icon name="calendar-star" size={24} color={theme.colors.primary} />
              <Text style={styles.cardTitle}>Por Temporada</Text>
            </View>

            {seasonCards.map(card => {
              const groupName = card.group?.name ?? 'Grupo desconocido';
              const isGoalkeeper = card.type === 'goalkeeper';

              return (
                <View key={card.id} style={styles.seasonCard}>
                  <View style={styles.seasonHeader}>
                    <View style={styles.seasonHeaderInfo}>
                      <Text style={styles.seasonGroupName}>{groupName}</Text>
                      <Text style={styles.seasonYear}>Temporada {card.season}</Text>
                    </View>
                    <Chip
                      compact
                      style={[styles.typeChip, isGoalkeeper ? styles.goalkeeperChip : styles.playerChip]}
                      textStyle={styles.typeChipText}
                    >
                      {isGoalkeeper ? 'Portero' : 'Jugador'}
                    </Chip>
                  </View>

                  <View style={styles.statsGrid}>
                    {isGoalkeeper && card.goalkeeperStats ? (
                      <>
                        <View style={styles.statItem}>
                          <Icon name="shield-check" size={24} color="#4CAF50" />
                          <Text style={styles.statValue}>{card.goalkeeperStats.cleanSheets}</Text>
                          <Text style={styles.statLabel}>Vallas invictas</Text>
                        </View>
                        <View style={styles.statItem}>
                          <Icon name="soccer" size={24} color="#F44336" />
                          <Text style={styles.statValue}>{card.goalkeeperStats.goalsConceded}</Text>
                          <Text style={styles.statLabel}>Goles recibidos</Text>
                        </View>
                        <View style={styles.statItem}>
                          <Icon name="tshirt-crew" size={24} color="#FF9800" />
                          <Text style={styles.statValue}>
                            {formatRecord(card.goalkeeperStats.won, card.goalkeeperStats.draw, card.goalkeeperStats.lost)}
                          </Text>
                          <Text style={styles.statLabel}>V-E-D</Text>
                        </View>
                        <View style={styles.statItem}>
                          <Icon name="star" size={24} color="#FFC107" />
                          <Text style={styles.statValue}>{card.goalkeeperStats.mvp}</Text>
                          <Text style={styles.statLabel}>MVPs</Text>
                        </View>
                      </>
                    ) : card.playerStats ? (
                      <>
                        <View style={styles.statItem}>
                          <Icon name="soccer" size={24} color="#2196F3" />
                          <Text style={styles.statValue}>{card.playerStats.goals}</Text>
                          <Text style={styles.statLabel}>Goles</Text>
                        </View>
                        <View style={styles.statItem}>
                          <Icon name="shoe-sneaker" size={24} color="#4CAF50" />
                          <Text style={styles.statValue}>{card.playerStats.assists}</Text>
                          <Text style={styles.statLabel}>Asistencias</Text>
                        </View>
                        <View style={styles.statItem}>
                          <Icon name="tshirt-crew" size={24} color="#FF9800" />
                          <Text style={styles.statValue}>
                            {formatRecord(card.playerStats.won, card.playerStats.draw, card.playerStats.lost)}
                          </Text>
                          <Text style={styles.statLabel}>V-E-D</Text>
                        </View>
                        <View style={styles.statItem}>
                          <Icon name="star" size={24} color="#FFC107" />
                          <Text style={styles.statValue}>{card.playerStats.mvp}</Text>
                          <Text style={styles.statLabel}>MVPs</Text>
                        </View>
                      </>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </Card.Content>
        </Card>
      )}

      {seasonCards.length === 0 && (
        <View style={styles.emptyContainer}>
          <Icon name="information-outline" size={48} color={theme.colors.onSurfaceDisabled} />
          <Text style={styles.emptyText}>No hay estadísticas disponibles todavía</Text>
        </View>
      )}

      {/* Delete Account Section */}
      <View style={styles.deleteAccountSection}>
        <Button
          mode="outlined"
          onPress={handleDeleteAccount}
          icon="delete-forever"
          textColor={theme.colors.error}
          style={[styles.deleteButton, { borderColor: theme.colors.error }]}
        >
          Eliminar Cuenta
        </Button>
        <Text style={styles.deleteAccountText}>
          Esta acción es irreversible y eliminará todos tus datos
        </Text>
      </View>

      {/* Edit Name Dialog */}
      <Portal>
        <Dialog
          visible={showEditNameDialog}
          onDismiss={() => setShowEditNameDialog(false)}
          style={styles.editNameDialog}
        >
          <Dialog.Title>Editar Nombre</Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="Nombre completo"
              value={newName}
              onChangeText={setNewName}
              mode="outlined"
              disabled={isUpdating}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setShowEditNameDialog(false)} disabled={isUpdating}>
              Cancelar
            </Button>
            <Button
              onPress={handleSaveName}
              disabled={isUpdating || !newName.trim()}
              loading={isUpdating}
            >
              Guardar
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* Delete Account Confirmation Dialog */}
        <Dialog
          visible={showDeleteDialog}
          onDismiss={() => {
            setShowDeleteDialog(false);
            setDeletePassword('');
          }}
        >
          <Dialog.Title>Confirmar Eliminación</Dialog.Title>
          <Dialog.Content>
            {authProvider === 'password' && (
              <>
                <Text style={{ marginBottom: 16 }}>
                  Para confirmar la eliminación de tu cuenta, por favor ingresa tu contraseña.
                </Text>
                <TextInput
                  label="Contraseña"
                  value={deletePassword}
                  onChangeText={setDeletePassword}
                  secureTextEntry={!showPassword}
                  mode="outlined"
                  disabled={isDeleting}
                  autoCapitalize="none"
                  right={
                    <TextInput.Icon
                      icon={showPassword ? 'eye-off' : 'eye'}
                      onPress={() => setShowPassword(!showPassword)}
                    />
                  }
                />
              </>
            )}
            {authProvider === 'google' && (
              <>
                <Text style={{ marginBottom: 16 }}>
                  Para confirmar la eliminación de tu cuenta, necesitas autenticarte nuevamente con Google.
                </Text>
                <Button
                  mode="outlined"
                  icon="google"
                  onPress={handleConfirmDelete}
                  disabled={isDeleting}
                  loading={isDeleting}
                  style={{ marginTop: 8 }}
                >
                  Autenticar con Google
                </Button>
              </>
            )}
            {authProvider === 'apple' && (
              <>
                <Text style={{ marginBottom: 16 }}>
                  Para confirmar la eliminación de tu cuenta, necesitas autenticarte nuevamente con Apple.
                </Text>
                <Button
                  mode="outlined"
                  icon="apple"
                  onPress={handleConfirmDelete}
                  disabled={isDeleting}
                  loading={isDeleting}
                  style={{ marginTop: 8 }}
                >
                  Autenticar con Apple
                </Button>
              </>
            )}
          </Dialog.Content>
          <Dialog.Actions>
            <Button
              onPress={() => {
                setShowDeleteDialog(false);
                setDeletePassword('');
              }}
              disabled={isDeleting}
            >
              Cancelar
            </Button>
            {authProvider === 'password' && (
              <Button
                onPress={handleConfirmDelete}
                disabled={isDeleting}
                loading={isDeleting}
                textColor={theme.colors.error}
              >
                Eliminar
              </Button>
            )}
          </Dialog.Actions>
        </Dialog>
      </Portal>
      <Portal>
        <Snackbar
          visible={showCopied}
          onDismiss={() => setShowCopied(false)}
          duration={2000}
        >
          Correo copiado al portapapeles
        </Snackbar>
      </Portal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    marginBottom: 20
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  errorText: {
    marginTop: 16,
    fontSize: 16,
    textAlign: 'center',
    color: '#F44336',
  },
  profileSection: {
    padding: 24,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginBottom: 8,
    elevation: 2,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 16,
  },
  cameraIconContainer: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#2196F3',
    borderRadius: 20,
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  cameraIconUploading: {
    backgroundColor: '#90CAF9',
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  nameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  editButton: {
    padding: 4,
  },
  userEmail: {
    fontSize: 14,
    color: '#757575',
  },
  emailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  copyIcon: {
    marginTop: 1,
  },
  card: {
    margin: 12,
    marginTop: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 12,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  statItem: {
    width: '48%',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    marginBottom: 12,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 8,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#757575',
  },
  seasonCard: {
    backgroundColor: '#F8F8F8',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#EEEEEE',
  },
  seasonHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  seasonHeaderInfo: {
    flex: 1,
    marginRight: 8,
  },
  seasonGroupName: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  seasonYear: {
    fontSize: 12,
    color: '#757575',
    marginTop: 2,
  },
  typeChip: {
    height: 24,
  },
  typeChipText: {
    fontSize: 11,
    marginVertical: 0,
  },
  playerChip: {
    backgroundColor: 'rgba(33, 150, 243, 0.15)',
  },
  goalkeeperChip: {
    backgroundColor: 'rgba(156, 39, 176, 0.15)',
  },
  emptyContainer: {
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 16,
    color: '#757575',
    textAlign: 'center',
  },
  deleteAccountSection: {
    margin: 12,
    marginTop: 24,
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FFEBEE',
    alignItems: 'center',
  },
  deleteButton: {
    marginBottom: 8,
  },
  deleteAccountText: {
    fontSize: 12,
    color: '#757575',
    textAlign: 'center',
  },
  editNameDialog: {
    // Push the dialog above the keyboard so the TextInput stays visible when it opens
    marginBottom: 200,
  },
});
