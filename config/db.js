import mongoose from "mongoose";

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_DB_URL);
    console.log("MongoDB connected");
  } catch (error) {
    console.error("DB connection error:", error);
    process.exit(1);
  }
};

export default connectDB;