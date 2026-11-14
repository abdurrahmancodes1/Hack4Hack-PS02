import mongoose from "mongoose";

const fileAssetSchema = new mongoose.Schema(
  {
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
      required: false,
      index: true,
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    originalFileName: { type: String, required: true },
    contentType: { type: String, required: true },
    declaredSizeBytes: { type: Number, required: true },
    totalParts: { type: Number, required: true },

    fileSizeBytes: { type: Number },
    s3Bucket: { type: String, required: true },
    s3Key: { type: String, required: true, unique: true },
    s3UploadId: { type: String, required: true },
    s3ETag: { type: String },

    status: {
      type: String,
      enum: [
        "UPLOADING",
        "COMPLETING",
        "COMPLETED",
        "VALIDATED",
        "REJECTED",
        "ABORTED",
        "EXPIRED",
      ],
      default: "UPLOADING",
      index: true,
    },

    initiatedAt: { type: Date, required: true, default: Date.now },
    deadlineAtInitiate: { type: Date, required: true },
    gracePeriodMsAtInitiate: { type: Number, required: true },
    hardCutoffAtInitiate: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    completedAt: { type: Date },

    contentHashSha256: { type: String },
    detectedMimeType: { type: String },
    validationErrors: { type: [String], default: [] },
    preview: {
      kind: {
        type: String,
        enum: ["pdf_first_page", "zip_readme", "text", null],
        default: null,
      },
      text: { type: String },
      truncated: { type: Boolean, default: false },
    },
    validatedAt: { type: Date },
  },
  { timestamps: true },
);

fileAssetSchema.index({ uploadedBy: 1, status: 1, createdAt: -1 });
fileAssetSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0, partialFilterExpression: { status: "UPLOADING" } },
);

export default mongoose.model("FileAsset", fileAssetSchema);
