import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

// In production use same-origin paths so Vercel can proxy requests and keep
// the signed session cookie first-party. Locally use the backend directly.
const API_BASE_URL = import.meta.env.DEV
  ? import.meta.env.VITE_API_URL_LOCAL || "http://localhost:4000"
  : "";

export const apiUrl = (path) =>
  `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;

export const authApi = createApi({
  reducerPath: "authApi",
  baseQuery: fetchBaseQuery({
    baseUrl: API_BASE_URL ? `${API_BASE_URL}/` : "/",
    credentials: "include",
  }),
  tagTypes: ["User", "Team", "Submission", "Organizer", "Hackathon"],
  endpoints: (builder) => ({
    // ─── System ───────────────────────────────────────────────────────────
    getHealth: builder.query({
      query: () => "/health",
    }),
    getHackathonInfo: builder.query({
      query: () => "/hackathon",
      providesTags: ["Hackathon"],
    }),

    // ─── Auth ─────────────────────────────────────────────────────────────
    getCurrentUser: builder.query({
      query: () => "/user/me",
      providesTags: ["User"],
    }),
    login: builder.mutation({
      query: (formData) => ({
        url: "/user/login",
        method: "POST",
        body: formData,
      }),
      async onQueryStarted(arg, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          if (data?.user) {
            dispatch(
              authApi.util.upsertQueryData(
                "getCurrentUser",
                undefined,
                data.user,
              ),
            );
          }
        } catch {}
      },
      invalidatesTags: ["User", "Team", "Submission", "Organizer"],
    }),
    register: builder.mutation({
      query: (formData) => ({
        url: "/user/register",
        method: "POST",
        body: formData,
      }),
      invalidatesTags: ["User", "Team"],
    }),
    logout: builder.mutation({
      query: () => ({
        url: "/user/logout",
        method: "POST",
      }),
      invalidatesTags: ["User", "Team", "Submission", "Organizer"],
    }),

    // ─── Team ─────────────────────────────────────────────────────────────
    getMyTeam: builder.query({
      query: () => "/teams/me",
      providesTags: ["Team"],
    }),

    // ─── Uploads ──────────────────────────────────────────────────────────
    initiateUpload: builder.mutation({
      query: (body) => ({
        url: "/uploads/multipart/initiate",
        method: "POST",
        body,
      }),
    }),
    signPart: builder.mutation({
      query: (body) => ({
        url: "/uploads/multipart/sign-part",
        method: "POST",
        body,
      }),
    }),
    getUploadStatus: builder.query({
      query: (fileId) => `/uploads/multipart/${fileId}`,
    }),
    completeUpload: builder.mutation({
      query: (body) => ({
        url: "/uploads/multipart/complete",
        method: "POST",
        body,
      }),
    }),
    abortUpload: builder.mutation({
      query: (body) => ({
        url: "/uploads/multipart/abort",
        method: "POST",
        body,
      }),
    }),

    // ─── Submissions (participant) ────────────────────────────────────────
    getSubmissionStatus: builder.query({
      query: () => "/submissions/status",
      providesTags: ["Submission"],
    }),
    getSubmissionVersions: builder.query({
      query: () => "/submissions/versions",
      providesTags: ["Submission"],
    }),
    getSubmissionVersionById: builder.query({
      query: (versionId) => `/submissions/versions/${versionId}`,
      providesTags: ["Submission"],
    }),
    createSubmission: builder.mutation({
      query: (body) => ({
        url: "/submissions",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Submission", "Team", "Organizer"],
    }),

    // ─── Organizer ────────────────────────────────────────────────────────
    getOrganizerStats: builder.query({
      query: () => "/organizer/stats",
      providesTags: ["Organizer"],
    }),
    getOrganizerSubmissions: builder.query({
      query: ({ page = 1, limit = 20, search = "" } = {}) =>
        `/organizer/submissions?page=${page}&limit=${limit}&search=${encodeURIComponent(search)}`,
      providesTags: ["Organizer"],
    }),
    getSubmissionDetails: builder.query({
      query: (id) => `/organizer/submissions/${id}`,
      providesTags: ["Organizer"],
    }),
    getSubmissionDownloadUrl: builder.query({
      query: ({ id, version }) =>
        `/organizer/submissions/${id}/download${version ? `?version=${version}` : ""}`,
      providesTags: ["Organizer"],
    }),
    disqualifyTeam: builder.mutation({
      query: ({ teamId, reason }) => ({
        url: `/organizer/teams/${teamId}/disqualify`,
        method: "POST",
        body: { reason },
      }),
      invalidatesTags: ["Organizer", "Team"],
    }),
    // ... inside endpoints: (builder) => ({ ...

    setHackathonDeadline: builder.mutation({
      query: (body) => ({
        url: "/organizer/hackathon",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Hackathon"],
    }),

    // ... and in the exports at the bottom:
    // useSetHackathonDeadlineMutation,
  }),
});

export const {
  useGetHealthQuery,
  useGetHackathonInfoQuery,
  useGetCurrentUserQuery,
  useLoginMutation,
  useRegisterMutation,
  useLogoutMutation,
  useGetMyTeamQuery,
  useInitiateUploadMutation,
  useSignPartMutation,
  useLazyGetUploadStatusQuery,
  useSetHackathonDeadlineMutation,
  useCompleteUploadMutation,
  useAbortUploadMutation,
  useGetSubmissionStatusQuery,
  useGetSubmissionVersionsQuery,
  useGetSubmissionVersionByIdQuery,
  useCreateSubmissionMutation,
  useGetOrganizerStatsQuery,
  useGetOrganizerSubmissionsQuery,
  useGetSubmissionDetailsQuery,
  useGetSubmissionDownloadUrlQuery,
  useDisqualifyTeamMutation,
} = authApi;

export const apiSlice = authApi;
