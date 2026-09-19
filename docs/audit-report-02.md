# Audit report 02: backend fixes and Android handoff

This implementation addresses the report dated 20 August 2026. It has not been deployed or verified on an Android device. External providers are mocked in regression tests; PDF and DOCX parsing tests use real generated documents.

| Report finding                            | Backend change                                                                                                                                                                 | Remaining integration / verification                                                                                                                                                               |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Slow initial login, unclear credentials   | Normalize email; return an actionable `error` and `INVALID_CREDENTIALS`; await MongoDB before accepting requests                                                               | Android must display API errors. Measure UAT cold start; an idle/sleeping host needs deployment configuration, not a login code workaround.                                                        |
| Repetitive/hallucinated chat              | Load the newest 20 messages instead of the first 20; refresh evidence every turn; decline unsupported answers                                                                  | Re-run report queries against the real manuals and model.                                                                                                                                          |
| No web fallback                           | Search after no internal match or insufficient internal evidence; return only cited web answers; explicit unavailable/no-results responses                                     | Verify OpenAI account access and render clickable `webSources` / inline links.                                                                                                                     |
| Knowledge data cannot be inspected        | Manager knowledge endpoint returns solutions, uploaders, approvers, dates and document processing states; added edit/deactivate and document-removal endpoints                 | Android needs a knowledge/documents view.                                                                                                                                                          |
| Chat input hidden / missing time          | Return user and assistant timestamps; retain timestamps in history                                                                                                             | Keyboard insets, input placement and date formatting belong to Android.                                                                                                                            |
| Cannot upload/view chat files             | Multipart files work on first and later turns, including file-only turns; PDF/DOC/DOCX/TXT/XLS/XLSX and image extraction; persisted filename metadata                          | Android file picker must send `files`; render filenames and processing failures.                                                                                                                   |
| No email on review                        | SMTP email on approval and rejection; email delivery result returned                                                                                                           | Configure SMTP and verify delivery. Email failures are reported and do not roll back the review; automatic email retries are not implemented.                                                      |
| Employee push not working                 | Send to submitting employee; include solution navigation IDs, timestamp and screen; prune invalid tokens; remove shared-device tokens from previous account                    | Register each employee's FCM token after login/token refresh. Request Android notification permission, create `maintai_alerts`, and handle cold/warm notification taps. Test on a physical device. |
| Rejected edits stale in manager dashboard | Preserve prior text, update question/answer, clear review, increment revision, order manager queue by update time; no-store API responses; reject stale review revisions       | Refresh queue after resubmission. Bind editor to current `feedback.question`/`feedback.answer`, not original assistant text.                                                                       |
| Role restrictions                         | Preserve manager route checks; restrict permanent manual ingestion to managers; scope manager queries and attachment access                                                    | Continue hiding manager controls in Android.                                                                                                                                                       |
| Approved fix not learned                  | Save company/machine/uploader metadata; newest exact approved fix comes from MongoDB immediately; approved fixes precede manuals; validate vector hits against current records | Run metadata repair for historical records; then repeat the approved question.                                                                                                                     |
| Document reading / metadata / attribution | Shared extraction pipeline; page-aware PDF citations; document title/uploader/date; persistent sources on assistant messages                                                   | Word/Excel extraction provides section numbers, not physical printed pages. Old answers cannot acquire citations retroactively.                                                                    |

## API details

- `POST /api/chat`: JSON text requests remain supported. For uploads use multipart `message` (optional with files), `machineId` on a new chat, `sessionId` on an existing chat, and up to five `files` (25 MB each). Do not set the multipart boundary manually.
- Alternatively `POST /api/attachments/upload` accepts `machineId`, optional owned `sessionId`, and `files`. Link its returned `_id` values using `attachmentIds` on `/api/chat` (JSON array or JSON-encoded multipart field). Only the uploader can link unassigned files for the same machine. `/test-upload` remains an alias.
- Chat returns `userMessageId`, `assistantMessageId`, `userCreatedAt`, `createdAt`, `attachments`, `knowledgeSources`, `attachmentOcrSources`, `webSources`, `sourceType`, and `sourceMessage`. Existing `reply`, `sessionId`, `title` and `usedKnowledge` fields remain. `sourceType` can now be `web` or `unverified`; no invented answer is labeled internal knowledge.
- All timestamps are ISO 8601 UTC values on the wire. Android should parse the instant and format it in the user's locale/time zone, without adding a second timezone offset.
- Session message history populates `attachments` with filenames/status instead of returning only ObjectIds, and preserves assistant citations. Legacy messages remain accessible through ownership-checked sessions.
- Scanned PDFs may return `processing`. Poll `GET /api/attachments/:id/multi-page-ocr/status`; later chat messages also check outstanding OCR jobs. A completed poll does not automatically create another assistant answer: ask the question again.
- `POST /api/attachments/:id/process-ocr` retries extraction of existing files. `POST /api/attachments/:id/manual-ingestion` requires a manager and completed extraction.
- `GET /api/knowledge-base`: returns `knowledge` and `documents` for the manager's company/department, with uploader, approval and processing metadata.
- `PATCH /api/knowledge-base/:id`: accepts `question`, `answer`, and/or boolean `isActive`. Deactivation excludes the solution from AI retrieval immediately, including stale vector matches. Basic empty/placeholder/profanity validation supplements manager review; it is not a complete multilingual content moderation system.
- `DELETE /api/knowledge-base/documents/:id`: removes the document from permanent AI retrieval while retaining its original file and audit metadata. A manager can restore it through manual ingestion.
- `POST /api/machines/:id/documents`: manager multipart upload for an existing machine; returns 202 while processing. Machine creation still supports attached manuals.
- `PATCH /api/feedbacks/:id/resubmit`: send revised `question` and `answer`, optionally `engineerFeedback` (`correct` or `not_helpful`). Use the returned `feedback` as the current UI state.
- Manager review should send the displayed `revisionNumber` alongside `managerStatus` to detect stale review screens. Notifications expose the current feedback revision; push data supplies `notificationId`, `feedbackId`, `sessionId`, `knowledgeId`, `screen: solution_detail`, and `createdAt`.

## Configuration and existing data

New SMTP environment settings (do not commit real values):

```dotenv
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-smtp-user
SMTP_PASSWORD=your-smtp-password
SMTP_FROM=MaintAI <noreply@example.com>
```

Existing OpenAI, MongoDB, Pinecone, S3/Textract and Firebase settings are still required. Web fallback uses the existing model with the Responses `web_search` tool, following [official OpenAI documentation](https://developers.openai.com/api/docs/guides/tools-web-search). Actual URL annotations are returned to the client. Search receives the standalone question and machine name, not full internal documents or chat history.

Historical approved solutions may lack company/machine metadata. The repair script uses the approved source feedback and its owned session to establish scope, skips unverifiable records, preserves content/timestamps, and reports counts. Review a backup and dry-run output in the target environment before applying:

```sh
node scripts/repairAuditMetadata.js
node scripts/repairAuditMetadata.js --apply
```

The apply mode also repairs missing message ownership and reindexes approved knowledge. It has not been run against your database. Existing failed manuals can be retried with the extraction and ingestion endpoints. Machine upload processing still runs inside the backend process; a server restart can interrupt a job. A persistent job worker is a separate deployment improvement.

## Verification

Run `npm test` with Node 22.14+ (the runner uses experimental module mocks). Tests make no live AI, storage, email or push calls. They cover document extraction, source pages, scoped retrieval, immediate approved fixes, web fallback and failures, resubmission, manager review, chat history beyond 20 turns, uploads, authorization, email content, and push token cleanup.

Before closing the report, run UAT for both roles: login failure; first/continued PDF and Word uploads; approve/reject/edit/resubmit; repeat the approved question with no manual; unsupported query with a cited web fallback; reopen source-bearing history; receive email/push on physical devices; tap notification from a terminated app; check keyboard visibility and local timestamps.
