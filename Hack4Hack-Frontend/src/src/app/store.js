import { configureStore } from "@reduxjs/toolkit";
import { authApi } from "../api/authApi";
import uiReducer from "../store/uiSlice";

export const store = configureStore({
  reducer: {
    [authApi.reducerPath]: authApi.reducer,
    ui: uiReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(authApi.middleware),
});
