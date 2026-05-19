import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/crypto";
import { prisma } from "@/lib/db/prisma";
import {
  handleInstallationEvent,
  handleInstallationRepositoriesEvent,
  handlePushEvent,
  handlePullRequestEvent,
} from "@/lib/github";
import type {
  InstallationWebhookPayload,
  InstallationRepositoriesPayload,
  PushWebhookPayload,
  PullRequestWebhookPayload,
} from "@/types/github";

/**
 * POST /api/webhooks/github
 *
 * GitHub posts every webhook here. The flow:
 *   1. Read raw body (NOT JSON.parse'd — signature is computed over bytes).
 *   2. Verify X-Hub-Signature-256.
 *   3. Idempotency: dedupe on X-GitHub-Delivery.
 *   4. Dispatch by X-GitHub-Event.
 *   5. ALWAYS respond fast (≤10s GitHub timeout). If a handler does heavy
 *      work, push it onto a queue and ack immediately.
 *
 * What this route is INTENTIONALLY missing
 * ----------------------------------------
 * - CSRF: GitHub isn't a browser; CSRF doesn't apply. Auth is HMAC.
 * - Rate limit: GitHub controls our incoming volume; rate-limiting our own
 *   webhook would just drop legitimate events.
 * - Session: there's no app user; the event identifies which installation
 *   it concerns.
 *
 * Why we return 200 even on dedupe / unknown events
 * -------------------------------------------------
 * Non-2xx makes GitHub retry. If we return 500 on an event we don't know
 * how to handle, GitHub will keep retrying forever. Ack and move on.
 */

export const runtime = "nodejs";

// Disable Next's default body parsing so we get the RAW bytes for HMAC.
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // ---- 1. Read raw body ----
  // req.text() returns the body as a UTF-8 string before any parsing.
  // This is what we hash. JSON.parse comes later, after verification.
  const rawBody = await req.text();

  // ---- 2. Verify signature ----
  const sig = req.headers.get("x-hub-signature-256");
  if (!verifyWebhookSignature(rawBody, sig)) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  // ---- 3. Read event metadata ----
  const event = req.headers.get("x-github-event") ?? "";
  const deliveryId = req.headers.get("x-github-delivery") ?? "";

  if (!event || !deliveryId) {
    return new NextResponse("Missing GitHub headers", { status: 400 });
  }

  // ping is GitHub's "I configured a webhook, does it work?" probe.
  if (event === "ping") {
    return NextResponse.json({ ok: true, pong: true });
  }

  // ---- 4. Dedupe ----
  // Try to insert a delivery row first; if it conflicts on unique key, this
  // is a replay — ack and skip processing.
  try {
    await prisma.webhookDelivery.create({
      data: { deliveryId, event },
    });
  } catch {
    // Most likely cause: duplicate deliveryId. Either way, don't reprocess.
    return NextResponse.json({ ok: true, deduped: true });
  }

  // ---- 5. Parse + dispatch ----
  // We parse AFTER signature verification — never trust input you haven't
  // authenticated.
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 });
  }

  try {
    switch (event) {
      case "installation":
        await handleInstallationEvent(payload as InstallationWebhookPayload);
        break;

      case "installation_repositories":
        await handleInstallationRepositoriesEvent(
          payload as InstallationRepositoriesPayload,
        );
        break;

      case "push":
        await handlePushEvent(payload as PushWebhookPayload);
        break;

      case "pull_request":
        await handlePullRequestEvent(payload as PullRequestWebhookPayload);
        break;

      default:
        // Unknown event — ack so GitHub doesn't retry. Log for visibility.
        console.info(`[webhook] unhandled event: ${event}`);
    }

    // Update action on the delivery row for debugging / audit.
    const action =
      payload && typeof payload === "object" && "action" in payload
        ? String((payload as { action?: unknown }).action ?? "")
        : null;
    if (action) {
      await prisma.webhookDelivery
        .update({ where: { deliveryId }, data: { action } })
        .catch(() => {
          /* non-critical */
        });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    // We've already recorded the delivery, so a retry would be deduped.
    // Log the failure but still ack — alternative is to delete the dedupe
    // row, but then a malformed payload would retry forever. Better to
    // surface failures in your own logging.
    console.error(`[webhook] handler failed for ${event}`, err);
    return NextResponse.json({ ok: true, handlerError: true });
  }
}