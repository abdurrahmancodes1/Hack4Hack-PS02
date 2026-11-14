import mongoose from "mongoose";

const submissionVersionSchema = new mongoose.Schema(
  {
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
      required: true,
      index: true,
    },
    fileAssetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FileAsset",
      required: true,
      index: true,
    },
    versionNumber: { type: Number, required: true },
    submittedById: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    title: { type: String, required: true },
    description: { type: String, default: "" },
    repoUrl: { type: String, default: "" },
    liveDemoUrl: { type: String, default: "" },
    idempotencyKey: { type: String, default: undefined },
    submittedAt: { type: Date, required: true },
    isLate: { type: Boolean, default: false },
    validationStatus: {
      type: String,
      enum: ["PENDING", "VALIDATING", "VALID", "REJECTED"],
      default: "PENDING",
      index: true,
    },
    validationReport: {
      fileChecked: Boolean,
      archiveChecked: Boolean,
      fileCount: Number,
      pageCount: Number,
      uncompressedSizeBytes: Number,
      detectedMimeType: String,
      contentHashSha256: String,
      linksChecked: Array,
      validationErrors: [String],
      validatedAt: Date,
    },
  },
  { timestamps: true },
);

submissionVersionSchema.index(
  { teamId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string" } } },
);
submissionVersionSchema.index({ teamId: 1, versionNumber: 1 }, { unique: true });

export default mongoose.model("SubmissionVersion", submissionVersionSchema);
