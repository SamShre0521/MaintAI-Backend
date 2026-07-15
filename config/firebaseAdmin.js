import {
  applicationDefault,
  getApps,
  initializeApp,
} from "firebase-admin/app";

let firebaseAdminApp = null;

try {
  firebaseAdminApp =
    getApps().length > 0
      ? getApps()[0]
      : initializeApp({
          credential: applicationDefault(),
        });

  console.log("Firebase Admin initialized successfully");
} catch (error) {
  console.error(
    "Firebase Admin initialization failed:",
    error.message,
  );

  firebaseAdminApp = null;
}

export default firebaseAdminApp;