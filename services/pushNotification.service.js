import admin from "../config/firebaseAdmin.js";
import User from "../models/user.model.js";
import { getMessaging } from "firebase-admin/messaging";
import firebaseAdminApp from "../config/firebaseAdmin.js";
export const sendPushNotificationToUser = async ({
  userId,
  title,
  body,
  data = {},
}) => {
  if (!firebaseAdminApp) {
    console.warn(
      "Push notification skipped because Firebase Admin is not configured",
    );

    return {
      successCount: 0,
      failureCount: 0,
      skipped: true,
    };
  }
  const user = await User.findById(userId).select("deviceTokens");

  const tokens = [
    ...new Set(
      (user?.deviceTokens ?? []).map((item) => item.token).filter(Boolean),
    ),
  ];

  if (tokens.length === 0) {
    console.log(`No registered device tokens for user ${userId}`);

    return {
      successCount: 0,
      failureCount: 0,
    };
  }

  const stringData = Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, String(value ?? "")]),
  );

  const messaging = getMessaging(firebaseAdminApp);

  const response = await messaging.sendEachForMulticast({
    tokens,

    notification: {
      title,
      body,
    },

    data: stringData,

    android: {
      priority: "high",
      notification: {
        channelId: "maintai_alerts",
        sound: "default",
      },
    },
  });

  response.responses.forEach((result, index) => {
    if (result.success) {
      return;
    }

    console.error(
      "FCM delivery failed:",
      result.error?.code,
      result.error?.message,
    );

    const code = result.error?.code;

    if (
      code === "messaging/registration-token-not-registered" ||
      code === "messaging/invalid-registration-token"
    ) {
      invalidTokens.push(tokens[index]);
    }
  });

  if (invalidTokens.length > 0) {
    await User.updateOne(
      {
        _id: userId,
      },
      {
        $pull: {
          deviceTokens: {
            token: {
              $in: invalidTokens,
            },
          },
        },
      },
    );
  }

  return {
    successCount: response.successCount,
    failureCount: response.failureCount,
  };
};
