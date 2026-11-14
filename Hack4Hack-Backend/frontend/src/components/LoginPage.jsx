import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, Code2, ShieldCheck, Trophy, ArrowRight, User } from "lucide-react";
import { useLoginMutation } from "../api/authApi";

const Login = () => {
  const [role, setRole] = useState("Participant"); // "Participant" | "Organizer"
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const [serverError, setServerError] = useState("");
  const navigate = useNavigate();

  const [login, { isLoading }] = useLoginMutation();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setServerError("");
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleRoleToggle = (selectedRole) => {
    setRole(selectedRole);
    setServerError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError("");

    try {
      const res = await login({ ...formData, role }).unwrap();
      const actualRole = res?.user?.globalRole || res?.user?.role || role;

      // Role-based redirection: exactly 2 roles (Organizer & Participant)
      if (actualRole === "Organizer") {
        navigate("/organizer", { replace: true });
      } else {
        navigate("/dashboard", { replace: true });
      }
    } catch (error) {
      setServerError(error?.data?.message || "Invalid email or password.");
    }
  };

  return (
    <div className="min-h-screen flex bg-white font-sans">
      {/* LEFT - LOGIN FORM */}
      <div className="w-full lg:w-1/2 flex items-center justify-center px-6 py-12 bg-slate-50">
        <div className="w-full max-w-md bg-white rounded-2xl border border-slate-100 shadow-sm p-8">
          {/* BRAND */}
          <Link to="/" className="inline-flex items-center gap-2 mb-8">
            <div className="w-9 h-9 bg-blue-600 text-white rounded-lg flex items-center justify-center">
              <Code2 size={21} />
            </div>

            <span className="text-xl font-bold text-slate-900">
              Hack4<span className="text-blue-600">Hack</span>
            </span>
          </Link>

          {/* HEADING */}
          <h1 className="text-2xl font-bold text-slate-900">Sign In</h1>

          <p className="text-xs text-slate-500 mt-1 mb-6">
            Select your role flag below to sign in to your dashboard.
          </p>

          {/* ROLE SELECTOR / FLAG */}
          <div className="mb-5">
            <label className="block text-xs font-semibold text-slate-700 mb-2">
              Sign In As:
            </label>
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
              <button
                type="button"
                onClick={() => handleRoleToggle("Participant")}
                className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                  role === "Participant"
                    ? "bg-white text-blue-600 shadow-xs"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <User className="w-3.5 h-3.5" />
                <span>Participant</span>
              </button>

              <button
                type="button"
                onClick={() => handleRoleToggle("Organizer")}
                className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                  role === "Organizer"
                    ? "bg-blue-600 text-white shadow-xs"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Organizer</span>
              </button>
            </div>
          </div>

          {/* LOGIN FORM */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* EMAIL */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                {role} Email Address
              </label>

              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder={role === "Organizer" ? "organizer@hack4hack.dev" : "participant@hack4hack.dev"}
                autoComplete="email"
                required
                className={`w-full px-4 py-2.5 text-sm border rounded-xl outline-none focus:ring-2 transition ${
                  serverError
                    ? "border-red-400 focus:ring-red-400"
                    : "border-slate-200 focus:ring-blue-500"
                }`}
              />
            </div>

            {/* PASSWORD */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Password
              </label>

              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="••••••••"
                autoComplete="current-password"
                required
                className={`w-full px-4 py-2.5 text-sm border rounded-xl outline-none focus:ring-2 transition ${
                  serverError
                    ? "border-red-400 focus:ring-red-400"
                    : "border-slate-200 focus:ring-blue-500"
                }`}
              />
            </div>

            {/* ERROR */}
            {serverError && (
              <p role="alert" className="text-xs text-red-600 font-medium">
                {serverError}
              </p>
            )}

            {/* LOGIN BUTTON */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl font-semibold text-sm transition flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed shadow-xs"
            >
              {isLoading ? (
                <>
                  <Loader2 className="animate-spin w-4 h-4" />
                  Authenticating {role}...
                </>
              ) : (
                <>
                  <span>Sign In as {role}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Quick Demo Role Buttons */}
          <div className="mt-6 pt-5 border-t border-slate-100">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Quick Role Test Credentials
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => {
                  setRole("Participant");
                  setFormData({
                    email: "participant@hack4hack.dev",
                    password: "password123",
                  });
                }}
                className={`p-2.5 text-left rounded-xl border transition-all ${
                  role === "Participant"
                    ? "border-blue-400 bg-blue-50/60 ring-1 ring-blue-400"
                    : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <div className="font-bold text-slate-800">Participant</div>
                <div className="text-[10px] text-slate-500 truncate">participant@hack4hack.dev</div>
              </button>
              <button
                type="button"
                onClick={() => {
                  setRole("Organizer");
                  setFormData({
                    email: "organizer@hack4hack.dev",
                    password: "admin123",
                  });
                }}
                className={`p-2.5 text-left rounded-xl border transition-all ${
                  role === "Organizer"
                    ? "border-blue-400 bg-blue-50/60 ring-1 ring-blue-400"
                    : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <div className="font-bold text-slate-800">Organizer</div>
                <div className="text-[10px] text-slate-500 truncate">organizer@hack4hack.dev</div>
              </button>
            </div>
          </div>

          {/* REGISTER LINK */}
          <p className="text-xs text-center text-slate-600 mt-6">
            Don't have an account?{" "}
            <Link
              to="/register"
              className="text-blue-600 font-semibold hover:underline"
            >
              Register here
            </Link>
          </p>
        </div>
      </div>

      {/* RIGHT - BRANDING */}
      <div className="hidden lg:flex w-1/2 bg-blue-600 text-white items-center justify-center px-12 relative overflow-hidden">
        <div className="absolute w-96 h-96 bg-blue-500 rounded-full blur-3xl opacity-50 -top-32 -right-32" />
        <div className="absolute w-96 h-96 bg-blue-800 rounded-full blur-3xl opacity-40 -bottom-32 -left-32" />

        <div className="relative max-w-lg">
          <div className="w-14 h-14 rounded-2xl bg-white/15 flex items-center justify-center mb-6">
            <Trophy size={28} />
          </div>

          <span className="text-blue-100 text-xs font-semibold tracking-widest uppercase">
            Hack4Hack 2026 &bull; PS2
          </span>

          <h2 className="text-3xl font-bold leading-tight mt-3">
            Two Roles. One Platform.
          </h2>

          <p className="text-blue-100 mt-4 leading-relaxed text-sm">
            Toggle the role flag to enter either as a <strong>Participant</strong> to submit code and manage versions, or as an <strong>Organizer</strong> to view the live submission board and stream CSV audits.
          </p>

          <div className="mt-8 space-y-4">
            <div className="flex items-center gap-3">
              <User size={18} className="text-blue-200" />
              <span className="text-xs">Participant: Direct S3 uploads & validation status</span>
            </div>

            <div className="flex items-center gap-3">
              <ShieldCheck size={18} className="text-blue-200" />
              <span className="text-xs">Organizer: Real-time dashboard & CSV export</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
