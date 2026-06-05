import "server-only";

import { Client, Receiver } from "@upstash/qstash";
import { getConfiguredStorageBackend } from "./storage";

function configuredQstashToken() {
  return process.env.QSTASH_TOKEN;
}

function currentSigningKey() {
  return process.env.QSTASH_CURRENT_SIGNING_KEY;
}

function nextSigningKey() {
  return process.env.QSTASH_NEXT_SIGNING_KEY;
}

export function isQstashConfigured() {
  return Boolean(configuredQstashToken());
}

export function isWorkerQueueRequired() {
  return process.env.VERCEL === "1" || getConfiguredStorageBackend() === "redis";
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

export function resolveAppBaseUrl(request: Request) {
  const configured = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (configured) {
    const normalized = configured.startsWith("http") ? configured : `https://${configured}`;
    return trimTrailingSlash(normalized);
  }

  const url = new URL(request.url);
  const proto = request.headers.get("x-forwarded-proto") || url.protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || url.host;
  return trimTrailingSlash(`${proto}://${host}`);
}

function createQstashClient() {
  const token = configuredQstashToken();
  if (!token) {
    throw new Error("QStash is not configured.");
  }
  return new Client({ token });
}

function createReceiver() {
  return new Receiver({
    currentSigningKey: currentSigningKey(),
    nextSigningKey: nextSigningKey(),
    devMode: process.env.NODE_ENV !== "production",
  });
}

export async function enqueueLabRun(request: Request, runId: string) {
  const client = createQstashClient();
  const baseUrl = resolveAppBaseUrl(request);
  await client.publishJSON({
    url: `${baseUrl}/api/lab/worker`,
    body: { runId },
  });
}

export async function verifyWorkerRequest(request: Request, body: string) {
  const signature = request.headers.get("upstash-signature");
  if (!signature) {
    return false;
  }

  return createReceiver().verify({
    signature,
    body,
    url: request.url,
  });
}
