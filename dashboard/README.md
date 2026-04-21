This is a [Next.js](https://nextjs.org) project bootstrapped with `[create-next-app](https://nextjs.org/docs/app/api-reference/cli/create-next-app)`.

## Getting Started

From the **repository root**, `muffs-agent` starts Next.js on **http://localhost:3141** (and the FastAPI agent on 8141). See the root `README.md`.

To run **only** the dashboard (when the Python agent runs elsewhere):

```bash
npm run dev -- -p 3141
```

Ensure `PYTHON_AGENT_URL` in `.env` points at the agent (default with `muffs-agent`: `http://127.0.0.1:8141`).

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses `[next/font](https://nextjs.org/docs/app/building-your-application/optimizing/fonts)` to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.