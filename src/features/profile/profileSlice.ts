import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';

import {
  getProfileData,
  type ProfileData,
} from '../../endpoints/profile/profileEndpoints';

type ProfileState = {
  isLoading: boolean;
  error: string | null;
  data: ProfileData | null;
};

const initialState: ProfileState = {
  isLoading: false,
  error: null,
  data: null,
};

export const fetchProfileData = createAsyncThunk<ProfileData, { userId: string }>(
  'profile/fetchProfileData',
  async ({ userId }) => {
    return await getProfileData(userId);
  },
);

const profileSlice = createSlice({
  name: 'profile',
  initialState,
  reducers: {
    clearProfile: state => {
      state.data = null;
      state.error = null;
      state.isLoading = false;
    },
  },
  extraReducers: builder => {
    builder
      .addCase(fetchProfileData.pending, state => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchProfileData.fulfilled, (state, action) => {
        state.isLoading = false;
        state.data = action.payload;
        state.error = null;
      })
      .addCase(fetchProfileData.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message ?? 'Error al cargar el perfil';
      });
  },
});

export const { clearProfile } = profileSlice.actions;

export default profileSlice.reducer;
