// import {
//   applicationDefault,
//   getApps,
//   initializeApp,
// } from "firebase-admin/app";

// let firebaseAdminApp = null;

// try {
//   firebaseAdminApp =
//     getApps().length > 0
//       ? getApps()[0]
//       : initializeApp({
//           credential: applicationDefault(),
//         });

//   console.log("Firebase Admin initialized successfully");
// } catch (error) {
//   console.error(
//     "Firebase Admin initialization failed:",
//     error.message,
//   );

//   firebaseAdminApp = null;
// }

// export default firebaseAdminApp;

import {
  cert,
  getApps,
  initializeApp,
} from "firebase-admin/app";

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(
  /\\n/g,
  "\n",
);

if (!projectId || !clientEmail || !privateKey) {
  throw new Error(
    "Firebase Admin configuration is incomplete. " +
      "Check FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, " +
      "and FIREBASE_PRIVATE_KEY.",
  );
}

const firebaseAdminApp =
  getApps().length > 0
    ? getApps()[0]
    : initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey,
        }),
        projectId,
      });

console.log(
  `Firebase Admin initialized successfully for project: ${projectId}`,
);

export default firebaseAdminApp;