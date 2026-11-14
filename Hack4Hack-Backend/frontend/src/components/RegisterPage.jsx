import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Loader2, Code2, ShieldCheck, Trophy, CheckCircle2, User } from "lucide-react";
import { useRegisterMutation } from "../api/authApi";

const Register = () => {
  const [role, setRole] = useState("Participant"); // "Participant" | "Organizer"
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
  });

  const [serverError, setServerError] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);

  const navigate = useNavigate();
  const [register, { isLoading: isRegisterLoading }] = useRegisterMutation();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setServerError("");
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError("");

    try {
      await register({ ...formData, role }).unwrap();
      setIsSuccess(true);
      setTimeout(() => navigate("/login"), 1500);
    } catch (error) {
      setServerError(
        error?.data?.message || "Registration failed. Please try again.",
      );
    }
  };

  return (
    <div className="min-h-screen flex bg-white font-sans">
      {/* LEFT - REGISTRATION FORM */}
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
          <h1 className="text-2xl font-bold text-slate-900">
            Create an Account
          </h1>

          <p className="text-xs text-slate-500 mt-1 mb-6">
            Choose your role and register to access the submission platform.
          </p>

          {/* SUCCESS MESSAGE */}
          {isSuccess && (
            <div className="mb-5 p-3 rounded-xl bg-green-50 border border-green-200 text-green-700 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
              <span>Registered as <strong>{role}</strong> successfully! Redirecting to login...</span>
            </div>
          )}

          {/* ROLE SELECTOR / FLAG */}
          <div className="mb-5">
            <label className="block text-xs font-semibold text-slate-700 mb-2">
              Registering As:
            </label>
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
              <button
                type="button"
                onClick={() => setRole("Participant")}
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
                onClick={() => setRole("Organizer")}
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
            <p className="text-[11px] text-slate-400 mt-1.5 px-0.5">
              {role === "Participant"
                ? "Participate with your team, submit project archives, and track validation."
                : "Organize the hackathon, monitor all team submissions, and export CSV data."}
            </p>
          </div>

          {/* REGISTRATION FORM */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Full Name
              </label>

              <input
                type="text"
                name="name"
                placeholder="Ada Lovelace"
                value={formData.name}
                onChange={handleChange}
                required
                autoComplete="name"
                className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Email Address
              </label>

              <input
                type="email"
                name="email"
                placeholder={role === "Organizer" ? "organizer@example.com" : "participant@example.com"}
                value={formData.email}
                onChange={handleChange}
                required
                autoComplete="email"
                className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Password
              </label>

              <input
                type="password"
                name="password"
                placeholder="Create a strong password"
                value={formData.password}
                onChange={handleChange}
                required
                minLength={4}
                autoComplete="new-password"
                className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              />
            </div>

            {serverError && (
              <p role="alert" className="text-xs text-red-600 font-medium">
                {serverError}
              </p>
            )}

            <button
              type="submit"
              disabled={isRegisterLoading || isSuccess}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl font-semibold text-sm transition flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed shadow-xs"
            >
              {isRegisterLoading ? (
                <>
                  <Loader2 className="animate-spin w-4 h-4" />
                  Creating {role} account...
                </>
              ) : (
                `Register as ${role}`
              )}
            </button>
          </form>

          {/* DIVIDER */}
          <div className="my-6 border-t border-slate-100" />

          {/* LOGIN */}
          <p className="text-xs text-center text-slate-600">
            Already have an account?{" "}
            <Link
              to="/login"
              className="text-blue-600 font-semibold hover:underline"
            >
              Sign In
            </Link>
          </p>
        </div>
      </div>

      {/* RIGHT - HERO / INFO SECTION */}
      <div className="hidden lg:flex w-1/2 bg-blue-600 text-white p-12 flex-col justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
              <Code2 size={20} />
            </div>
            <span className="text-xl font-bold tracking-tight">Hack4Hack 2026</span>
          </div>

          <div className="mt-20 max-w-md">
            <span className="text-xs font-semibold bg-white/20 px-3 py-1 rounded-full uppercase tracking-wider">
              Problem Statement 2: Deadline Crush
            </span>
            <h2 className="text-3xl font-bold mt-4 leading-tight">
              Two Roles &bull; Participant & Organizer
            </h2>
            <p className="mt-4 text-blue-100 text-sm leading-relaxed">
              Select your role flag to enroll as a <strong>Participant</strong> for submitting project files or as an <strong>Organizer</strong> to inspect team status and export audit records.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 border-t border-white/20 pt-8">
          <div className="flex items-center gap-3">
            <User className="w-6 h-6 text-blue-200 shrink-0" />
            <span className="text-xs text-blue-100">Participant Portal</span>
          </div>
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-6 h-6 text-blue-200 shrink-0" />
            <span className="text-xs text-blue-100">Organizer Dashboard</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Register;
