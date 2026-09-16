# Privacy Policy

Last updated: September 16, 2026

Kramer Intelligence is a Gemini-powered chat application operated by Daniel Vincent Kramer. This page describes how the application handles your information.

## Conversations and attachments

Your messages, relevant conversation history, and attached images or PDFs are sent through our Vercel backend to Google's Gemini Developer API to generate answers. Search mode can use Google's Search grounding service. The backend uses your supplied timezone and, where available, Vercel's approximate city/region headers to provide date and location context. It no longer makes a separate IP-API.com lookup.

The application does not intentionally log conversation bodies, attachments, API keys, or audio. Vercel and Google may maintain service, request, or security logs under their own policies. Requests use the Gemini free tier; Google may use submitted content to improve its products under its applicable Gemini API terms. Do not submit information you do not want those services to process.

## Unsaved chats

Unsaved conversations and temporary chat history remain in the current browser tab's memory. They are not intentionally written to our Firebase database. Refreshing or closing the tab clears them. Signing in does not automatically save your current conversation.

## Accounts and saved chats

Creating an account uses Firebase Authentication with your email and password. A user record stores your email so an existing account can be found when sharing a conversation. The application does not store your password in its chat database.

When you choose Save to cloud, your chat and its attachments are written to Firebase Firestore. Further messages and completed voice transcripts in that saved chat are also saved. Firebase encrypts stored data under its service protections; this is not end-to-end encryption. The developer has administrative access and can technically read saved chats. Our policy is not to access their contents except for user-requested troubleshooting or legal requirements.

Chats remain until deleted. Deleting a saved chat removes its messages and chat record from the application's database. Infrastructure backup/log retention, if any, is governed by the service providers.

## Sharing

Sharing adds an existing account as a collaborator. Collaborators can read and modify the shared conversation, including its saved files and transcripts. Share only with people you intend to give this access to. The owner can delete the conversation for everyone.

## Live voice

Voice starts only after you choose Voice and grant microphone permission. A short-lived token allows your browser to send microphone audio directly to Google's Gemini Live API and receive spoken responses and text transcriptions. The application's permanent Gemini key remains on its backend.

We do not save raw microphone recordings or generated audio in Firebase. Transcripts appear in the conversation and are saved if the conversation is already saved to the cloud, or if you later choose to save it. Ending the call releases the microphone and audio connection. Google processes audio and transcripts under its own API policies.

## Service providers

- **Google Gemini API:** processes conversation content, attachments, voice, and contextual information to generate responses.
- **Firebase Authentication and Firestore:** manage accounts and optional saved/shared chats.
- **Vercel:** hosts the site and backend and provides request metadata such as approximate location.

These providers have their own privacy policies and terms. This application uses their existing free-tier capabilities and does not change account billing settings.

## Contact and updates

Questions or requests: **dvkramer@outlook.com**.

Updates to this policy are published in this file with a revised date. The application currently does not have an automated email notification system for policy changes.
