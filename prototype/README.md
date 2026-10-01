# CareerNexus HTML prototype

A clickable prototype of every CareerNexus flow, from the first visit to production states, for web and mobile.
It is plain HTML, CSS and a little JavaScript. There is no build step and nothing to install.

It is **not** part of the API. `nest build` only compiles `src/`, so this folder never ships.

## Open it

Open `prototype/index.html` in a browser, or serve the folder:

```bash
cd prototype
python3 -m http.server 4173
# then open http://localhost:4173
```

`index.html` is the flow map. Pick a step on the left, and switch the preview between **Desktop** and **Mobile 360**.
The screens are responsive, so on a phone you can open any of them directly.

## What's in it

| Folder | Screens |
| --- | --- |
| `public/` | Landing, sign up, sign in, forgot and reset password, verify email |
| `onboarding/` | Upload a CV, LinkedIn import, check what we found |
| `profile/` | Career Profile, section editor |
| `cv/` | My CVs, CV editor with AI suggestions, templates, quality and ATS checks, preview and export, tailor to a job (premium) |
| `jobs/` | Job search with all 10 BRD filters, job detail with match and report dialog, saved jobs |
| `account/` | Sharing and privacy, account settings, plans, 7-day trial (start, reminder, ended), checkout placeholder |
| `admin/` | Job moderation, reports, verification, users, subscriptions and trials, analytics (web only) |
| `recruiter/` | Phase 3 employer flow: verify company, post a job, applicants, find candidates (web first) |
| `states/` | Loading, long task, empty, error, offline, closed job, 404, signed out, toast |

38 screens in total.

## What's real and what's fake

- **Real:** the sign-up form uses the exact fields, rules and error messages from
  `TalentNexusContract/src/auth.ts` (`signupRequestSchema`). Roles match `src/enum.ts`
  (Admin, Talent, Recruiter).
- **Fake:** nothing calls the API. State such as saved jobs, the trial, and whether the share link is on
  lives in your browser's `localStorage` under `careernexus-prototype`.
- **Prototype panel** (bottom left): simulate trial day 0, 5 or 8, reset everything, or jump back to the flow map.
- **Placeholders** in `[square brackets]` are decisions the BRD leaves open (§27): price, billing terms,
  verification evidence, LinkedIn import route, KPI targets.

## Design tokens and shadcn/ui

`assets/tokens.css` copies the Figma file's variables and text styles. Its first block uses
**shadcn/ui variable names**, so when the production React and Tailwind app is built you can install shadcn
and paste this block in as the theme:

| shadcn variable | CareerNexus token | Value |
| --- | --- | --- |
| `--background` | color/paper-2 | `#f4f6f8` |
| `--foreground` | color/ink | `#141a1f` |
| `--card` | color/paper | `#ffffff` |
| `--primary` | color/accent | `#1b5e8c` |
| `--muted` | color/neutral-soft | `#edeff2` |
| `--muted-foreground` | color/ink-2 | `#4a5560` |
| `--accent` | color/accent-soft | `#e7f0f6` |
| `--destructive` | color/stop | `#8c2f2f` |
| `--border` | color/line | `#d9dfe5` |
| `--input` | color/line-2 | `#b4bec8` |
| `--ring` | color/accent | `#1b5e8c` |
| `--radius` | radius/md | `10px` |

shadcn has no slot for CareerNexus's evidence states, so these stay as our own variables:
`--good`, `--warn`, `--neutral` (for "not stated in this ad") and their `-soft` versions.

## Rules the screens follow

- CV quality, ATS compatibility and job match are three separate containers and never one number (BRULE-004).
- Match evidence has three states, and "not stated" is never counted as a gap (BRULE-016).
- AI text is marked "Suggested, not your words" until accepted. The AI asks for numbers instead of inventing them (BR-AI-006/007).
- PDF export is free on every plan, including after the trial (BRULE-006).
- The premium trial is opt-in, one per account, visible on every screen while it runs, and nothing made during it is taken away (BR-MON-004, BRULE-018).
