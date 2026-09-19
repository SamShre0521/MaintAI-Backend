import nodemailer from "nodemailer";
import User from "../models/user.model.js";

export async function sendReviewEmail({ userId, notification, question }) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_FROM) {
    return { sent: false, reason: "Email is not configured" };
  }
  try {
    const user = await User.findById(userId).select("email name");
    if (!user?.email) return { sent: false, reason: "Recipient has no email" };
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
        : undefined,
      connectionTimeout: 10000,
      socketTimeout: 10000,
    });
    await transport.sendMail({
      from: process.env.SMTP_FROM,
      to: user.email,
      subject: `MaintAI: ${notification.title}`,
      text: `Hello ${user.name},\n\n${notification.message}\n\nQuestion: ${question}\nSubmission: ${notification.feedbackId}\nTime (UTC): ${notification.createdAt.toISOString()}\n\nOpen MaintAI to view the solution or edit and resubmit it.`,
    });
    return { sent: true };
  } catch (error) {
    console.error("Review email failed:", error.message);
    return { sent: false, reason: "Email delivery failed" };
  }
}
