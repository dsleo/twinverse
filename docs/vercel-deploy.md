# Vercel Hobby Deployment Notes

This branch contains the backend changes needed to make `/lab` and `/lab/figaro` compatible with Vercel Hobby by:

- replacing local filesystem persistence with an env-driven storage adapter,
- supporting Upstash Redis for durable run and cache storage,
- adding a QStash-backed worker flow for background Lab execution,
- preserving the current browser polling UX.

## What Was Implemented

- `src/server/lab/storage.ts`
  - `LabStorage` abstraction
  - file-backed storage for local development
  - Redis-backed storage for Vercel
- `src/server/lab/persistence.ts`
  - facade kept compatible with the existing pipeline
- `src/server/lab/dailyQuestion.ts`
  - daily question cache moved behind storage
- `src/server/lab/personaSample.ts`
  - persona cache moved behind storage
- `src/server/lab/qstash.ts`
  - QStash enqueueing and worker request verification
- `src/app/api/lab/runs/route.ts`
  - enqueues background work when QStash is configured
- `src/app/api/lab/worker/route.ts`
  - verified worker endpoint that executes runs idempotently

## Required Environment Variables

These values are not handwritten. They come from your Upstash and Vercel integration.

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `QSTASH_TOKEN`
- `QSTASH_CURRENT_SIGNING_KEY`
- `QSTASH_NEXT_SIGNING_KEY`
- `APP_BASE_URL`

Example:

```env
UPSTASH_REDIS_REST_URL=https://...upstash.io
UPSTASH_REDIS_REST_TOKEN=...
QSTASH_TOKEN=...
QSTASH_CURRENT_SIGNING_KEY=...
QSTASH_NEXT_SIGNING_KEY=...
APP_BASE_URL=https://your-project.vercel.app
```

## Where To Get Them

1. In Vercel, install the Upstash integration for the project.
2. Connect an Upstash Redis database.
3. Connect an Upstash QStash resource.
4. Open `Project Settings -> Environment Variables` in Vercel.
5. Confirm the Redis and QStash variables are present.
6. Set `APP_BASE_URL` manually to the production URL or custom domain.
7. Redeploy the project after adding the variables.

## Notes

- Local development still works without Upstash and continues to use file storage.
- On Vercel-like Redis mode, the app now fails fast if the worker queue is not configured.
- If you postpone this rollout, this branch is the place to resume from later.

## References

- [Vercel Marketplace: Upstash](https://vercel.com/marketplace/upstash)
- [Upstash Vercel integration docs](https://upstash.com/docs/redis/howto/vercelintegration)
