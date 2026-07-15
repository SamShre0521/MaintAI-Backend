import express from "express";

import {
  registerDeviceToken,
  unregisterDeviceToken,
} from "../controllers/deviceToken.controller.js";

import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.post(
  "/users/device-token",
  protect,
  registerDeviceToken,
);

router.delete(
  "/users/device-token",
  protect,
  unregisterDeviceToken,
);

export default router;