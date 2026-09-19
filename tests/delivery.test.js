import { test, mock } from "node:test";
import assert from "node:assert/strict";
import User from "../models/user.model.js";
let sentMail;
let pushPayload;
mock.module("nodemailer", {
  defaultExport: {
    createTransport: () => ({
      sendMail: async (args) => {
        sentMail = args;
      },
    }),
  },
});
mock.module("../config/firebaseAdmin.js", { defaultExport: {} });
mock.module("firebase-admin/messaging", {
  namedExports: {
    getMessaging: () => ({
      sendEachForMulticast: async (args) => {
        pushPayload = args;
        return {
          successCount: 1,
          failureCount: 1,
          responses: [
            { success: true },
            {
              success: false,
              error: { code: "messaging/registration-token-not-registered" },
            },
          ],
        };
      },
    }),
  },
});
const { sendReviewEmail } = await import("../services/email.service.js");
const { sendPushNotificationToUser } =
  await import("../services/pushNotification.service.js");

test("review emails include approval/rejection text and UTC timestamp", async (t) => {
  process.env.SMTP_HOST = "test.invalid";
  process.env.SMTP_FROM = "noreply@example.com";
  t.mock.method(User, "findById", () => ({
    select: async () => ({ email: "worker@example.com", name: "Worker" }),
  }));
  const result = await sendReviewEmail({
    userId: "worker",
    question: "E42",
    notification: {
      title: "Solution needs revision",
      message: "Use a documented fix",
      feedbackId: "feedback",
      createdAt: new Date("2026-08-20T12:00:00Z"),
    },
  });
  assert.equal(result.sent, true);
  assert.equal(sentMail.to, "worker@example.com");
  assert.match(sentMail.text, /2026-08-20T12:00:00.000Z/);
  assert.match(sentMail.subject, /needs revision/);
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_FROM;
});
test("unconfigured email reports unavailable instead of claiming delivery", async () => {
  const result = await sendReviewEmail({});
  assert.equal(result.sent, false);
  assert.match(result.reason, /not configured/);
});
test("employee push contains navigation data and removes invalid device tokens", async (t) => {
  t.mock.method(User, "findById", () => ({
    select: async () => ({
      deviceTokens: [
        { token: "valid" },
        { token: "expired" },
        { token: "valid" },
      ],
    }),
  }));
  let update;
  t.mock.method(User, "updateOne", async (filter, fields) => {
    update = { filter, fields };
  });
  const result = await sendPushNotificationToUser({
    userId: "employee",
    title: "Approved",
    body: "Approved fix",
    data: { feedbackId: "fix", screen: "solution_detail", revisionNumber: 2 },
  });
  assert.deepEqual(pushPayload.tokens, ["valid", "expired"]);
  assert.equal(pushPayload.data.revisionNumber, "2");
  assert.equal(pushPayload.data.feedbackId, "fix");
  assert.equal(pushPayload.android.priority, "high");
  assert.equal(result.successCount, 1);
  assert.equal(update.filter._id, "employee");
  assert.deepEqual(update.fields.$pull.deviceTokens.token.$in, ["expired"]);
});
