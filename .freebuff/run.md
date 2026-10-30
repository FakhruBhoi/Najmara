# NAJMARA — run doc

Static site: plain HTML, CSS and vanilla JavaScript. **No package.json, no
lockfile, no framework, no npm install.** The only tooling is Python scripts
for asset prep and tests run on plain Node.

## 1. Reproducing artifacts

A fresh checkout already contains everything the site needs — the prepared
images live in `assets/` and are checked in. Regenerate them only when the
company-profile PDF changes:

```bash
python3 -m venv .venv                       # one-off
.venv/bin/pip install pypdf pillow           # asset-prep dependencies
.venv/bin/python scripts/prep_assets.py      # crops/resizes assets/*.jpg|png + logos
```

Optional deploy bundle (used only by `sites_deploy`):

```bash
.venv/bin/python scripts/build_public.py     # writes public/ (40 files, ~3.2 MiB)
```

Endpoint tests (no framework):

```bash
node scripts/test-worker.mjs                 # 21 assertions on worker.js
```

## 2. Running the server

Serve the repository root so the folder routes `/about`, `/services`,
`/track-record`, `/contact` resolve to their `index.html`:

```bash
python3 -m http.server 3000 --bind 0.0.0.0
```

- Port **3000** (default for this workspace; it is not an npm project, so there
  is no `npm run dev` to follow).
- Bind `0.0.0.0` so the preview hostname can reach it; probe with
  `curl -H "Host: pv-c519f0cc1cc1-26279bad-f743-409d-b99e-a777ada7e972.style.dev" http://127.0.0.1:3000/`.
- Log to `server.log` in the repo root.

Serving the root (not `public/`) is deliberate: `public/` is build output and
has no `.venv`, `.gitignore` or scripts.

## Notes

- `POST /api/enquiry` returns **501** under this plain static server — the
  endpoint only exists once `worker.js` is deployed. The form detects this and
  says so instead of faking a success.
- Environment for the endpoint (`MAILJET_API_KEY`, `MAILJET_SECRET_KEY`,
  `ENQUIRY_TO`, `ENQUIRY_FROM`) belongs in Sites → Secrets, never in files.
