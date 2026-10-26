# vcard-maker

Digital visiting card generator. It runs entirely in the browser and is hosted on GitHub Pages:
https://tarun1009200.github.io/vcard-maker/

Published cards live in a separate repository, [my-vcard](https://github.com/tarun1009200/my-vcard), one folder per card:
`https://tarun1009200.github.io/my-vcard/cards/<card-id>/`

## How publishing works

1. Fill in the form (Step 2). Inputs are validated and the phone preview updates live.
2. Connect GitHub with a fine-grained token (Step 3). The token is typed into the page and kept only in your browser.
   It is never written to code, the repository or a QR code.
3. **Generate Card** makes one commit in `my-vcard`:
   - `cards/<id>/index.html`, `contact.vcf`, `card.json`, `assets/` (style, script, photo, logo)
   - `cards.json`, the registry of all cards
4. The `Deploy cards to GitHub Pages` workflow in `my-vcard` checks every card (missing files, broken links,
   invalid vCards, duplicate ids) and deploys the site. The generator waits until the new version is live.

Card ids are URL-safe slugs of the name (`rahul-sharma`). A taken id gets a number (`rahul-sharma-2`).
Editing a published card keeps its id, so its link and QR code stay the same.

Everything in `my-vcard` is public, including the git history of deleted or deactivated cards.

## One-time setup

1. Create a fine-grained token at https://github.com/settings/personal-access-tokens/new
   - Repository access: only `my-vcard`
   - Permissions: Contents (read and write), Workflows (read and write), Pages (read-only)
2. Open the generator, paste the token, click **Connect**, then **Set up repository** if it is offered.
3. In `my-vcard` → Settings → Pages, set **Source** to **GitHub Actions**.

## Files

| File | Purpose |
| --- | --- |
| `index.html`, `generator.css` | Generator page |
| `generator.js` | Form, live preview, templates, drafts, ZIP export, QR step wiring |
| `card-template.js` | Card templates, vCard builder, validation |
| `qr-designer.js` | QR code styling and frames |
| `publisher.js` | GitHub API client and publish / edit / deactivate / delete |
| `publish-kit.js` | Workflow and card checker added to `my-vcard` |
| `manager.js` | GitHub connection, Generate Card and the published cards dashboard |
| `tests/run-tests.js` | Tests against a fake GitHub API: `node tests/run-tests.js` |
