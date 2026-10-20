import { createHash, randomBytes } from "node:crypto";
import Invitation from "../models/signupInvitation.model.js";
import Company from "../models/company.model.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/user.model.js";

const generateToken = (user) => {
  return jwt.sign(
    {
      userId: user._id,
      email: user.email,
      role: user.role,
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" },
  );
};

// Managers choose the company, department and role. Signup cannot override them.
export const createSignupInvitation = async (req, res) => {
  try {
    const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const role = req.body.role || "engineer";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !["engineer", "manager"].includes(role)) {
      return res.status(400).json({ error: "A valid email and role (engineer or manager) are required" });
    }
    if (await User.exists({ email })) {
      return res.status(409).json({ error: "User already exists" });
    }
    const invitationToken = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await Invitation.create({
      tokenHash: createHash("sha256").update(invitationToken).digest("hex"),
      email, role, expiresAt,
      companyId: req.user.companyId,
      department: req.user.department,
      invitedBy: req.user._id,
    });
    return res.status(201).json({ invitationToken, email, role, expiresAt });
  } catch (error) {
    console.error("Invitation error:", error.message);
    return res.status(500).json({ error: "Could not create invitation" });
  }
};

export const signup = async (req, res) => {
  try {
    const { name, email, password, invitationToken } = req.body;
    if (typeof name !== "string" || !name.trim() || typeof email !== "string" ||
        typeof password !== "string" || password.length < 8 ||
        typeof invitationToken !== "string" || !/^[a-f0-9]{64}$/.test(invitationToken)) {
      return res.status(400).json({ error: "Name, email, password (at least 8 characters) and invitationToken are required" });
    }
    const normalizedEmail = email.trim().toLowerCase();
    const tokenHash = createHash("sha256").update(invitationToken).digest("hex");
    const invitation = await Invitation.findOne({ tokenHash, email: normalizedEmail, expiresAt: { $gt: new Date() } });
    if (!invitation) return res.status(400).json({ error: "Invitation is invalid or expired" });
    if (!(await Company.exists({ _id: invitation.companyId, isActive: true }))) {
      return res.status(403).json({ error: "Company is unavailable" });
    }
    if (await User.exists({ email: normalizedEmail })) {
      return res.status(409).json({ error: "User already exists" });
    }
    // A unique email prevents two simultaneous requests from creating two accounts.
    const user = await User.create({
      name: name.trim(), email: normalizedEmail,
      password: await bcrypt.hash(password, 10),
      companyId: invitation.companyId,
      department: invitation.department,
      role: invitation.role,
    });
    await Invitation.deleteMany({ email: normalizedEmail });
    return res.status(201).json({
      message: "User created successfully", token: generateToken(user),
      user: { id: user._id, name: user.name, email: user.email, role: user.role,
        department: user.department, companyId: user.companyId },
    });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: "User already exists" });
    console.error("Signup error:", error.message);
    return res.status(500).json({ error: "Could not create account" });
  }
};

export const login = async (req, res) => {
  const { email, password } = req.body;

  try {
    if (
      typeof email !== "string" ||
      !email.trim() ||
      typeof password !== "string" ||
      !password
    ) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const user = await User.findOne({
      email: typeof email === "string" ? email.trim().toLowerCase() : "",
    });

    if (!user) {
      return res
        .status(400)
        .json({
          error:
            "Email or password is incorrect. Please check both and try again.",
          code: "INVALID_CREDENTIALS",
        });
    }

    const isPasswordMatch = await bcrypt.compare(password, user.password);

    if (!isPasswordMatch) {
      return res
        .status(400)
        .json({
          error:
            "Email or password is incorrect. Please check both and try again.",
          code: "INVALID_CREDENTIALS",
        });
    }

    const token = generateToken(user);

    res.json({
      message: "Login successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
        companyId: user.companyId,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
};
