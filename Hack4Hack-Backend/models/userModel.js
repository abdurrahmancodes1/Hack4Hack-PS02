import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      minlength: 2,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      minlength: 4,
    },
    picture: {
      type: String,
      default: "",
    },
    globalRole: {
      type: String,
      enum: ["Admin", "Organizer", "Participant"],
      default: "Participant",
    },
    // Retain legacy role field mapped to globalRole for backward compatibility
    role: {
      type: String,
      enum: ["Admin", "Organizer", "Participant", "Manager", "User"],
      default: "Participant",
    },
    deleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

userSchema.index({ globalRole: 1 });

const User = mongoose.model("User", userSchema);

export default User;
