# KPH — Khalil's Play House

A responsive study-resource website with a searchable notes and assignments library, subject filters, downloads, a KPH entry animation, and a password-protected admin upload/delete flow.

> This is an original study-portal design, not a pixel-perfect copy of PruthTalks. The reference site's rendered content was not accessible during creation, so its exact layout could not be reproduced or verified.

## Requirements

- Node.js 18 or newer
- npm

## Run locally

1. Extract the ZIP and open the `KPH-Website` folder.
2. Open a terminal in the extracted `KPH-Website` folder.
3. Run `npm install`.
4. Copy `.env.example` to `.env`.
5. In `.env`, set `ADMIN_PASSWORD` to a password you choose and set `SESSION_SECRET` to a long random secret.
6. Run `npm start`.
7. Open `http://localhost:3000`.
8. Select **Admin sign in** to upload resources. Everyone who can access the site can browse and download; only the admin can upload or remove resources.

Example `SESSION_SECRET` can be generated with a password manager or a cryptographically secure random generator. Keep `.env` private.

## Upload features

- Notes and assignment categories
- Title, subject, semester/year, and short description
- Search by title, subject, description, semester, filename, or type
- Subject chips and resource-type filters
- Public file downloads
- Admin-only uploads and deletions (8 failed sign-in attempts trigger a 15-minute cooldown)
- Files up to 25 MB; PDF, Word, PowerPoint, text/Markdown, images, XLSX, and CSV formats
- Uploaded files are stored in `uploads/`; metadata is stored in `data/resources.json`

## Before publishing online

This project is a small, single-server starter. Before using it for a public or multi-user deployment:

- Set `NODE_ENV=production`, `ADMIN_PASSWORD` (14+ characters), and a unique `SESSION_SECRET`.
- Serve it behind HTTPS.
- Replace the default in-memory Express session store with a persistent store suitable for your hosting environment.
- Add backups for `uploads/` and `data/resources.json`.
- Consider malware scanning, rate limits, CSRF protection, and a persistent database if the site will accept substantial public traffic.
- Deploy to a host that supports persistent disk storage. Ephemeral serverless storage can lose uploaded files when instances are replaced.

## Customization

- Main page content: `public/index.html`
- Styles and responsive breakpoints: `public/styles.css`
- Search, filters, upload modal, and API calls: `public/app.js`
- API and storage: `server.js`

The site brand is **KPH — Khalil's Play House**. The entry animation is shown once in each fresh browser tab/session. Visitors can browse and download, but the server only accepts uploads and deletions from an authenticated admin. Set your own strong `ADMIN_PASSWORD` and `SESSION_SECRET` in `.env` before using it beyond your computer.
