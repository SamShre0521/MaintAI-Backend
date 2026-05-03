import KnowledgeBase from "../models/knowledgeBase.model.js";

export const getKnowledgeBase = async (req, res) => {
  try {
    const knowledge = await KnowledgeBase.find({
      department: req.user.department,
    })
      .populate("approvedBy", "name email role department")
      .sort({ createdAt: -1 });

    res.json({ knowledge });
  } catch (error) {
    console.error("Get knowledge base error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
};