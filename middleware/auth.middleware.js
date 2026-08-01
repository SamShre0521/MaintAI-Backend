// import jwt from "jsonwebtoken";
// import User from "../models/user.model.js";

// export const protect = async (req, res, next) => {
//   try {
//     const authHeader = req.headers.authorization;

//     if (!authHeader || !authHeader.startsWith("Bearer ")) {
//       return res.status(401).json({ error: "Not authorized" });
//     }

//     const token = authHeader.split(" ")[1];

//     const decoded = jwt.verify(token, process.env.JWT_SECRET);

//     const user = await User.findById(decoded.userId).select("-password");

//     if (!user) {
//       return res.status(401).json({ error: "User not found" });
//     }

//     req.user = user;
//     next();
//   } catch (error) {
//     console.error("Auth middleware error:", error);
//     res.status(401).json({ error: "Invalid token" });
//   }
// };

// export const authorizeRoles = (...allowedRoles) => {
//   return (req, res, next) => {
//     if (!req.user) {
//       return res.status(401).json({ error: "Not authorized" });
//     }

//     if (!allowedRoles.includes(req.user.role)) {
//       return res.status(403).json({ error: "Access denied" });
//     }

//     next();
//   };
// };

import jwt from "jsonwebtoken";
import User from "../models/user.model.js";

export const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Not authorized",
      });
    }

    const token = authHeader.split(" ")[1];

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET,
    );

    const user = await User.findById(
      decoded.userId,
    ).select("-password");

    if (!user) {
      return res.status(401).json({
        error: "User not found",
      });
    }

    // Important for multi-company tenant isolation.
    if (!user.companyId) {
      return res.status(403).json({
        error:
          "User is not assigned to a company. Contact administrator.",
      });
    }

    req.user = user;

    // Optional convenience value.
    // You can use either req.user.companyId
    // or req.companyId in controllers.
    req.companyId = user.companyId;

    next();
  } catch (error) {
    console.error("Auth middleware error:", error);

    return res.status(401).json({
      error: "Invalid token",
    });
  }
};

export const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: "Not authorized",
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: "Access denied",
      });
    }

    next();
  };
};