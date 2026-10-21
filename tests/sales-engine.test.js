import { describe, expect, it } from "vitest";
import {
  classifyCheckoutSession,
  getEventPaymentIntentId,
  isPaidCheckoutEvent,
  isUuid,
} from "../lib/sales-engine.js";

const userId = "f7e2cf4f-0bf2-4f56-a0da-62c7fc95e16f";

describe("Stripe commercial event classification", () => {
  it("processes completed sessions only when payment_status is paid", () => {
    expect(isPaidCheckoutEvent({
      type: "checkout.session.completed",
      data: { object: { payment_status: "paid" } },
    })).toBe(true);

    expect(isPaidCheckoutEvent({
      type: "checkout.session.completed",
      data: { object: { payment_status: "unpaid" } },
    })).toBe(false);
  });

  it("accepts the asynchronous payment success event", () => {
    expect(isPaidCheckoutEvent({
      type: "checkout.session.async_payment_succeeded",
      data: { object: { payment_status: "paid" } },
    })).toBe(true);
  });

  it("routes a correctly bound MAGIS plan checkout to credit fulfillment", () => {
    expect(classifyCheckoutSession({
      client_reference_id: userId,
      metadata: { user_id: userId, plan_code: "starter" },
    })).toEqual({ kind: "credits", planCode: "starter", userId });
  });

  it("routes a Payment Link without plan metadata into the sales ledger path", () => {
    expect(classifyCheckoutSession({
      payment_link: "plink_test_123",
      metadata: {},
    })).toEqual({ kind: "payment_link", paymentLinkId: "plink_test_123" });
  });

  it("does not grant credits when client_reference_id conflicts with metadata", () => {
    expect(classifyCheckoutSession({
      client_reference_id: "d7a4f7a2-997f-4d4f-ae91-2d6192c4d09b",
      metadata: { user_id: userId, plan_code: "starter" },
      payment_link: "plink_test_123",
    })).toEqual({ kind: "review", reason: "credit_identity_mismatch" });
  });

  it("queues incomplete credit metadata for review rather than treating it as granted", () => {
    expect(classifyCheckoutSession({
      metadata: { plan_code: "starter" },
      payment_link: null,
    })).toEqual({ kind: "review", reason: "incomplete_credit_metadata" });
  });

  it("captures paid sessions without product mapping for review", () => {
    expect(classifyCheckoutSession({ metadata: {}, payment_link: null }))
      .toEqual({ kind: "review", reason: "unmapped_paid_checkout" });
  });

  it("validates UUID-shaped user identifiers before database calls", () => {
    expect(isUuid(userId)).toBe(true);
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid(null)).toBe(false);
  });

  it("extracts a PaymentIntent from either string or expanded-object form", () => {
    expect(getEventPaymentIntentId({ payment_intent: "pi_test_1" })).toBe("pi_test_1");
    expect(getEventPaymentIntentId({ payment_intent: { id: "pi_test_2" } })).toBe("pi_test_2");
    expect(getEventPaymentIntentId({ payment_intent: null })).toBeNull();
  });
});
