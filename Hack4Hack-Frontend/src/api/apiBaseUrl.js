// VITE_API_BASE_URL is baked into the client during the Vite build.
// Leave it unset when Vercel rewrites API paths to the backend under this origin.
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(
  /\/+$/,
  "",
);

export const apiUrl = (path) => `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
