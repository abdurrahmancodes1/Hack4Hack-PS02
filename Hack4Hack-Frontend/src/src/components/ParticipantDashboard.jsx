import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useGetCurrentUserQuery, useLogoutMutation } from "../api/authApi";
import ParticipantPortal from "./ParticipantPortal.jsx";
import { LogOut, Cloud, User } from "lucide-react";

const ParticipantDashboard = () => {
  const { data: user, isLoading, isFetching, isError } = useGetCurrentUserQuery();
  const [logout] = useLogoutMutation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && !isFetching && (isError || !user)) {
      navigate("/login", { replace: true });
    }
  }, [user, isLoading, isFetching, isError, navigate]);

  const handleLogout = async () => {
    try {
      await logout().unwrap();
    } catch {
      // ignore
    }
    navigate("/login");
  };

  if (isLoading || isFetching || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-500 text-sm">
        Loading Participant Portal...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Participant Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-xs">
              <Cloud className="w-6 h-6 stroke-[2.2]" />
            </div>
            <div>
              <span className="font-bold text-lg text-slate-900 block leading-none">Hack4Hack</span>
              <span className="text-[11px] text-slate-500 uppercase tracking-wider font-medium">
                Participant Portal
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-700 bg-slate-100 px-3 py-1.5 rounded-xl">
              <User className="w-3.5 h-3.5 text-blue-600" />
              <span className="font-semibold">{user?.name || user?.email}</span>
              <span className="text-[10px] bg-blue-100 text-blue-700 font-bold px-1.5 py-0.5 rounded">
                Participant
              </span>
            </div>

            <button
              onClick={handleLogout}
              className="p-2 text-slate-400 hover:text-red-600 transition-colors cursor-pointer"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <ParticipantPortal />
      </main>

      <footer className="border-t border-slate-200/80 bg-white py-6 text-center text-xs text-slate-500">
        <p className="font-semibold text-slate-700">
          Hack4Hack 2026 Hiring Challenge — Problem Statement 2: Deadline Crush
        </p>
        <p className="mt-1 text-slate-400">
          Participant Submission & Live Verification System
        </p>
      </footer>
    </div>
  );
};

export default ParticipantDashboard;
