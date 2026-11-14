import mongoose from "mongoose";

const teamSchema = new mongoose.Schema(
  {
    _id: { type: mongoose.Schema.Types.ObjectId, auto: false },
    name: { type: String, required: true, trim: true },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    isDisqualified: { type: Boolean, default: false },

    title: { type: String, default: "" },
    description: { type: String, default: "" },
    repoUrl: { type: String, default: "" },
    liveDemoUrl: { type: String, default: "" },

    activeValidVersionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SubmissionVersion",
      default: null,
    },
    activeVersionNumber: { type: Number, default: 0 },
    latestVersionNumber: { type: Number, default: 0 },
    submissionCount: { type: Number, default: 0 },
  },
  { timestamps: true, _id: false },
);

export default mongoose.model("Team", teamSchema);
