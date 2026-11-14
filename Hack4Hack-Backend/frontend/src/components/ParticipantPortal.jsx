import React, { useState, useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import { setParticipantTab } from "../store/uiSlice.js";
import {
  useGetMyTeamQuery,
  useGetHackathonInfoQuery,
  useGetSubmissionStatusQuery,
  useGetSubmissionVersionsQuery,
  useInitiateUploadMutation,
  useSignPartMutation,
  useLazyGetUploadStatusQuery,
  useCompleteUploadMutation,
  useCreateSubmissionMutation,
} from "../store/apiSlice.js";
import {
  LayoutDashboard,
  UploadCloud,
  FileCheck2,
  Clock,
  Users,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ExternalLink,
  Github,
  Loader2,
  AlertCircle,
  FileArchive,
  FileText,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";
import axios from "axios";

export default function ParticipantPortal() {
  const dispatch = useDispatch();
  const currentTab = useSelector((state) => state.ui.participantTab);

  const {
    data: teamData,
    isLoading: isTeamLoading,
    refetch: refetchTeam,
  } = useGetMyTeamQuery();
  const { data: hackathon } = useGetHackathonInfoQuery();
  const {
    data: statusData,
    isLoading: isStatusLoading,
    refetch: refetchStatus,
  } = useGetSubmissionStatusQuery(undefined, { pollingInterval: 3000 });
  const {
    data: versionsData,
    isLoading: isVersionsLoading,
    refetch: refetchVersions,
  } = useGetSubmissionVersionsQuery(undefined, { pollingInterval: 5000 });

  const [initiateUpload] = useInitiateUploadMutation();
  const [signPart] = useSignPartMutation();
  const [getUploadStatus] = useLazyGetUploadStatusQuery();
  const [completeUpload] = useCompleteUploadMutation();
  const [createSubmission] = useCreateSubmissionMutation();

  const team = teamData?.team;
  const members = teamData?.members || [];

  // Countdown timer calculation
  const [timeLeft, setTimeLeft] = useState({
    hours: 0,
    minutes: 0,
    seconds: 0,
    isExpired: false,
    isGracePeriod: false,
  });

  useEffect(() => {
    if (!hackathon?.deadlineAt) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const deadline = new Date(hackathon.deadlineAt).getTime();
      const hardCutoff = hackathon.hardCutoffAt
        ? new Date(hackathon.hardCutoffAt).getTime()
        : deadline + 300000;

      if (now > hardCutoff) {
        setTimeLeft({
          hours: 0,
          minutes: 0,
          seconds: 0,
          isExpired: true,
          isGracePeriod: false,
        });
      } else if (now > deadline) {
        const diff = Math.max(0, hardCutoff - now);
        setTimeLeft({
          hours: Math.floor(diff / (1000 * 60 * 60)),
          minutes: Math.floor((diff / (1000 * 60)) % 60),
          seconds: Math.floor((diff / 1000) % 60),
          isExpired: false,
          isGracePeriod: true,
        });
      } else {
        const diff = Math.max(0, deadline - now);
        setTimeLeft({
          hours: Math.floor(diff / (1000 * 60 * 60)),
          minutes: Math.floor((diff / (1000 * 60)) % 60),
          seconds: Math.floor((diff / 1000) % 60),
          isExpired: false,
          isGracePeriod: false,
        });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [hackathon]);

  // Submit Form States
  const [title, setTitle] = useState(statusData?.title || "");
  const [description, setDescription] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [liveDemoUrl, setLiveDemoUrl] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatusText, setUploadStatusText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [submitSuccess, setSubmitSuccess] = useState(null);

  // File selection handler (100 MB max)
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!/\.(zip|pdf)$/i.test(file.name)) {
      setSubmitError("Please select a ZIP or PDF file.");
      setSelectedFile(null);
      return;
    }

    if (file.size > 100 * 1024 * 1024) {
      setSubmitError(
        "File exceeds 100 MB limit. Please select a smaller file.",
      );
      setSelectedFile(null);
      return;
    }

    setSubmitError(null);
    setSelectedFile(file);
    const savedKey = `hack4hack.upload.${file.name}.${file.size}.${file.lastModified}`;
    try {
      const saved = JSON.parse(localStorage.getItem(savedKey) || "null");
      if (saved?.title) setTitle(saved.title);
      if (saved?.description) setDescription(saved.description);
      if (saved?.repoUrl) setRepoUrl(saved.repoUrl);
      if (saved?.liveDemoUrl) setLiveDemoUrl(saved.liveDemoUrl);
    } catch {}
  };

  // Full Multipart Direct S3 Upload & Submission Flow
  const handleProjectSubmit = async (e) => {
    e.preventDefault();
    if (!selectedFile) {
      setSubmitError(
        "Please select a ZIP or PDF project file up to 100 MB.",
      );
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(null);
    setUploadProgress(0);
    setUploadStatusText("Initiating S3 multipart upload session...");

    try {
      const partSize = 10 * 1024 * 1024; // 10 MB per part
      const partCount = Math.max(1, Math.ceil(selectedFile.size / partSize));
      const resumeKey = `hack4hack.upload.${selectedFile.name}.${selectedFile.size}.${selectedFile.lastModified}`;
      let saved = JSON.parse(localStorage.getItem(resumeKey) || "null");
      let fileId;
      let parts;
      let alreadyCompleted = false;

      if (saved?.fileId) {
        let state;
        try {
          state = await getUploadStatus(saved.fileId).unwrap();
        } catch (error) {
          if (error?.status !== 404) throw error;
          localStorage.removeItem(resumeKey);
          saved = null;
        }
        if (state) {
          fileId = saved.fileId;
          alreadyCompleted = ["COMPLETED", "VALIDATED", "REJECTED"].includes(state.status);
          if (alreadyCompleted) parts = [];
          if (state.status === "UPLOADING") {
            const received = new Map((state.uploadedParts || []).map((part) => [part.partNumber, part.etag]));
            parts = [];
            for (let partNumber = 1; partNumber <= state.totalParts; partNumber++) {
              if (received.has(partNumber)) continue;
              const signed = await signPart({ fileId, partNumber }).unwrap();
              parts.push({ partNumber, presignedUrl: signed.presignedUrl });
            }
            saved.uploadedParts = Object.fromEntries(received);
          } else if (state.status === "COMPLETING") {
            setSubmitError("Your upload is still finalizing. Try again in a moment.");
            return;
          } else if (!alreadyCompleted) {
            localStorage.removeItem(resumeKey);
            saved = null;
            fileId = undefined;
          }
        }
      }

      if (!fileId || (!alreadyCompleted && !parts)) {
        const initRes = await initiateUpload({
          fileName: selectedFile.name,
          fileSizeBytes: selectedFile.size,
          contentType:
            selectedFile.type ||
            (selectedFile.name.toLowerCase().endsWith(".pdf")
              ? "application/pdf"
              : "application/zip"),
          partCount,
        }).unwrap();
        fileId = initRes.fileId;
        parts = initRes.parts;
        saved = { fileId, title, description, repoUrl, liveDemoUrl, uploadedParts: {} };
        localStorage.setItem(resumeKey, JSON.stringify(saved));
      }

      const uploadedParts = Object.entries(saved?.uploadedParts || {}).map(([partNumber, etag]) => ({ partNumber: Number(partNumber), etag }));

      // Step 2: Upload directly to S3 via XHR
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const start = (part.partNumber - 1) * partSize;
        const end = Math.min(start + partSize, selectedFile.size);
        const chunk = selectedFile.slice(start, end);

        setUploadStatusText(
          `Uploading part ${part.partNumber} of ${parts.length} to S3...`,
        );

        // Use XHR to get progress AND the ETag header
        const etag = await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();

          // FIX: Backend returns presignedUrl, not signedUrl
          xhr.open("PUT", part.presignedUrl, true);
          xhr.setRequestHeader(
            "Content-Type",
            selectedFile.type || "application/octet-stream",
          );

          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              const chunkProgress = event.loaded / event.total;
              // Calculate overall progress across all parts (0 to 85%)
              const totalPercent = Math.round(
                ((i + chunkProgress) / parts.length) * 85,
              );
              setUploadProgress(totalPercent);
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              // Extract ETag from response headers (requires S3 CORS ExposeHeaders)
              const rawEtag = xhr.getResponseHeader("ETag");
              if (!rawEtag) {
                reject(
                  new Error(
                    "S3 did not return an ETag header. Check bucket CORS settings.",
                  ),
                );
              } else {
                resolve(rawEtag.replace(/"/g, "")); // Strip quotes
              }
            } else {
              reject(new Error(`S3 upload failed with status ${xhr.status}`));
            }
          };

          xhr.onerror = () =>
            reject(new Error("Network error during S3 upload."));
          xhr.send(chunk);
        });

        uploadedParts.push({
          partNumber: part.partNumber,
          etag: etag,
        });
        saved.uploadedParts = { ...(saved.uploadedParts || {}), [part.partNumber]: etag };
        localStorage.setItem(resumeKey, JSON.stringify(saved));
      }

      setUploadProgress(88);
      setUploadStatusText("Verifying and completing multipart upload on S3...");

      // Step 3: Complete
      if (!alreadyCompleted) {
        await completeUpload({ fileId, parts: uploadedParts }).unwrap();
        saved.status = "COMPLETED";
        localStorage.setItem(resumeKey, JSON.stringify(saved));
      }

      setUploadProgress(95);
      setUploadStatusText(
        "Creating submission version & scheduling background worker...",
      );

      // Step 4: Create Submission
      const idempotencyKey = `submission-${fileId}`;
      const subRes = await createSubmission({
        fileId, // FIX: Send fileId, not uploadSessionId
        title: title.trim(),
        description: description.trim(),
        repoUrl: repoUrl.trim(),
        liveDemoUrl: liveDemoUrl.trim(),
        idempotencyKey,
      }).unwrap();

      setUploadProgress(100);
      setUploadStatusText("Upload complete! Project version recorded.");
      setSubmitSuccess(
        `Version v${subRes.versionNumber} submitted successfully! Background verification is running.`,
      );
      setSelectedFile(null);
      localStorage.removeItem(resumeKey);

      // Refresh queries
      refetchTeam();
      refetchStatus();
      refetchVersions();

      setTimeout(() => {
        dispatch(setParticipantTab("details"));
      }, 1500);
    } catch (err) {
      console.error("Submission failed:", err);

      // 🚨 FORCE THE EXACT ERROR TO SHOW UP
      let errorMessage = "Failed to submit.";
      if (err?.data?.message) {
        errorMessage = err.data.message;
      } else if (err?.data?.error) {
        errorMessage = err.data.error;
      } else if (err?.message) {
        errorMessage = err.message;
      }

      setSubmitError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const activeVersion = statusData?.activeVersion;
  const latestVersion = statusData?.latestVersion;

  return (
    <div className="space-y-6">
      {/* Participant Navigation Sub-Tabs matching reference theme */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            onClick={() => dispatch(setParticipantTab("dashboard"))}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
              currentTab === "dashboard"
                ? "bg-brand-600 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            <span>1. Dashboard</span>
          </button>

          <button
            onClick={() => dispatch(setParticipantTab("submit"))}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
              currentTab === "submit"
                ? "bg-brand-600 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
            }`}
          >
            <UploadCloud className="w-4 h-4" />
            <span>2. Submit Project</span>
          </button>

          <button
            onClick={() => dispatch(setParticipantTab("details"))}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
              currentTab === "details"
                ? "bg-brand-600 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
            }`}
          >
            <FileCheck2 className="w-4 h-4" />
            <span>3. Submission Details</span>
          </button>
        </div>

        {/* Live Deadline Badge */}
        <div
          className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-medium ${
            timeLeft.isExpired
              ? "bg-rose-50 border-rose-200 text-rose-700"
              : timeLeft.isGracePeriod
                ? "bg-amber-50 border-amber-200 text-amber-700 animate-pulse"
                : "bg-blue-50 border-blue-100 text-brand-700"
          }`}
        >
          <Clock className="w-3.5 h-3.5 shrink-0" />
          <span>
            {timeLeft.isExpired ? (
              <strong>Submissions Closed</strong>
            ) : timeLeft.isGracePeriod ? (
              <>
                Grace Period:{" "}
                <strong className="font-mono">
                  {String(timeLeft.minutes).padStart(2, "0")}:
                  {String(timeLeft.seconds).padStart(2, "0")}
                </strong>
              </>
            ) : (
              <>
                Deadline:{" "}
                <strong className="font-mono">
                  {timeLeft.hours}h {timeLeft.minutes}m {timeLeft.seconds}s
                </strong>
              </>
            )}
          </span>
        </div>
      </div>

      {/* ==================== 1. PARTICIPANT DASHBOARD ==================== */}
      {currentTab === "dashboard" && (
        <div className="space-y-6">
          {/* Top Grid: Team Information & Submission Status */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Team Info Card */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Assigned Team
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-brand-700">
                  <Users className="w-3 h-3" />
                  {members.length} {members.length === 1 ? "Member" : "Members"}
                </span>
              </div>
              <h3 className="text-xl font-bold text-slate-900 truncate">
                {team?.name || "Your Team"}
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                PS2 Submission Node &bull; Team ID:{" "}
                <span className="font-mono text-[11px] text-slate-600">
                  {team?.id || "N/A"}
                </span>
              </p>

              <div className="mt-5 pt-4 border-t border-slate-100 space-y-2">
                <div className="text-xs font-semibold text-slate-600">
                  Team Members:
                </div>
                {members.length > 0 ? (
                  <ul className="space-y-1.5">
                    {members.map((m, idx) => (
                      <li
                        key={idx}
                        className="flex items-center justify-between text-xs text-slate-700"
                      >
                        <span className="font-medium truncate">{m.name}</span>
                        <span className="text-slate-400 text-[11px] truncate max-w-[150px]">
                          {m.email}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-slate-400 italic">
                    No other teammates enrolled.
                  </p>
                )}
              </div>
            </div>

            {/* Submission Status Card */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Submission Status
                </span>
                {statusData?.hasSubmitted ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700">
                    <CheckCircle2 className="w-3 h-3" />
                    Submitted
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700">
                    <Clock className="w-3 h-3" />
                    Pending Submission
                  </span>
                )}
              </div>

              <div className="space-y-3">
                <div>
                  <div className="text-xs text-slate-500">Project Title</div>
                  <div className="font-bold text-slate-900 text-lg truncate">
                    {statusData?.title || "No project submitted yet"}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    <span className="text-[11px] text-slate-400 font-medium block">
                      Active Version
                    </span>
                    <span className="text-sm font-bold text-slate-800">
                      {activeVersion
                        ? `v${activeVersion.versionNumber}`
                        : "None"}
                    </span>
                  </div>
                  <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    <span className="text-[11px] text-slate-400 font-medium block">
                      Latest Attempt
                    </span>
                    <span className="text-sm font-bold text-slate-800">
                      {latestVersion ? `v${latestVersion.versionNumber}` : "v0"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-5">
                <button
                  onClick={() => dispatch(setParticipantTab("submit"))}
                  className="w-full bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold py-2.5 px-4 rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1.5"
                >
                  <UploadCloud className="w-3.5 h-3.5" />
                  <span>
                    {statusData?.hasSubmitted
                      ? "Upload New Version"
                      : "Submit First Version"}
                  </span>
                </button>
              </div>
            </div>

            {/* Deadline Countdown Card */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
              <div>
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-4">
                  Deadline Countdown
                </span>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <div className="text-2xl font-black text-slate-900 font-mono">
                      {String(timeLeft.hours).padStart(2, "0")}
                    </div>
                    <div className="text-[10px] text-slate-400 uppercase font-semibold mt-0.5">
                      Hours
                    </div>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <div className="text-2xl font-black text-slate-900 font-mono">
                      {String(timeLeft.minutes).padStart(2, "0")}
                    </div>
                    <div className="text-[10px] text-slate-400 uppercase font-semibold mt-0.5">
                      Mins
                    </div>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <div className="text-2xl font-black text-slate-900 font-mono">
                      {String(timeLeft.seconds).padStart(2, "0")}
                    </div>
                    <div className="text-[10px] text-slate-400 uppercase font-semibold mt-0.5">
                      Secs
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500">
                <div className="flex items-center justify-between">
                  <span>Server Grace Period:</span>
                  <span className="font-semibold text-slate-700">
                    {hackathon?.gracePeriodSeconds || 300} seconds
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Uploads initiated before cutoff timestamp are accepted even
                  during high network burst.
                </p>
              </div>
            </div>
          </div>

          {/* Latest Submission Version Summary Card */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h4 className="text-base font-bold text-slate-900">
                  Latest Submission Version
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Real-time status of the most recent version submitted by your
                  team.
                </p>
              </div>
              <button
                onClick={() => {
                  refetchStatus();
                  refetchVersions();
                }}
                className="p-1.5 text-slate-400 hover:text-slate-600 transition-colors"
                title="Refresh Status"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>

            {latestVersion ? (
              <div className="bg-slate-50/60 p-4 rounded-xl border border-slate-200/80 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 text-brand-600 flex items-center justify-center font-bold text-sm">
                    v{latestVersion.versionNumber}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-slate-900">
                        Version {latestVersion.versionNumber}
                      </span>
                      {latestVersion.isLate ? (
                        <span className="px-2 py-0.5 text-[10px] rounded-full font-bold bg-amber-100 text-amber-800">
                          Grace Period (Late)
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 text-[10px] rounded-full font-bold bg-emerald-100 text-emerald-800">
                          On Time
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      Submitted on{" "}
                      {new Date(latestVersion.submittedAt).toLocaleString()}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span className="text-[11px] text-slate-400 block">
                      Worker Status
                    </span>
                    <span
                      className={`text-xs font-bold ${
                        latestVersion.validationStatus === "VALID"
                          ? "text-emerald-600"
                          : latestVersion.validationStatus === "REJECTED"
                            ? "text-rose-600"
                            : "text-amber-600"
                      }`}
                    >
                      {latestVersion.validationStatus === "VALID"
                        ? "Accepted"
                        : latestVersion.validationStatus === "REJECTED"
                          ? "Needs a fix"
                          : "Validating..."}
                    </span>
                  </div>

                  <button
                    onClick={() => dispatch(setParticipantTab("details"))}
                    className="px-3 py-1.5 text-xs font-semibold text-brand-600 hover:text-brand-700 bg-white border border-brand-200 rounded-lg shadow-xs hover:bg-brand-50/50 transition-all"
                  >
                    View Details
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-xs text-slate-400 italic">
                No versions have been submitted yet. Go to "Submit Project" to
                upload your first version.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== 2. SUBMIT PROJECT ==================== */}
      {currentTab === "submit" && (
        <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-xs max-w-3xl mx-auto">
          <div className="mb-6">
            <h3 className="text-xl font-bold text-slate-900">Submit Project</h3>
            <p className="text-xs text-slate-500 mt-1">
              Upload your hackathon submission. Direct multipart upload sends
              files directly to cloud storage up to 100 MB.
            </p>
          </div>

          {submitError && (
            <div className="mb-5 p-3.5 rounded-xl bg-rose-50 border border-rose-100 text-rose-700 text-xs flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          {submitSuccess && (
            <div className="mb-5 p-3.5 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-800 text-xs flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{submitSuccess}</span>
            </div>
          )}

          <form onSubmit={handleProjectSubmit} className="space-y-5">
            {/* Project Title */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Project Title <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g., StorVault Distributed Storage"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-4 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-brand-500/20 focus:border-brand-600 transition-all"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Project Description
              </label>
              <textarea
                rows={3}
                placeholder="Brief summary of your project, architecture, and technology stack..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-4 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-brand-500/20 focus:border-brand-600 transition-all"
              />
            </div>

            {/* GitHub & Live Demo Links */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  GitHub Repository URL
                </label>
                <div className="relative">
                  <Github className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="url"
                    placeholder="https://github.com/myteam/hack4hack"
                    value={repoUrl}
                    onChange={(e) => setRepoUrl(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-brand-500/20 focus:border-brand-600 transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Live Demo Link
                </label>
                <div className="relative">
                  <ExternalLink className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="url"
                    placeholder="https://demo.hack4hack.dev"
                    value={liveDemoUrl}
                    onChange={(e) => setLiveDemoUrl(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-brand-500/20 focus:border-brand-600 transition-all"
                  />
                </div>
              </div>
            </div>

            {/* File Upload Zone (up to 100 MB) */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Project Archive File (Up to 100 MB){" "}
                <span className="text-rose-500">*</span>
              </label>

              <div className="border-2 border-dashed border-slate-200 hover:border-brand-400 transition-colors rounded-2xl p-6 text-center cursor-pointer bg-slate-50/50">
                <input
                  type="file"
                  id="project-file-input"
                  className="hidden"
                  accept=".zip,.pdf,application/zip,application/pdf"
                  onChange={handleFileChange}
                />
                <label
                  htmlFor="project-file-input"
                  className="cursor-pointer block"
                >
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 text-brand-600 flex items-center justify-center mx-auto mb-3 shadow-xs">
                    {selectedFile?.name.toLowerCase().endsWith(".pdf") ? (
                      <FileText className="w-6 h-6" />
                    ) : (
                      <FileArchive className="w-6 h-6" />
                    )}
                  </div>
                  {selectedFile ? (
                    <div>
                      <span className="font-bold text-sm text-slate-800">
                        {selectedFile.name}
                      </span>
                      <span className="block text-xs text-slate-500 mt-1 font-mono">
                        {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                      </span>
                      <span className="inline-block mt-2 text-xs font-semibold text-brand-600 hover:underline">
                        Change File
                      </span>
                    </div>
                  ) : (
                    <div>
                      <span className="font-semibold text-sm text-slate-800">
                        Click to select a ZIP archive or PDF
                      </span>
                      <span className="block text-xs text-slate-400 mt-1">
                        Supported: .zip or .pdf (Max 100 MB)
                      </span>
                    </div>
                  )}
                </label>
              </div>
            </div>

            {/* Upload Progress Bar */}
            {isSubmitting && (
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-700">
                    {uploadStatusText}
                  </span>
                  <span className="font-mono font-bold text-brand-600">
                    {uploadProgress}%
                  </span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-brand-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting || !selectedFile}
                className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-semibold py-3 px-6 rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 text-sm"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Processing Multipart Upload...</span>
                  </>
                ) : (
                  <>
                    <span>Submit Project Version</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ==================== 3. SUBMISSION DETAILS ==================== */}
      {currentTab === "details" && (
        <div className="space-y-6">
          {/* Validation & Verification Status Card */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Validation Status
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Automated background worker checks (ZIP safety, PDF parsing,
                  and submitted links).
                </p>
              </div>
              <button
                onClick={() => {
                  refetchStatus();
                  refetchVersions();
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Refresh Status</span>
              </button>
            </div>

            {latestVersion ? (
              <div className="space-y-4">
                <div
                  className={`p-4 rounded-xl border flex items-start gap-3.5 ${
                    latestVersion.validationStatus === "VALID"
                      ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                      : latestVersion.validationStatus === "REJECTED"
                        ? "bg-rose-50 border-rose-200 text-rose-800"
                        : "bg-amber-50 border-amber-200 text-amber-800"
                  }`}
                >
                  {latestVersion.validationStatus === "VALID" ? (
                    <ShieldCheck className="w-6 h-6 text-emerald-600 shrink-0" />
                  ) : latestVersion.validationStatus === "REJECTED" ? (
                    <XCircle className="w-6 h-6 text-rose-600 shrink-0" />
                  ) : (
                    <Loader2 className="w-6 h-6 text-amber-600 shrink-0 animate-spin" />
                  )}

                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm">
                        {latestVersion.validationStatus === "VALID"
                          ? "Accepted (Valid Submission)"
                          : latestVersion.validationStatus === "REJECTED"
                            ? "Needs a Fix (Rejected by Worker)"
                            : "Validation In Progress..."}
                      </span>
                      <span className="text-xs font-mono font-semibold">
                        Version v{latestVersion.versionNumber}
                      </span>
                    </div>

                    <p className="text-xs mt-1">
                      {latestVersion.validationStatus === "VALID"
                        ? "All automated sanity checks, archive integrity verifications, and link audits passed."
                        : latestVersion.validationStatus === "REJECTED"
                          ? "Automated verification identified issues. Please review error messages below and upload a fix."
                          : "Background BullMQ worker is actively checking archive structure and external endpoints."}
                    </p>
                  </div>
                </div>

                {/* Validation Error Messages (if rejected) */}
                {(latestVersion.fileAssetId?.validationErrors || latestVersion.validationReport?.validationErrors || []).length > 0 && (
                    <div className="bg-rose-50/70 border border-rose-200 rounded-xl p-4">
                      <h4 className="text-xs font-bold text-rose-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                        <span>Validation Error Messages:</span>
                      </h4>
                      <ul className="list-disc list-inside space-y-1 text-xs text-rose-700">
                        {(latestVersion.fileAssetId?.validationErrors || latestVersion.validationReport?.validationErrors || []).map((err, i) => (
                          <li key={i}>
                            {typeof err === "string"
                              ? err
                              : JSON.stringify(err)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">
                No submissions made yet.
              </p>
            )}
          </div>

          {/* Previous Submission Versions History */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
            <h3 className="text-lg font-bold text-slate-900 mb-1">
              Previous Versions
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Immutable version history. Every submission is recorded
              monotonically.
            </p>

            {versionsData?.versions && versionsData.versions.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 font-semibold">
                    <tr>
                      <th className="py-2.5 px-3">Version</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Submitted By</th>
                      <th className="py-2.5 px-3">Submission Time</th>
                      <th className="py-2.5 px-3">Cutoff Status</th>
                      <th className="py-2.5 px-3 text-right">Active Marker</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {versionsData.versions.map((ver) => (
                      <tr
                        key={ver._id}
                        className="hover:bg-slate-50/50 transition-colors"
                      >
                        <td className="py-3 px-3 font-bold font-mono text-slate-900">
                          v{ver.versionNumber}
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              ver.validationStatus === "VALID"
                                ? "bg-emerald-50 text-emerald-700"
                                : ver.validationStatus === "REJECTED"
                                  ? "bg-rose-50 text-rose-700"
                                  : "bg-amber-50 text-amber-700"
                            }`}
                          >
                            {ver.validationStatus === "VALID"
                              ? "Accepted"
                              : ver.validationStatus === "REJECTED"
                                ? "Needs a fix"
                                : "Validating"}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-slate-700">
                          {ver.submittedById?.name || "Team Member"}
                        </td>
                        <td className="py-3 px-3 text-slate-500">
                          {new Date(ver.submittedAt).toLocaleString()}
                        </td>
                        <td className="py-3 px-3">
                          {ver.isLate ? (
                            <span className="text-amber-700 font-medium">
                              Grace Period
                            </span>
                          ) : (
                            <span className="text-emerald-700 font-medium">
                              On-Time
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right">
                          {activeVersion?._id === ver._id && (
                            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-brand-800">
                              Active Valid
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">
                No previous versions available.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
