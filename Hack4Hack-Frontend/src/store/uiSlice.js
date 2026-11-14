import { createSlice } from "@reduxjs/toolkit";

const uiSlice = createSlice({
  name: "ui",
  initialState: {
    participantTab: "dashboard", // "dashboard" | "submit" | "details"
    notification: null,
  },
  reducers: {
    setParticipantTab: (state, action) => {
      state.participantTab = action.payload;
    },
    setNotification: (state, action) => {
      state.notification = action.payload;
    },
    clearNotification: (state) => {
      state.notification = null;
    },
  },
});

export const {
  setParticipantTab,
  setNotification,
  clearNotification,
} = uiSlice.actions;

export default uiSlice.reducer;
