import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';

import { firebaseUserChanged, signOutFromFirebase } from '../auth/authSlice';
import {
  getStoredSelectedGroupId,
  setStoredSelectedGroupId,
} from '../../services/storage/selectedGroupStorage';
import {
  fetchGroupsForUser,
  type Group,
} from '../../repositories/groups/groupsRepository';

type GroupsStatus = 'idle' | 'loading' | 'error';

export type GroupsState = {
  status: GroupsStatus;
  error: string | null;
  groups: Array<Group>;
  selectedGroupId: string | null;
  isHydrated: boolean;
};

const initialState: GroupsState = {
  status: 'idle',
  error: null,
  groups: [],
  selectedGroupId: null,
  isHydrated: false,
};

function toSpanishGroupsErrorMessage(error: unknown): string {
  const err = error as { message?: string; code?: string };

  if (err.code === 'permission-denied') {
    return 'No tenés permisos para ver tus grupos.';
  }

  return err.message ?? 'No se pudieron cargar los grupos.';
}

export const fetchMyGroups = createAsyncThunk<
  { groups: Array<Group> },
  { userId: string }
>('groups/fetchMyGroups', async ({ userId }, { rejectWithValue }) => {
  try {
    const groups = await fetchGroupsForUser(userId);
    return { groups };
  } catch (e) {
    return rejectWithValue(toSpanishGroupsErrorMessage(e));
  }
});

export const hydrateSelectedGroupId = createAsyncThunk<
  { selectedGroupId: string | null },
  { userId: string }
>('groups/hydrateSelectedGroupId', async ({ userId }, { rejectWithValue }) => {
  try {
    const selectedGroupId = await getStoredSelectedGroupId(userId);
    return { selectedGroupId };
  } catch (e) {
    return rejectWithValue(toSpanishGroupsErrorMessage(e));
  }
});

export const selectGroup = createAsyncThunk<
  { selectedGroupId: string | null },
  { userId: string; groupId: string | null }
>('groups/selectGroup', async ({ userId, groupId }, { rejectWithValue }) => {
  try {
    await setStoredSelectedGroupId(userId, groupId);
    return { selectedGroupId: groupId };
  } catch (e) {
    return rejectWithValue(toSpanishGroupsErrorMessage(e));
  }
});

const groupsSlice = createSlice({
  name: 'groups',
  initialState,
  reducers: {
    setSelectedGroupId(state, action: PayloadAction<string | null>) {
      state.selectedGroupId = action.payload;
    },
    clearGroupsError(state) {
      state.error = null;
      if (state.status === 'error') state.status = 'idle';
    },
    setGroups(state, action: PayloadAction<Group[]>) {
      state.groups = action.payload;
      state.status = 'idle';
      
      // Validate existing selection
      if (state.selectedGroupId) {
        const stillExists = action.payload.some(
          g => g.id === state.selectedGroupId,
        );
        if (!stillExists) {
          state.selectedGroupId = null;
        }
      }
    },
  },
  extraReducers: builder => {
    builder
      .addCase(fetchMyGroups.pending, state => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchMyGroups.fulfilled, (state, action) => {
        state.status = 'idle';
        state.groups = action.payload.groups;

        // Do NOT auto-select; only validate existing selection.
        if (state.selectedGroupId) {
          const stillExists = action.payload.groups.some(
            g => g.id === state.selectedGroupId,
          );
          if (!stillExists) {
            state.selectedGroupId = null;
          }
        }
      })
      .addCase(fetchMyGroups.rejected, (state, action) => {
        state.status = 'error';
        state.error =
          (action.payload as string | undefined) ??
          action.error.message ??
          'No se pudieron cargar los grupos.';
      })
      .addCase(hydrateSelectedGroupId.fulfilled, (state, action) => {
        state.selectedGroupId = action.payload.selectedGroupId;
        state.isHydrated = true;
      })
      .addCase(hydrateSelectedGroupId.rejected, state => {
        state.isHydrated = true;
      })
      .addCase(selectGroup.fulfilled, (state, action) => {
        state.selectedGroupId = action.payload.selectedGroupId;
      })
      .addCase(signOutFromFirebase.fulfilled, state => {
        state.status = 'idle';
        state.error = null;
        state.groups = [];
        state.selectedGroupId = null;
        state.isHydrated = false;
      })
      .addCase(firebaseUserChanged, (state, action) => {
        if (!action.payload) {
          state.status = 'idle';
          state.error = null;
          state.groups = [];
          state.selectedGroupId = null;
          state.isHydrated = false;
        }
      });
  },
});

export const { setSelectedGroupId, clearGroupsError, setGroups } = groupsSlice.actions;
export default groupsSlice.reducer;
