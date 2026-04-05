import express from "express";
import connectDB from "./config/db.js";
import chatRoutes from "./routes/chat.routes.js";
import sessionRoutes from "./routes/session.routes.js";
import authRoutes from "./routes/auth.routes.js";
import managerRoutes from "./routes/manager.routes.js";
import feedbackRoutes from "./routes/feedback.routes.js";

const app = express();

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
