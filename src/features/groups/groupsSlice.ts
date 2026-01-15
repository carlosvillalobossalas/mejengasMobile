import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';

import { firebaseUserChanged, signOutFromFirebase } from '../auth/authSlice';
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
};

const initialState: GroupsState = {
  status: 'idle',
  error: null,
  groups: [],
  selectedGroupId: null,
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

        // Preserve selection if still exists, otherwise pick first.
        if (state.selectedGroupId) {
          const stillExists = action.payload.groups.some(
            g => g.id === state.selectedGroupId,
          );
          if (!stillExists) {
            state.selectedGroupId = action.payload.groups[0]?.id ?? null;
          }
        } else {
          state.selectedGroupId = action.payload.groups[0]?.id ?? null;
        }
      })
      .addCase(fetchMyGroups.rejected, (state, action) => {
        state.status = 'error';
        state.error =
          (action.payload as string | undefined) ??
          action.error.message ??
          'No se pudieron cargar los grupos.';
      })
      .addCase(signOutFromFirebase.fulfilled, state => {
        state.status = 'idle';
        state.error = null;
        state.groups = [];
        state.selectedGroupId = null;
      })
      .addCase(firebaseUserChanged, (state, action) => {
        if (!action.payload) {
          state.status = 'idle';
          state.error = null;
          state.groups = [];
          state.selectedGroupId = null;
        }
      });
  },
});

export const { setSelectedGroupId, clearGroupsError } = groupsSlice.actions;
export default groupsSlice.reducer;
