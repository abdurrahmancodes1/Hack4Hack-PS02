import React from "react";
import { useDispatch } from "react-redux";
import { setAuthMode } from "../store/uiSlice.js";
import { useLogoutMutation, useGetHealthQuery } from "../store/apiSlice.js";
import { Cloud, User, LogOut } from "lucide-react";

export default function Navbar({ currentUser, onOpenAuth, onLogout }) {
  const dispatch = useDispatch();
  const { data: health } = useGetHealthQuery();
  const [logout] = useLogoutMutation();

  const isHealthy = health?.status === "healthy";
  const role = currentUser?.globalRole || "Participant";

  const handleLogout = async () => {
    try {
      await logout().unwrap();
    } catch {
      // ignore
    } finally {
      if (onLogout) onLogout();
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand Logo - Matching reference image style */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center text-white shadow-sm shadow-brand-500/20">
            <Cloud className="w-6 h-6 stroke-[2.2]" />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-lg text-slate-900 tracking-tight leading-none">
              Hack4Hack
            </span>
            <span className="text-[11px] font-medium text-slate-500 tracking-wide uppercase mt-0.5">
              Deadline Crush
            </span>
          </div>
        </div>

        {/* Right Action & Status Area */}
        <div className="flex items-center gap-4">
          {/* Backend Connection Status Badge */}
          <div
            className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
              isHealthy
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : "bg-amber-50 text-amber-700 border-amber-200"
            }`}
            title={
              isHealthy
                ? "Backend connected"
                : "Connecting to backend on port 4000"
            }
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isHealthy ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
              }`}
            />
            {isHealthy ? "API Connected" : "Connecting..."}
          </div>

          {/* User Button / Solid Blue CTA Button matching reference image */}
          {currentUser ? (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl">
                <User className="w-3.5 h-3.5 text-brand-600" />
                <span className="font-semibold">
                  {currentUser.name || currentUser.email}
                </span>
                <span className="text-[10px] bg-brand-50 text-brand-700 font-bold px-1.5 py-0.5 rounded">
                  {role}
                </span>
              </div>
              <button
                onClick={handleLogout}
                className="p-2 text-slate-400 hover:text-rose-600 transition-colors"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                dispatch(setAuthMode("login"));
                if (onOpenAuth) onOpenAuth();
              }}
              className="bg-brand-600 hover:bg-brand-700 text-white text-xs sm:text-sm font-semibold px-5 py-2 rounded-xl shadow-sm shadow-brand-600/30 transition-all hover:shadow"
            >
              Sign In
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
