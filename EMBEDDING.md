# Deploying Ticketleo Support live

This is the deployment checklist for taking the site from "running on my laptop" to "live on the internet." See `README.md` for how the project itself works — this doc is just the path to production.

## Overview

`server.js` serves two things from one deployment: the standalone full-page site (`index.html`) and the embeddable popup widget (`widget.js`) — see "Embeddable widget" in `README.md`. Going live means:

1. Deploy `server.js` (and everything alongside it) to a host that runs Node 24/7.
2. Point a domain — e.g. `support.ticketleo.co` — at that deployment.
3. Either link to that domain directly (the full-page site), or add `<script src="https://support.ticketleo.co/widget.js"></script>` to pages on the real ticketleo.co site (the popup bubble), or both.

There's no separate hosting step for the widget — it's served by the same deployment as the full-page site.

## Step 1: Pick a host

Any host that can run a small Node/Express app and keep it running 24/7 works. A few reasonable options:

- **Render** — easiest to get started with, free tier available, deploys straight from a Git repo. Recommended if you haven't deployed a Node app before.
- **Railway** — similar to Render, also very quick to set up from a repo.
- **Fly.io** — a bit more configuration (a `fly.toml`), but cheap and fast once set up.
- **A VPS** (DigitalOcean, Linode, etc.) — full control, but you're responsible for keeping Node running (e.g. via `pm2` or a systemd service) and setting up HTTPS yourself.

### Quick-start on Render (recommended if unsure)

1. Push this project to a GitHub (or GitLab) repository. Make sure `.env` is **not** committed — `.gitignore` already excludes it, but double check before pushing since it currently holds a real API key.
2. In Render, click **New > Web Service** and connect that repository.
3. Set:
   - **Build command:** `npm install`
   - **Start command:** `npm start`
4. Under **Environment**, add:
   - `OPENAI_API_KEY` = your real key
   - `OPENAI_MODEL` = `gpt-5.6-terra` (or whichever you're using)
   - Leave `PORT` unset — Render sets this automatically and `server.js` already respects `process.env.PORT`.
5. Deploy. Render will give you a URL like `https://ticketleo-support.onrender.com` — that's your site's live address, and it's HTTPS by default.

(Railway and Fly.io follow the same shape: connect a repo, set the same two env vars, deploy, get a URL.)

## Step 2: Verify the deploy

Before pointing a real domain at it, check the deployed site directly:

- Open `https://your-app-url/api/health` — you should see `{"ok":true}`.
- Open `https://your-app-url/` and chat with it. If this works, the backend, OpenAI key, and knowledge base are all wired correctly.
- Open `https://your-app-url/demo.html` and try the popup bubble in the corner — same backend, so if the full-page site above works this should too, but it confirms `widget.js` itself is reachable and loading.

If any of these fail, fix it before moving on.

## Step 3: Point a domain at it

Add a custom domain (e.g. `support.ticketleo.co`) to your host's dashboard (Render/Railway/Fly.io all support this directly, with automatic HTTPS certs), then add the CNAME record your host gives you to Ticketleo's DNS. Once it propagates, link to that domain from the main ticketleo.co site (nav bar, footer, "Need help?" links on tour pages, etc.) — that's now the entire integration, no code changes required on the main site.

## Step 4: Test on the live domain

- Load the real domain and confirm the page renders and chats correctly.
- Send a few real questions — a date/city lookup, a refund question, something the agent should redirect to `hello@ticketleo.co`.
- Check on mobile as well as desktop.

## Before sending it real traffic

Two things from the README's "things to add before production" list matter most once this is public:

- **Rate limiting on `/api/chat`.** It's a public endpoint that spends real OpenAI credits on every call — without limits, anyone (or any bot) can hammer it. A simple per-IP throttle (e.g. the `express-rate-limit` package) is enough to start.
- **A usage limit/alert on the OpenAI account.** Set a monthly spending cap or alert threshold in the OpenAI dashboard so a traffic spike doesn't turn into a surprise bill.

Everything else in that README section (streaming, a live events data source, persisted conversation storage) is a nice-to-have, not a blocker for going live.

## Troubleshooting

- **Site doesn't load at all:** check the host's deploy logs for a crashed build/start (often a missing `OPENAI_API_KEY`), or a DNS issue if the custom domain doesn't resolve yet.
- **Page loads but chat doesn't respond:** open the browser's Network tab, send a message, and check the `/api/chat` request — a failed request there usually means the backend is down or the OpenAI key is missing/invalid on the host.
- **Answers seem outdated:** check `events.json`'s `lastUpdated` field, or check whether the daily refresh scheduled task actually ran — it only fires while the Cowork app is open (see the note under "Conversation logging"-adjacent sections of `README.md`).
