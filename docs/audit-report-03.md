# Report 03: backend changes and Android integration

Testing report date: 13 October 2026.

This repository contains the backend. Android screens and clipboard behavior must be implemented in the Android repository. All endpoints below use the `/api` prefix. Authenticated requests require `Authorization: Bearer <token>`.

## 1. Multiple managers and employees

The old signup handler omitted the required company ID, so it could not create a valid user. Signup now uses an invitation from an existing manager. This also prevents someone from choosing another company's ID or granting themselves a manager role.

1. A manager calls `POST /api/auth/invitations` with:
   ```json
   { "email": "worker@example.com", "role": "engineer" }
   ```
   Use `manager` for another manager. The backend role for an employee is `engineer`. The invite inherits the manager's company and department. The response contains `invitationToken` and `expiresAt` (seven days). The manager shares the token with the intended user; email delivery is not implemented.
2. The new user calls `POST /api/auth/signup` with:
   ```json
   {
     "name": "New Worker",
     "email": "worker@example.com",
     "password": "a-password-of-at-least-8-characters",
     "invitationToken": "paste-the-token-here"
   }
   ```
3. Signup returns a login token and user details, including `companyId`. Company, role and department come from the invitation; request overrides are ignored. Invitations require a matching email and an active company. Existing accounts and login continue to work.

Android needs invitation creation for managers and an invitation token field on signup. Existing company provisioning must create the first manager; this is not public company registration.

## 2. Employee documents and manager approval

Uploading a file does not automatically share it with coworkers. The uploader explicitly submits it after processing finishes.

1. Upload through the existing multipart `POST /api/chat` (`machineId`, optional `message`, and `files`), or `POST /api/attachments/upload` (`machineId`, optional `sessionId`, and `files`). Chat can also accept previously uploaded `attachmentIds`.
2. Wait for `processingStatus: "completed"`. Scanned documents can take longer and use the existing OCR endpoints or chat follow-up.
3. Call `POST /api/attachments/:id/submit` with optional `{ "documentTitle": "Hydraulic press maintenance" }`. Only the uploader can submit. Temporary and rejected documents become `pending_approval`.
4. Managers load `GET /api/attachments?status=pending_approval`. Results are limited to their company and department's machines.
5. A manager calls `POST /api/attachments/:id/review` with `{ "decision": "approved" }` or `{ "decision": "rejected", "comment": "Please upload the corrected document" }`.
6. Approval indexes the document and sets `knowledgeStatus: "permanent"`. It then becomes available to knowledge search for the same company and machine. Rejection keeps it out of shared search. The employee can submit again or upload a corrected file and submit that.

The review endpoint checks that the document is still pending, so concurrent reviews cannot both claim it. If indexing fails, the document returns to pending for retry. Search checks database status, keeping partial indexing results hidden. Existing private chat content remains available to its owner even when it is not approved for shared knowledge.

`GET /api/attachments` returns all accessible documents for managers and only the uploader's documents for employees. Optional filters: `machineId` and `status`. Results include title, original filename, uploader name/email, upload date, processing state, review state, reviewer and comment. Android can use this endpoint to display submission status. Document review notifications are not added by these changes; the existing solution feedback notifications are unchanged.

## 3. More documents for an existing machine

The backend already supports manager multipart uploads to `POST /api/machines/:id/documents`, using the `files` field (up to five files per request). It appends documents to the existing machine and processes them in the background. Poll `GET /api/machines/:id` for `files[].processingStatus` and `errorMessage`.

Android needs an “Add documents” action on an existing machine. Employees add data to that same machine through the submission workflow above.

## 4. Repeated web answers

For repeated questions in the same chat, the backend checks the latest 20 messages and passes up to three earlier matching external answers to the web fallback. Matching ignores case and extra spaces. Private internal answers are excluded from this extra web context. The model is asked to find additional supported causes or checks and say when no verified alternative exists. This cannot guarantee a different correct solution every time; internal approved fixes still take priority.

## 5. Copying chat history

`GET /api/sessions/:sessionId/messages` already returns each message's plain `content`, timestamps and source information after checking session ownership. Android must enable text selection/long press or add a Copy button that writes `content` to the Android clipboard. No backend endpoint can enable clipboard selection in the Android UI.

## 6. Verification

Run `npm test` for automated regression tests. The tests mock database and external services; they do not verify live MongoDB, S3, OCR, Pinecone, OpenAI or Android behavior. Retest the complete flows with multiple manager and employee accounts in the testing environment before marking the report items as passed.
