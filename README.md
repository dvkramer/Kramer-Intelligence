# Kramer Intelligence

A small Gemini chat app: complete text replies, web search, Study Mode, images/PDFs, optional Firebase accounts and shared saved chats, and Live voice.

Try it at [kramerintel.vercel.app](https://kramerintel.vercel.app). No login or personal API key is required for ordinary use. The [Windows WebView2 wrapper](../../releases) continues to load the same site.

## Run locally

Requires a current Node.js release supporting `AbortSignal.timeout` (Node 22+ recommended).

```sh
npm ci
npm run dev -- --demo
```

The demo uses an explicitly labeled local response and disables cloud accounts and Live connections. It never sends demo conversations to Gemini or Firebase.

For real API calls, provide the same existing environment variables used by Vercel and run `npm run dev`:

- `GEMINI_API_KEY`: the existing server-side Gemini Developer API key.
- `FIREBASE_API_KEY`: the existing Firebase web configuration key.

The server deliberately does not load or print secret files. Node's `--env-file` option can load a local ignored `.env` file, e.g. `node --env-file=.env scripts/dev-server.js`.

## Deployment and compatibility

Keep the existing Vercel project, domain, static `public/` directory, and functions in `api/`. No new environment variables, Firebase console settings, billing enablement, indexes, Storage buckets, authentication providers, or database migrations are required by this change. The existing pinned Firebase SDK is retained to reduce compatibility risk.

The Firebase contracts remain:

- `users/{uid}`: `email`
- `chats/{chatId}`: `title`, `ownerId`, `collaborators`, `createdAt`
- `chats/{chatId}/messages/{messageId}`: `role`, `parts`, `id`, optional `userId`, `createdAt`

Existing message IDs, inline attachment Data URLs, `fileInfoForDisplay`, and `searchSuggestionHtml` still load. New writes use stable message IDs for retryable saves. Existing `/api/config` and `/api/chat` JSON contracts remain supported. **Text responses do not stream and there is no Stop control.**

`vercel.json` gives text generation a 60-second function budget and token provisioning 30 seconds. Preview before merging to production. Production security rules are not in this repository; compatibility with the deployed rules must be checked using the existing accounts, without changing those rules.

## Gemini models and free tier

Model/tool choices are centralized in `lib/gemini.js`, verified against [Google pricing](https://ai.google.dev/gemini-api/docs/pricing) on September 16, 2026:

| Mode                                              | Models                                                                         |
| ------------------------------------------------- | ------------------------------------------------------------------------------ |
| Search on (default, preserving existing behavior) | `gemini-2.5-flash`, then `gemini-2.5-flash-lite`                               |
| Search off                                        | `gemini-3.8-flash`, then `gemini-3.5-flash-lite`, then `gemini-2.5-flash-lite` |
| Live voice                                        | `gemini-3.8-live`                                                              |

The newer text models do not include free Search grounding, so Search uses the free-compatible 2.5 models. Retries are bounded and restricted to quota, availability, and transient failures. There is no paid-only model fallback. All visitors share the Gemini project's actual free quota; model availability and quotas can change. A free account cannot offer unlimited use. This application does not change Google's billing settings or enforce a spending cap on a separately paid project.

## Live voice

`POST /api/live-token` creates a single-use token constrained to the chosen audio model, system instruction, and transcription settings. The token must start a session within a minute and expires after eight minutes. The permanent API key stays on the server. The browser connects directly to Gemini's constrained WebSocket endpoint, with AudioWorklet microphone capture, 16 kHz PCM input, PCM playback, interruption handling, mute, and an End call button.

Completed text transcripts join the current conversation; raw recordings are not stored in Firebase. Voice is optional and needs HTTPS/localhost, microphone permission, and a supported browser. Calls end cleanly on navigation, chat changes, token expiry, or connection failure. Start another call to continue; automatic reconnection is intentionally omitted to avoid duplicate turns and hidden quota use. Saved-chat transcripts use the existing schema.

The token route checks browser origins and issues short-lived constrained credentials. Guest access remains available; origin checks are not authentication or a distributed abuse limiter. Google project quotas remain the final shared usage limit.

References: [ephemeral tokens](https://ai.google.dev/gemini-api/docs/live-api/ephemeral-tokens), [WebSocket protocol](https://ai.google.dev/gemini-api/docs/live-api/get-started-websocket), [REST reference](https://ai.google.dev/api/live).

## Files and privacy

The entire encoded API request is limited to 4 MB, below Vercel's 4.5 MB limit. Large browser-decodable images are resized, and direct files must fit the request. Saving additionally checks each legacy message against a conservative 900 KB budget below Firestore's 1 MiB document limit. Some files can be used locally but are too large to cloud-save; the UI reports this before creating a partial save. File bodies and credentials are never intentionally logged.

Unsaved chats remain in tab memory and disappear on refresh or closing the tab. Signing in preserves the current unsaved chat. See [privacy.md](privacy.md) for service/data details.

## Checks and maintenance

```sh
npm run check
npm test
npm audit
```

Tests cover non-streaming/legacy API responses, free-compatible model routing, multipart answers, input and quota failures, constrained voice tokens, wrong-chat race prevention, duplicate submits, failed edits and regeneration, retryable cloud saves, sign-out races, legacy message rendering, HTML isolation, dialogs, composer behavior, and voice audio/cleanup.

Browser libraries are vendored with licenses and pinned in `package-lock.json`. After explicitly updating them, run `npm run vendor` and commit the refreshed vendor assets. There is no production bundler or framework migration.

Before production rollout, verify existing sign-in/reset, cloud-save-and-continue, old attachments, two-account sharing, editing/regeneration, repeat deletion, actual free-key Search/text requests, and a microphone call in the intended browsers/Windows wrapper. Mock tests cannot certify deployed Firebase rules or account-specific Gemini availability.
