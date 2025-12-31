# Thor

Thor is an Astro + Tailwind single-page report flow that lets users share an
optional location, phone number, and message. Submissions hit `/api/report`,
which can forward the report to Discord when configured.

## Getting started

```sh
pnpm install
pnpm dev
```

Visit `http://localhost:4321`.

## Environment variables

Create a local `.env` (see `.env.example`) to enable Discord delivery:

```env
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
```

If `DISCORD_WEBHOOK_URL` is unset, the API route still responds but skips the
Discord call.

## Commands

| Command         | Action                                       |
| :-------------- | :------------------------------------------- |
| `pnpm dev`      | Start the local dev server                   |
| `pnpm build`    | Build the production site to `./dist/`       |
| `pnpm preview`  | Preview the production build                 |
| `pnpm astro ...`| Run Astro CLI commands                       |

## Public repo safety

- Secrets are read from `.env`, which is gitignored; never commit real values.
- Rotate any Discord webhook that was ever exposed in a repo or chat.
- Share `.env.example` instead of real credentials.
