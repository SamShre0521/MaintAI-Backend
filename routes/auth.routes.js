import { protect, authorizeRoles } from "../middleware/auth.middleware.js";
import express from "express";
import { signup, login, createSignupInvitation } from "../controllers/auth.controller.js";

const router = express.Router();

router.post("/auth/signup", signup);
router.post("/auth/invitations", protect, authorizeRoles("manager"), createSignupInvitation);
router.post("/auth/login", login);

export default router;