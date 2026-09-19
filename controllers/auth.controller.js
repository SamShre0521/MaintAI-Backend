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

export const signup = async (req, res) => {
  const { name, email, password, role, department } = req.body;

  try {
    if (!name || !email || !password || !department) {
      return res
        .status(400)
        .json({ error: "Name, email, password and department are required" });
    }

    const existingUser = await User.findOne({
      email: typeof email === "string" ? email.trim().toLowerCase() : "",
    });

    if (existingUser) {
      return res.status(400).json({ error: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role: role || "engineer",
      department,
    });

    const token = generateToken(user);

    res.status(201).json({
      message: "User created successfully",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
      },
    });
  } catch (error) {
    console.error("Signup error:", error);
    res.status(500).json({ error: "Something went wrong" });
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
