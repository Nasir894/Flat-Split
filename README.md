# Flat Split

Track shared flat spending, transfers between flatmates and rice turns. Next.js 16 + shadcn/ui, Neon Postgres, installable as an app (PWA) with push notifications.

## How money works

- An expense has a payer and a set of consumers (everyone by default). The amount is split equally between consumers (leftover poisha go to the first few, so totals always match exactly).
- **Balance = paid − consumed + transfers sent − transfers received.** Positive means the flat owes you, negative means you owe.
  - Example: A pays ৳200 for chicken that A, B, C and D eat → A +150, B/C/D −50 each.
- A transfer (A hands B money) raises A's balance and lowers B's, but only once **B confirms** they received it. Until then it shows as pending, and a declined transfer never counts. If B records the transfer themselves, it counts immediately. Editing a transfer sends it back for confirmation. The Home screen suggests the fewest transfers that settle everyone.

## House chat

A simple group chat for members: text and emoji only, with no photos, videos or files. Tap a message to react (👍 ❤️ 😂 😮 😢 🙏 🔥 🎉; one reaction per person; double-tap for ❤️). You see when someone is typing. Members can delete their own messages. Everyone gets a push notification for new messages, and authors are notified of reactions.

## Rice rules

Separate from money. When a cycle starts, everyone's owed count goes +1, and each gift of rice is −1. If someone who already gave this cycle (and owes ≤ 0) gives again, that gift starts a new cycle. Everyone gets +1, then their gift counts toward it. Anyone who didn't give before a cycle ended is marked as having skipped it. Everything is replayed from the log, so edits and deletes stay consistent.

## Security & history

- Each member signs in with their own 4-digit PIN (scrypt, peppered with `SESSION_SECRET`). 5 wrong tries lock the account for 15 minutes. The app asks for the PIN again when reopened or after 2 minutes in the background.
- **Creating the house:** the first person to open the app creates the house and chooses its **house code**. Any member can view, copy or change it in Settings, and changes are logged.
- **Joining:** a newcomer enters the house code, their name and a PIN. That only sends a **join request**: everyone in the house is notified, and any member must approve it from the Home screen. The members list shows who added whom. House-code guesses are rate-limited.
- **Forgot PIN:** on the sign-in screen, tap your name → "Forgot PIN?".
  - **With your recovery code:** enter it and choose a new PIN. Everyone gets a one-time code at sign-up, and can make a new one in Settings.
  - **Lost the code too:** any other flatmate taps **Settings → Members → Approve PIN reset**. For 24 hours you can then set a new PIN using the house code.
  - Every reset and approval is logged and notified to everyone. Recovery attempts are rate-limited.
- Every write runs in a Postgres transaction together with its audit entry. Edits use version checks, so two people can't silently overwrite each other.
- The `audit_log` table is append-only, and records can't be hard-deleted. Both are enforced by database triggers. Deleting only greys an entry out, and it can be restored.
- JSON backups never contain PIN or recovery hashes. After a restore on a fresh database, a restored member taps their name and sets a new PIN once a flatmate approves the reset.

## Local development

```bash
cp .env.example .env.local      # fill in values
node --env-file=.env.local scripts/migrate.mjs   # create tables (safe to re-run)
npm run dev
```

Push notifications need HTTPS: use `npx next dev --experimental-https` locally.

## Deploy to Vercel

1. Push this folder to a GitHub repo and import it in Vercel (or run `npx vercel` here after `npx vercel login`).
2. Add the variables from `.env.example` in **Project → Settings → Environment Variables**.
3. Set **Functions region** to `sin1` (Singapore, same as the Neon database) for the fastest responses.
4. Deploy, then set `VAPID_SUBJECT` to your real URL.

On iPhone, notifications only work after **Share → Add to Home Screen** (iOS 16.4+).
