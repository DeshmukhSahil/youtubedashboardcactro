# YouTube Companion Dashboard — README

## Cactro Fullstack Task

---

## Project summary

A mini-dashboard that connects to the YouTube API and helps the owner manage one uploaded video. The uploaded video in this submission is **unlisted** and was uploaded manually to YouTube (not via API). The app fetches video details, allows posting/replying/deleting comments, updating the video's title/description, and storing local notes (in DB) for improvement ideas. All actionable events are logged to a `logs` collection.

---

## Architecture / Tech stack

* Backend: Node.js + Express
* DB: MongoDB (Mongoose)
* YouTube integration: Direct calls to `https://www.googleapis.com/youtube/v3` using `axios`.
* OAuth helper: `oauth-get-tokens.js` — lightweight script/server to obtain OAuth tokens when needed.
* Frontend: Static files`

---

## Environment variables

Create a `.env` file in project root with these keys (example):

```
PORT=5000
MONGODB_URI=mongodb+srv://<user>:<pass>@cluster0.mongodb.net/yourdb
VIDEO_ID=<YOUR_UPLOADED_VIDEO_ID>
YOUTUBE_API_KEY=<YOUR_SERVER_API_KEY>         # optional for read-only comment listing
YOUTUBE_ACCESS_TOKEN=<OAUTH_ACCESS_TOKEN>     # required for comment create/delete, update video
CLIENT_ID=<YOUR_GOOGLE_CLIENT_ID>      # for oauth-get-tokens.js helper
CLIENT_SECRET=<YOUR_GOOGLE_CLIENT_SECRET>
OAUTH_REDIRECT_URI=http://localhost:5000/oauth2callback

```

**Notes:**

* For write operations (posting/deleting comments, updating video) the access token must have the scope: `https://www.googleapis.com/auth/youtube.force-ssl`.
* The app can read comments with either the OAuth token or an API key (read-only). However many operations (post/delete/update) need OAuth with proper scopes.

---

## How to run locally

1. `git clone <repo>`
2. `cd <repo>`
3. `npm install`
4. create `.env` with required vars (see above)
5. (Optional) Run the OAuth helper to get tokens:

   * `node oauth-get-tokens.js` (or `node oauth-get-tokens.js` after `npm i googleapis`)
   * Open `http://localhost:5000/auth`, complete consent, and copy the returned tokens into your `.env`.
6. `node server.js` or `npm start`
7. Visit `http://localhost:5000/` to open the UI (or call API endpoints with Postman/curl).

---

## API endpoints

All endpoints are mounted under `/api` (server base `http://<host>:<port>`)

> The examples use `VIDEO_ID` from environment and OAuth bearer header is handled by server via `process.env.YOUTUBE_ACCESS_TOKEN` for operations that require it.

### GET /api/video

Fetch video details (snippet + statistics).

* **Query params:** none
* **Auth:** none (server uses `YOUTUBE_API_KEY` or can rely on OAuth bearer configured in env)
* **Success:** 200 JSON (YouTube `videos` resource)

### PUT /api/video

Update video snippet (title, description)

* **Body (JSON):** `{ "title": "New title", "description": "New description" }`
* **Auth:** requires `YOUTUBE_ACCESS_TOKEN` env (OAuth with `youtube.force-ssl` scope)
* **Success:** 200 JSON (updated `videos` resource)

### POST /api/comment

Create a top-level comment or reply

* **Body (JSON):** `{ "text": "comment text", "parentId": "<optional parent comment id>" }`
* If `parentId` is provided -> creates a reply (`comments.insert`), else creates a new thread (`commentThreads.insert`).
* **Auth:** requires `YOUTUBE_ACCESS_TOKEN`
* **Success:** 200 JSON (YouTube response)

### GET /api/comments

List comment threads for the video

* **Query params:**

  * `all=true` to paginate and return (server-side) all items up to safety cap
  * `maxResults` default `50`, max `100`
  * `pageToken` for paging
* **Auth:** optional; read with `YOUTUBE_API_KEY` or `YOUTUBE_ACCESS_TOKEN`.
* **Success:** 200 JSON (YouTube `commentThreads` response) or `{ items: [...], nextPageToken, fetchedAll }` when `all=true`.

### DELETE /api/comment/\:id

Delete a comment (or comment thread) by id.

* **Auth:** requires `YOUTUBE_ACCESS_TOKEN`.
* **Success:** 200 on success
* **Notes:** server attempts fallback (deleting as `commentThreads` when `comments` delete returns 400).

### POST /api/note

Create a local note linked to the video

* **Body (JSON):** `{ "content": "Ideas...", "tags": ["seo","thumbnail"] }`
* Saves to `notes` collection: `{ videoId, content, tags, createdAt, updatedAt }`
* **Auth:** none (app-level); recommend protecting in real app with user auth

### GET /api/note/search?q=term

Search notes by content (case-insensitive). Returns matching notes.

### OAuth helper (separate script)

* `GET /auth` — start OAuth flow (serves a link)
* `GET /oauth2callback` — exchange code for tokens and prints tokens in terminal and browser.

---

## Database schemas (Mongoose)

Below are suggested Mongoose schemas (the running app uses collections `notes` and `logs`). Add these to `models/` as `Note.js` and `Log.js`.

**models/Note.js**

```js
const mongoose = require('mongoose');
const NoteSchema = new mongoose.Schema({
  videoId: { type: String, required: true, index: true },
  content: { type: String, required: true },
  tags: { type: [String], default: [] },
}, { timestamps: true });
module.exports = mongoose.model('Note', NoteSchema);
```

**models/Log.js**

```js
const mongoose = require('mongoose');
const LogSchema = new mongoose.Schema({
  action: { type: String, required: true },
  meta: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: { createdAt: true, updatedAt: false } });
module.exports = mongoose.model('Log', LogSchema);
```

**(Optional) models/User.js** — if you add authentication later, keep a user model and associate `notes` / `logs` with user IDs.

---

## Event logging

Every important action the app performs is recorded in `logs` via the helper `logAction(action, meta)` used in routes. Typical logged actions:

* `FETCH_VIDEO_DETAILS`
* `FETCH_COMMENTS_PAGE` (meta: `{ pageToken, count }`)
* `FETCH_COMMENTS_ALL` (meta: `{ total }`)
* `POST_COMMENT` (meta: `{ text, parentId }`)
* `DELETE_COMMENT` (meta: `{ id }`)
* `DELETE_COMMENTTHREAD` (meta: `{ id }`)
* `UPDATE_VIDEO_DETAILS` (meta: `{ title, description }`)
* `ADD_NOTE` (meta: `{ content, tags }`)

Logs are stored in MongoDB with `createdAt` timestamp so you can query the audit trail or export events.

---

## Example curl requests

Fetch video:

```bash
curl http://localhost:5000/api/video
```

Post a comment:

```bash
curl -X POST http://localhost:5000/api/comment \
  -H "Content-Type: application/json" \
  -d '{ "text": "Great video!" }'
```

List comments (first page):

```bash
curl "http://localhost:5000/api/comments?maxResults=50"
```

Delete comment:

```bash
curl -X DELETE http://localhost:5000/api/comment/COMMENT_ID
```

Create note:

```bash
curl -X POST http://localhost:5000/api/note \
  -H "Content-Type: application/json" \
  -d '{ "content": "Try different thumbnail", "tags": ["thumbnail"] }'
```

---

## Deployment notes

* Host Node server on Render/Heroku/Cloud Run/Render's Web Service. Ensure `MONGODB_URI` is set in platform env.
* If frontend is a separate SPA, deploy to Vercel/Netlify and point API calls to your server URL.
* Ensure OAuth redirect URI in Google Cloud Console matches the `OAUTH_REDIRECT_URI` you provide.
* Keep `GOOGLE_CLIENT_SECRET` and `YOUTUBE_ACCESS_TOKEN` out of public repos — use platform env variables.

---

## Troubleshooting

* **401 Unauthorized / Invalid Credentials:** Access token missing or expired. Re-run the OAuth helper to obtain new tokens or implement token refresh using the refresh token.
* **403 Forbidden:** The authenticated account does not have permission for that resource (e.g., deleting comments that belong to other users). Ensure you are authenticating as the channel owner.
* **Rate limits / Quota:** Keep API key and quota usage in mind. Use `maxResults` and pagination conservatively.
* **CORS:** If you serve a separate SPA, configure CORS on your server or call API through server-side proxy.

---

