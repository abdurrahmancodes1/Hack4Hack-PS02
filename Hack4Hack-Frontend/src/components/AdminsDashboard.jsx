import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  useGetOrganizerStatsQuery,
  useGetOrganizerSubmissionsQuery,
  useDisqualifyTeamMutation,
  useSetHackathonDeadlineMutation,
  useLogoutMutation,
  useGetCurrentUserQuery,
} from "../store/apiSlice.js";
import {
  Users,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Download,
  Search,
  RefreshCw,
  Loader2,
  ExternalLink,
  FileText,
  X,
  Play,
  Cloud,
  LogOut,
} from "lucide-react";

export default function OrganizerDashboard() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [isExporting, setIsExporting] = useState(false);

  // 🚨 State for the Preview Modal
  const [previewModal, setPreviewModal] = useState({
    isOpen: false,
    title: "",
    text: "",
  });

  const {
    data: statsData,
    isLoading: isStatsLoading,
    refetch: refetchStats,
  } = useGetOrganizerStatsQuery(undefined, { pollingInterval: 5000 });

  const {
    data: submissionsData,
    isLoading: isSubmissionsLoading,
    refetch: refetchSubmissions,
  } = useGetOrganizerSubmissionsQuery({ page, limit: 15, search }, { pollingInterval: 5000 });

  const [disqualifyTeam] = useDisqualifyTeamMutation();
  const [setDeadline] = useSetHackathonDeadlineMutation();
  const [logout] = useLogoutMutation();
  const navigate = useNavigate();
  const { data: user } = useGetCurrentUserQuery();
  const [isLaunching, setIsLaunching] = useState(false);

  const stats = statsData?.stats || {
    totalSubmissions: 0,
    acceptedSubmissions: 0,
    failedChecks: 0,
    lateAttempts: 0,
  };

  const submissions = submissionsData?.submissions || [];
  const pagination = submissionsData?.pagination || {
    totalPages: 1,
    totalSubmissions: 0,
  };

  const handleLaunchHackathon = async () => {
    setIsLaunching(true);
    // Sets the deadline to 2 hours from now
    const twoHoursFromNow = new Date(
      Date.now() + 2 * 60 * 60 * 1000,
    ).toISOString();

    try {
      await setDeadline({
        name: "Hack4Hack 2026",
        deadlineAt: twoHoursFromNow,
        gracePeriodSeconds: 300,
      }).unwrap();
      alert("Hackathon launched! Deadline set to 2 hours from now.");
      refetchStats();
      refetchSubmissions();
    } catch (err) {
      alert(err.data?.message || err.message || "Failed to launch hackathon");
    } finally {
      setIsLaunching(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout().unwrap();
    } catch {
      // ignore
    }
    navigate("/login");
  };

  const handleExportCsv = async () => {
    setIsExporting(true);
    try {
      const response = await fetch(
        "http://localhost:4000/organizer/export/csv",
        {
          method: "GET",
          credentials: "include",
        },
      );

      if (!response.ok) throw new Error("Failed to export CSV");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `hack4hack-submissions-${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export CSV error:", err);
      alert("Failed to export submissions CSV. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleDisqualify = async (teamId, teamName) => {
    const reason = window.prompt(
      `Enter reason to disqualify team "${teamName}":`,
    );
    if (!reason) return;

    try {
      await disqualifyTeam({ teamId, reason }).unwrap();
      refetchSubmissions();
      refetchStats();
    } catch (err) {
      alert(err.data?.message || "Failed to disqualify team");
    }
  };

  const handleDownloadFile = async (submissionId) => {
    try {
      const res = await fetch(
        `http://localhost:4000/organizer/submissions/${submissionId}/download`,
        {
          credentials: "include",
        },
      );
      const data = await res.json();
      if (!res.ok)
        throw new Error(
          data.message || "Failed to retrieve file download link",
        );
      window.open(data.downloadUrl, "_blank");
    } catch (err) {
      alert(err.message || "Could not download file");
    }
  };

  const handleViewPreview = (title, previewText) => {
    setPreviewModal({
      isOpen: true,
      title: title || "Project Archive",
      text: previewText || "No README or text preview found in this archive.",
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-xs">
              <Cloud className="w-6 h-6 stroke-[2.2]" />
            </div>
            <div>
              <span className="font-bold text-lg text-slate-900 block leading-none">
                Hack4Hack
              </span>
              <span className="text-[11px] text-slate-500 uppercase tracking-wider font-medium">
                Organizer Portal
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-700 bg-slate-100 px-3 py-1.5 rounded-xl">
              <span className="font-semibold">{user?.name || user?.email}</span>
              <span className="text-[10px] bg-blue-100 text-blue-700 font-bold px-1.5 py-0.5 rounded">
                Organizer
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

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Top Header & Action Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <div>
            <span className="text-xs font-semibold text-brand-600 uppercase tracking-wider block">
              Organizer Portal
            </span>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight mt-0.5">
              Live Submissions Monitor
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Real-time tracking of 2,000 teams, automated verification pipelines,
              and deadline enforcement.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                refetchStats();
                refetchSubmissions();
              }}
              className="p-2.5 rounded-xl border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors cursor-pointer"
              title="Refresh Data"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            {/* 🚨 LAUNCH HACKATHON BUTTON */}
            <button
              onClick={handleLaunchHackathon}
              disabled={isLaunching}
              className="bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer"
              title="Launch Hackathon with 2-hour deadline"
            >
              {isLaunching ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4 fill-current" />
              )}
              <span>Launch Hackathon (2h)</span>
            </button>

            <button
              onClick={handleExportCsv}
              disabled={isExporting}
              className="bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer"
            >
              {isExporting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              <span>Export CSV</span>
            </button>
          </div>
        </div>

      {/* 4 Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Total Submissions
            </span>
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-brand-600 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 text-3xl font-extrabold text-slate-900 font-mono">
            {isStatsLoading ? "..." : stats.totalSubmissions}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Teams with recorded attempts
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Accepted (Valid)
            </span>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 text-3xl font-extrabold text-emerald-600 font-mono">
            {isStatsLoading ? "..." : stats.acceptedSubmissions}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Passed automated validation
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Failed Checks
            </span>
            <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 text-3xl font-extrabold text-rose-600 font-mono">
            {isStatsLoading ? "..." : stats.failedChecks}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Rejected by integrity workers
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Late Attempts
            </span>
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 text-3xl font-extrabold text-amber-600 font-mono">
            {isStatsLoading ? "..." : stats.lateAttempts}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Submitted during the grace period
          </p>
        </div>
      </div>

      {/* Search & Submissions Table */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h3 className="text-base font-bold text-slate-900">
            Teams Submissions Table
          </h3>
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by team name..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-brand-500/20 focus:border-brand-600 transition-all"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 font-semibold">
              <tr>
                <th className="py-3 px-3">Team</th>
                <th className="py-3 px-3">Project Title</th>
                <th className="py-3 px-3">Latest Version</th>
                <th className="py-3 px-3">Validation Status</th>
                <th className="py-3 px-3">Links</th>
                <th className="py-3 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isSubmissionsLoading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-brand-600" />
                    Loading submissions...
                  </td>
                </tr>
              ) : submissions.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="py-8 text-center text-slate-400 italic"
                  >
                    No submissions found matching criteria.
                  </td>
                </tr>
              ) : (
                submissions.map((sub) => {
                  const active = sub.activeValidVersionId;
                  const isDisqualified =
                    sub.isDisqualified || sub.teamId?.isDisqualified;

                  // 🚨 EXTRACT PREVIEW TEXT SAFELY
                  const previewText = active?.fileAssetId?.preview?.text;

                  return (
                    <tr
                      key={sub._id}
                      className="hover:bg-slate-50/50 transition-colors"
                    >
                      <td className="py-3 px-3 font-semibold text-slate-900">
                        <div className="flex items-center gap-2">
                          <span>
                            {sub.name || sub.teamId?.name || "Unknown Team"}
                          </span>
                          {isDisqualified && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700">
                              Disqualified
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-3 font-medium text-slate-800 max-w-[200px] truncate">
                        {sub.title || "N/A"}
                      </td>

                      <td className="py-3 px-3 font-mono">
                        v{sub.latestVersionNumber || 0} (
                        {sub.submissionCount || 0} attempts)
                      </td>

                      <td className="py-3 px-3">
                        {active ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700">
                            <CheckCircle2 className="w-3 h-3" />
                            Accepted (v{active.versionNumber})
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700">
                            <Clock className="w-3 h-3" />
                            Needs Fix / Pending
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-3 space-x-2">
                        {/* 🚨 PREVIEW BUTTON */}
                        {previewText && (
                          <button
                            onClick={() =>
                              handleViewPreview(sub.title, previewText)
                            }
                            className="text-slate-600 hover:text-slate-900 hover:underline inline-flex items-center gap-1 font-semibold"
                            title="View README Preview"
                          >
                            <FileText className="w-3 h-3" />
                            <span>Preview</span>
                          </button>
                        )}

                        <button
                          onClick={() => handleDownloadFile(sub._id)}
                          className="text-brand-600 hover:underline inline-flex items-center gap-1 font-semibold"
                          title="Download latest submitted zip from S3"
                        >
                          <Download className="w-3 h-3" />
                          <span>Archive</span>
                        </button>

                        {sub.repoUrl && (
                          <a
                            href={sub.repoUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-brand-600 hover:underline inline-flex items-center gap-0.5"
                          >
                            <span>Repo</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        )}
                        {sub.liveDemoUrl && (
                          <a
                            href={sub.liveDemoUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-brand-600 hover:underline inline-flex items-center gap-0.5"
                          >
                            <span>Demo</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        )}
                      </td>

                      <td className="py-3 px-3 text-right">
                        {!isDisqualified && (
                          <button
                            onClick={() => handleDisqualify(sub._id, sub.name)}
                            className="text-[11px] font-semibold text-rose-600 hover:text-rose-700 hover:underline"
                          >
                            Disqualify
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs">
            <span className="text-slate-500">
              Page {page} of {pagination.totalPages} (
              {pagination.totalSubmissions} submissions)
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1 rounded-lg border border-slate-200 disabled:opacity-40 font-semibold"
              >
                Previous
              </button>
              <button
                disabled={page >= pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1 rounded-lg border border-slate-200 disabled:opacity-40 font-semibold"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

        {/* 🚨 PREVIEW MODAL */}
        {previewModal.isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
              <div className="flex items-center justify-between p-4 border-b border-slate-200">
                <h3 className="font-bold text-slate-900">
                  Preview: {previewModal.title}
                </h3>
                <button
                  onClick={() =>
                    setPreviewModal({ isOpen: false, title: "", text: "" })
                  }
                  className="p-1 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-4 overflow-y-auto">
                <pre className="text-sm bg-slate-50 p-4 rounded-xl whitespace-pre-wrap font-mono text-slate-700">
                  {previewModal.text}
                </pre>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
