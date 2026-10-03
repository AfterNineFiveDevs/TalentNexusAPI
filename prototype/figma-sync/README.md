# TalentNexus Figma sync

Rebuilds the whole TalentNexus design in a new Figma file in **9 `use_figma` calls**. The source is the Claude
design canvas (58 boards), so Figma, the canvas and this prototype stay in step.

The scripts are ready, but they can't run yet. The Figma account they are meant for (myatthirikhin1998) has used
its Starter-plan allowance of about 20 MCP calls a month, and needs to wait for the reset.

## What gets built

| Call | File | Builds |
| --- | --- | --- |
| 1 | `dist/01-foundations.js` | "TalentNexus" variable collection: 17 colours, 7 spacing, 3 radius and the touch target, plus the 7 `type/*` text styles in Inter |
| 2 | `dist/02-foundations-components.js` | Foundations page: design system key and production states, plus the Button, Chip, Evidence row and Nav components |
| 3–4 | `dist/03-mobile-*.js` | Candidate mobile: 21 screens |
| 5–7 | `dist/05-web-*.js` … `07` | Candidate web: 25 screens, including account and the 7-day trial |
| 8 | `dist/08-admin.js` | Admin console: 6 screens |
| 9 | `dist/09-employer.js` | Employer (Phase 3): 4 screens |

Every colour is bound to a variable and every text uses a text style, so changing a token in Figma updates every screen.

## Run it, once the limit resets

1. In Claude Code, run `/mcp`, choose **figma**, and sign in as **myatthirikhin1998@gmail.com**.
2. Ask Claude: *"Create a Figma file called TalentNexus and run prototype/figma-sync/dist in order."*
   - Creating the file doesn't count against the limit.
   - Each `dist/*.js` file is sent as one `use_figma` call, in number order.
3. Each call returns the ids it created and any errors. If one fails, re-run only that file. The renderer adds frames
   to the right of what is already on the page.

## When the design changes

```bash
# 1. regenerate the layout specs from the canvas boards (a copy of the canvas project folder)
python3 convert_canvas.py /path/to/canvas/project
# 2. repack the calls and syntax-check every one
node build.mjs
```

| File | Purpose |
| --- | --- |
| `convert_canvas.py` | Turns each canvas board (`.dc.html`, inline flex and grid markup) into a compact layout spec |
| `pages.json` | Which board goes on which Figma page, in order |
| `specs/*.json` | Generated layout specs, one per Figma page |
| `kit.js` | Runs inside Figma: renders specs as auto-layout frames bound to the TalentNexus variables and text styles |
| `01-foundations.js`, `02-components.js` | Tokens, text styles and components |
| `build.mjs` | Packs `kit.js` with the specs into `dist/`, keeps each under 48,000 characters, and syntax-checks each |

## Import without the MCP limit: html.to.design

The prototype is published at **https://afterninefivedevs.github.io/TalentNexusAPI/prototype/**.

1. In Figma, open **Plugins → html.to.design**.
2. Paste a screen URL, for example `https://afterninefivedevs.github.io/TalentNexusAPI/prototype/jobs/job-detail.html`.
3. Pick a viewport: Desktop 1280 or Mobile 360. Then import.

This makes editable layers, but not ones bound to the TalentNexus variables, so use it for quick reviews.
`dist/` is the version to keep. Check the plugin's free-plan import limit before relying on it.
