# vcard-maker

Digital visiting card generator, hosted on GitHub Pages:
https://tarun1009200.github.io/vcard-maker/

Published cards live in a separate repository, [my-vcard](https://github.com/tarun1009200/my-vcard), one folder per card:
`https://tarun1009200.github.io/my-vcard/cards/<card-id>/`

## How publishing works

```
generator (GitHub Pages) ──Session──▶ vcard-publisher (Vercel) ──GitHub token──▶ my-vcard repo ──Actions──▶ GitHub Pages
```

1. Fill in the form (Step 2). Inputs are validated and the phone preview updates live.
2. **Sign in with GitHub** (Step 3) opens a popup on the publishing server. The server signs in with the
   `vcard-publisher-tarun1009200` GitHub App and returns an encrypted session. The GitHub token stays inside that
   encrypted session; the page keeps the session in memory only (reloading the page signs out).
3. **Generate Card** sends the Git Data API calls through the server, which only forwards them for allowed users,
   only to `my-vcard`, only to `main` without force, and only for these files:
   `cards.json` and `cards/<id>/{index.html, contact.vcf, card.json, assets/style.css, assets/card.js, assets/photo.jpg, assets/logo.png}`.
   One commit writes the card folder and the `cards.json` registry.
4. The `Deploy cards to GitHub Pages` workflow in `my-vcard` checks every card (missing files, broken links,
   invalid vCards, duplicate ids) and deploys. The generator shows **Published** only once the new version is live.

Card ids are URL-safe slugs of the name (`rahul-sharma`). A taken id gets a number (`rahul-sharma-2`).
Editing a published card keeps its id, so its link and QR code stay the same.

Everything in `my-vcard` is public, including the git history of deleted or deactivated cards.

A fine-grained token can still be used instead of signing in (Step 3 → Advanced).

## Publishing server (`vcard-publisher/`)

Deployed to Vercel as https://vcard-publisher.vercel.app (`api/login`, `api/callback`, `api/gh/*`, `api/health`).

Environment variables (Vercel → Project → Settings → Environment Variables):

| Name | Value |
| --- | --- |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | OAuth credentials of the GitHub App |
| `SESSION_SECRET` | Random string, at least 32 characters, encrypts sessions |
| `CARD_OWNER`, `CARD_REPO` | `tarun1009200`, `my-vcard` |
| `ALLOWED_USERS` | Comma-separated GitHub logins allowed to publish |
| `ALLOWED_ORIGIN` | `https://tarun1009200.github.io` |

Set up from scratch:

1. `cd vcard-publisher && npx vercel login && npx vercel deploy --prod`
2. `node scripts/create-github-app.mjs https://<project>.vercel.app` creates the GitHub App with GitHub's manifest
   flow and stores its credentials in Vercel. Then install the app on `my-vcard` only.
3. `npx vercel deploy --prod` again so the new variables take effect, and set `PUBLISH_API` in `manager.js`.

## Tests

- `node tests/run-tests.js` — card builder, validation and publisher against a fake GitHub API
- `node vcard-publisher/test/run-tests.js` — sessions, sign-in, the proxy allowlist, and publishing through the proxy

## Files

| File | Purpose |
| --- | --- |
| `index.html`, `generator.css` | Generator page |
| `generator.js` | Form, live preview, templates, drafts, ZIP export, QR step wiring |
| `card-template.js` | Card templates, vCard builder, validation |
| `qr-designer.js` | QR code styling and frames |
| `publisher.js` | GitHub API client and publish / edit / deactivate / delete |
| `publish-kit.js` | Workflow and card checker added to `my-vcard` |
| `manager.js` | Sign-in, Generate Card states and the published cards dashboard |
| `vcard-publisher/` | Vercel publishing server |
