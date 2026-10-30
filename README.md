# NAJMARA — Corporate Website

Luxury editorial × heavy-industry corporate site for NAJMARA
("Data centres powered. Facilities maintained. Sites built. Materials supplied."),
Kingdom of Saudi Arabia.

Plain HTML, CSS and vanilla JavaScript. No build step, no frameworks, no runtime
dependencies — open `index.html` or serve the folder with any static server.

## Structure

```
index.html              Home — 420vh scroll track, sticky cinematic hero, pillars, marquee
about/index.html        Vision, mission, values, 5-step delivery methodology
services/index.html     Capabilities hub — four pillars with interactive spec tabs
track-record/index.html Client logo grid, client marquee, field operations
contact/index.html      Enquiry form + direct contact panel
worker.js               Enquiry endpoint (Cloudflare Worker) → Mailjet Send API v3.1
freebuff.manifest.json  Deploy manifest: worker + public/ assets
assets/css/main.css     Design tokens, layout system, components, responsive rules
assets/js/main.js       Nav, mobile menu, scroll reveals, 3D tilt, tabs, form submit
assets/js/hero.js       Landing motion engine: looping canvas clip + scroll progress
assets/*.jpg|png        Prepared imagery and client logos
scripts/                Asset prep, public build, worker tests
```

Routes are folder-based, so a static server resolves `/about`, `/services`,
`/track-record` and `/contact` to their `index.html`.

## Design tokens

| Token | Value | Use |
| --- | --- | --- |
| Obsidian Dark | `#121312` | Base background |
| Deep Burgundy | `#590907` | Primary CTAs, diagonal slices, active indicators |
| Muted Sage Grey | `#A5A79B` | Glass borders, secondary labels |
| Warm Cream Beige | `#E8D2B5` | Luxury headings, highlights, accents |
| Ink | `#F4F6FA` @ 72% / 46% | Body / secondary text |
| Hairlines | white or sage @ 22% | Rules and card edges |

Fonts: Syne (display), Inter Tight (UI/nav), Inter (body), loaded from Google Fonts.

## Landing motion engine

* 420vh track with a sticky 100vh scene; background is a looping canvas clip
  (cross-dissolve + slow Ken Burns across four frames).
* Scene shade: obsidian at 55% fading out by 34% from the top, 50% fading out by
  30% from the bottom.
* Progress `p = (scrollY − track.top) / (track.height − innerHeight)`, clamped 0–1.
* Headline: `translateY` + `rotateX` about its bottom edge over `p 0 → 0.38`;
  opacity 1 → 0 between `p .10` and `.24`.
* Four-step process list activates at `p .26 / .34 / .42 / .50`.
* Honours `prefers-reduced-motion` (static frame, no reveal transitions).

## Imagery

Photography and client logos are taken from the attached NAJMARA company profile
PDF, cropped and normalised by `scripts/prep_assets.py` (requires `pypdf` and
`pillow`, e.g. in a local virtualenv).

## Enquiry endpoint

The contact form POSTs JSON to `POST /api/enquiry` (set on the form's
`data-endpoint` — point it at any URL that accepts a JSON POST instead).
`worker.js` validates the payload, drops honeypot hits, rate-limits repeat
submissions, and delivers the enquiry to an inbox through the Mailjet Send API
v3.1. Every other request falls through to the static assets.

Environment (Sites → Secrets, never in code):

| Variable | Required | Purpose |
| --- | --- | --- |
| `MAILJET_API_KEY` | yes | Mailjet API (public) key |
| `MAILJET_SECRET_KEY` | yes | Mailjet secret key |
| `ENQUIRY_TO` | yes | Inbox receiving enquiries (comma separated for several) |
| `ENQUIRY_FROM` | yes | Sender address — must be verified in Mailjet |
| `ENQUIRY_FROM_NAME` | no | Sender name, default “NAJMARA Website” |
| `ENQUIRY_CC` | no | Extra inbox(es) |

Until those are set the endpoint answers `503` and the form shows a clear
“not configured” message rather than a false success. In a plain static preview
the endpoint answers `404/405/501` and the form says the API is not running
yet.

Tests and build:

```bash
node scripts/test-worker.mjs        # 21 assertions on the endpoint
python3 scripts/build_public.py     # assemble public/ (40 files, ~3.2 MiB)
```## Known placeholders

Contact details in the company profile are marked *to be confirmed* — address,
phone, email and website are shown as such on the Contact page and in the
footer. The enquiry form needs Mailjet credentials plus a deployment before it
delivers real mail.
