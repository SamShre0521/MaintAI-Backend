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

    if (!req.user.companyId) {
      return res.status(403).json({
        error: "User is not assigned to a company",
      });
    }

    const files = (req.files || []).map((file) => ({
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      processingStatus: "pending",
      errorMessage: "",
    }));

    /*
     * Create the machine first.
     *
     * This gives us the machineId required for:
     * - S3 path
     * - ChatAttachment
     * - Pinecone metadata
     */
    const machine = await Machine.create({
      companyId: req.user.companyId,
      machineName: machineName.trim(),
      specifications: specifications.trim(),
      department: req.user.department,
      addedBy: req.user._id,
      files,
    });

    /*
     * Process uploaded manuals asynchronously.
     *
     * The API does not need to wait for Textract,
     * chunking, embeddings and Pinecone ingestion.
     */
    if (req.files?.length > 0) {
      req.files.forEach((file, index) => {
        file.machineFileId = machine.files[index]._id;
      });
      setImmediate(() => {
        processMachineFiles({
          machineId: machine._id,
          files: req.files,
          companyId: req.user.companyId,
          uploadedBy: req.user._id,
        }).catch((error) => {
          console.error(
            "Background machine document processing failed:",
            error,
          );
        });
      });
    }

    return res.status(201).json({
      message:
        req.files?.length > 0
          ? "Machine added successfully. Manual processing has started."
          : "Machine added successfully.",
      machine,
    });
  } catch (error) {
    console.error("Add machine error:", error);

    return res.status(500).json({
      error: error.message || "Something went wrong",
    });
  }
};

export const getMachines = async (req, res) => {
  try {
    if (!req.user.companyId) {
      return res.status(403).json({
        error: "User is not assigned to a company",
      });
    }

    const machines = await Machine.find({
      companyId: req.user.companyId,
      department: req.user.department,
    })
      .populate("addedBy", "name email role department")
      .sort({ createdAt: -1 });

    return res.json({
      machines,
    });
  } catch (error) {
    console.error("Get machines error:", error);

    return res.status(500).json({
      error: "Something went wrong",
    });
  }
};

export const getMachineById = async (req, res) => {
  const { id } = req.params;

  try {
    if (!req.user.companyId) {
      return res.status(403).json({
        error: "User is not assigned to a company",
      });
    }

    const machine = await Machine.findOne({
      _id: id,
      department: req.user.department,
      companyId: req.user.companyId,
    }).populate("addedBy", "name email role department");

    if (!machine) {
      return res.status(404).json({
        error: "Machine not found",
      });
    }

    return res.json({
      machine,
    });
  } catch (error) {
    console.error("Get machine error:", error);

    return res.status(500).json({
      error: "Something went wrong",
    });
  }
};

export const deleteMachine = async (req, res) => {
  const { id } = req.params;

  try {
    if (!req.user.companyId) {
      return res.status(403).json({
        error: "User is not assigned to a company",
      });
    }

    const machine = await Machine.findOne({
      _id: id,
      department: req.user.department,
      companyId: req.user.companyId,
    });

    if (!machine) {
      return res.status(404).json({
        error: "Machine not found",
      });
    }

    await Machine.deleteOne({
      _id: id,
      companyId: req.user.companyId,
    });

    return res.json({
      message: "Machine deleted successfully",
    });
  } catch (error) {
    console.error("Delete machine error:", error);

    return res.status(500).json({
      error: "Something went wrong",
    });
  }
};

export const addMachineDocuments = async (req, res) => {
  try {
    if (!req.files?.length)
      return res
        .status(400)
        .json({ error: "At least one document is required" });
    const machine = await Machine.findOneAndUpdate(
      {
        _id: req.params.id,
        companyId: req.user.companyId,
        department: req.user.department,
      },
      {
        $push: {
          files: {
            $each: req.files.map((file) => ({
              originalName: file.originalname,
              mimeType: file.mimetype,
              size: file.size,
              processingStatus: "pending",
            })),
          },
        },
      },
      { returnDocument: "after" },
    );
    if (!machine) return res.status(404).json({ error: "Machine not found" });
    req.files.forEach((file, index) => {
      file.machineFileId =
        machine.files[machine.files.length - req.files.length + index]._id;
    });
    setImmediate(() =>
      processMachineFiles({
        machineId: machine._id,
        companyId: req.user.companyId,
        uploadedBy: req.user._id,
        files: req.files,
      }).catch((error) =>
        console.error("Document processing failed:", error.message),
      ),
    );
    return res
      .status(202)
      .json({ message: "Document processing started", machine });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Could not upload documents" });
  }
};
