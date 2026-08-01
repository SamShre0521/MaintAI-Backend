import express from "express";
import connectDB from "./config/db.js";
import chatRoutes from "./routes/chat.routes.js";
import sessionRoutes from "./routes/session.routes.js";
import authRoutes from "./routes/auth.routes.js";
import managerRoutes from "./routes/manager.routes.js";
import feedbackRoutes from "./routes/feedback.routes.js";
import knowledgeBaseRoutes from "./routes/knowledgeBase.routes.js";
import machineRoutes from "./routes/machine.routes.js";
import deviceTokenRoutes from "./routes/deviceToken.routes.js";
import notificationRoutes from "./routes/notification.routes.js";
import cors from "cors";
import attachmentRoutes from "./routes/attachment.routes.js";
const app = express();


app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:3000",
      "https://maintai-backend-uat.onrender.com",
    ],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use(express.json());
const PORT = process.env.PORT || 3000;

// Connect database
connectDB();

// Health route
app.get("/", (req, res) => {
  res.send("Server running 🚀");
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});

// API routes
app.use("/api", authRoutes);
app.use("/api", chatRoutes);
app.use("/api", sessionRoutes);
app.use("/api", managerRoutes);
app.use("/api", feedbackRoutes);
app.use("/api", knowledgeBaseRoutes);
app.use("/api", machineRoutes);
app.use("/api", deviceTokenRoutes);
app.use("/api", notificationRoutes);
app.use(
  "/api/attachments",
  attachmentRoutes,
);
