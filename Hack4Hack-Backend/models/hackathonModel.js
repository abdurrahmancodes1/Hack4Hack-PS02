import mongoose from "mongoose";

const hackathonSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      default: "Hack4Hack 2026",
    },
    deadlineAt: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours default
    },
    gracePeriodSeconds: {
      type: Number,
      default: 300, // 5 minutes grace period
    },
    maxFileSizeBytes: {
      type: Number,
      default: 100 * 1024 * 1024, // 100 MB
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

const Hackathon = mongoose.model("Hackathon", hackathonSchema);

export default Hackathon;
