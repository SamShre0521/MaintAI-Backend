import mongoose from "mongoose";

// Store a hash instead of the invitation itself, just like a password.
const signupInvitationSchema = new mongoose.Schema({
  tokenHash: { type: String, required: true, unique: true },
  email: { type: String, required: true },
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true },
  department: { type: String, required: true },
  role: { type: String, enum: ["engineer", "manager"], required: true },
  invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  expiresAt: { type: Date, required: true },
}, { timestamps: true });

export default mongoose.model("SignupInvitation", signupInvitationSchema);
