import React from "react";
import { createBrowserRouter, RouterProvider, Navigate } from "react-router-dom";
import HomePage from "./components/HomePage.jsx";
import Login from "./components/LoginPage.jsx";
import Register from "./components/RegisterPage.jsx";
import ParticipantDashboard from "./components/ParticipantDashboard.jsx";
import AdminsDashboard from "./components/AdminsDashboard.jsx";
import { useGetCurrentUserQuery } from "./api/authApi.js";

// Guard: Only Participants can access /dashboard; Organizers are redirected to /organizer
function ParticipantRoute({ children }) {
  const { data: user, isLoading, isError } = useGetCurrentUserQuery();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500 text-sm">
        Loading...
      </div>
    );
  }

  if (isError || !user) {
    return <Navigate to="/login" replace />;
  }

  const role = user?.globalRole || user?.role;
  if (role === "Organizer") {
    return <Navigate to="/organizer" replace />;
  }

  return children;
}

// Guard: Only Organizers can access /organizer; Participants are redirected to /dashboard
function OrganizerRoute({ children }) {
  const { data: user, isLoading, isError } = useGetCurrentUserQuery();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500 text-sm">
        Loading...
      </div>
    );
  }

  if (isError || !user) {
    return <Navigate to="/login" replace />;
  }

  const role = user?.globalRole || user?.role;
  if (role !== "Organizer") {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

const router = createBrowserRouter([
  {
    path: "/",
    element: <HomePage />,
  },
  {
    path: "/login",
    element: <Login />,
  },
  {
    path: "/register",
    element: <Register />,
  },
  {
    path: "/dashboard",
    element: (
      <ParticipantRoute>
        <ParticipantDashboard />
      </ParticipantRoute>
    ),
  },
  {
    path: "/organizer",
    element: (
      <OrganizerRoute>
        <AdminsDashboard />
      </OrganizerRoute>
    ),
  },
]);

function App() {
  return <RouterProvider router={router} />;
}

export default App;
