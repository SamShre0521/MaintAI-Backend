import express from "express";
import {
  addMachine,
  getMachines,
  getMachineById,
  deleteMachine,
} from "../controllers/machine.controller.js";
import { protect, authorizeRoles } from "../middleware/auth.middleware.js";
import { uploadMachineFiles } from "../middleware/upload.middleware.js";

const router = express.Router();

router.post(
  "/machines",
  protect,
  authorizeRoles("manager"),
  uploadMachineFiles.array("files", 5),
  addMachine
);

router.get("/machines", protect, authorizeRoles("manager"), getMachines);

router.get("/machines/:id", protect, authorizeRoles("manager"), getMachineById);

router.delete(
  "/machines/:id",
  protect,
  authorizeRoles("manager"),
  deleteMachine
);

export default router;