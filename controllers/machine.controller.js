import Machine from "../models/machine.model.js";
import { processMachineFiles } from "../services/machineDocument.service.js";

export const addMachine = async (req, res) => {
  const { machineName, specifications } = req.body;

  try {
    if (!machineName || !specifications) {
      return res.status(400).json({
        error: "machineName and specifications are required",
      });
    }

    const files = (req.files || []).map((file) => ({
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
    }));

    const machine = await Machine.create({
      machineName,
      specifications,
      department: req.user.department,
      addedBy: req.user._id,
      files,
    });

    if (req.files && req.files.length > 0) {
      setImmediate(() => {
        processMachineFiles(machine._id, req.files);
      });
    }

    res.status(201).json({
      message: "Machine added successfully",
      machine,
    });
  } catch (error) {
    console.error("Add machine error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
};

export const getMachines = async (req, res) => {
  try {
    const machines = await Machine.find({
      department: req.user.department,
    })
      .populate("addedBy", "name email role department")
      .sort({ createdAt: -1 });

    res.json({ machines });
  } catch (error) {
    console.error("Get machines error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
};

export const getMachineById = async (req, res) => {
  const { id } = req.params;

  try {
    const machine = await Machine.findOne({
      _id: id,
      department: req.user.department,
      companyId: req.user.companyId,

    }).populate("addedBy", "name email role department");

    if (!machine) {
      return res.status(404).json({ error: "Machine not found" });
    }

    res.json({ machine });
  } catch (error) {
    console.error("Get machine error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
};

export const deleteMachine = async (req, res) => {
  const { id } = req.params;

  try {
    const machine = await Machine.findOne({
      _id: id,
      department: req.user.department,
        companyId: req.user.companyId,

    });

    if (!machine) {
      return res.status(404).json({ error: "Machine not found" });
    }

    await Machine.deleteOne({ _id: id });

    res.json({ message: "Machine deleted successfully" });
  } catch (error) {
    console.error("Delete machine error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
};
