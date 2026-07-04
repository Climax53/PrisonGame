// ─────────────────────────────────────────────────────────────────────────────
// Payments — the storefront adapter boundary.
//
// This is the ONLY module allowed to talk about real money, and today it
// deliberately refuses to. purchaseCrownPack() is the single seam the UI
// calls; until a real storefront is wired in it returns an honest "the mint
// is not open yet" result. NOTHING in this file — or anywhere else in the
// app — may pretend to charge money, show a fake payment sheet, or grant
// crowns for an unverified "purchase".
//
// ── Wiring plan (when the storefront ships) ─────────────────────────────────
//
// The pack ids ("pouch" | "chest" | "vault", see store.ts CROWN_PACKS) map
// 1:1 to store-side product ids. The adapter's job per platform:
//
// iOS — StoreKit 2 via a Capacitor plugin (e.g. @capacitor-community/in-app-
// purchases or RevenueCat's capacitor plugin):
//   1. Product ids: "keep.crowns.pouch" etc., registered in App Store Connect
//      as CONSUMABLES.
//   2. Fetch products at store-sheet open (Product.products(for:)) so prices
//      display in the buyer's local currency — never hard-code "$1.99" once
//      live; CROWN_PACKS.priceUsd becomes a fallback label only.
//   3. purchase() → StoreKit 2 returns a VerificationResult. Do NOT trust
//      the client alone: send the signed transaction (JWS) to our backend,
//      verify the signature against Apple's keys, check bundle id, product
//      id, and that the transaction id has never been redeemed before
//      (replay protection), THEN grant crowns server-side or via a signed
//      grant the client applies.
//   4. Always call transaction.finish() only AFTER the grant is durably
//      recorded, so an app crash between purchase and grant re-delivers.
//
// Android — Google Play Billing (billing library ≥ 6) via the same plugin:
//   1. Same product ids as consumable in-app products in Play Console.
//   2. launchBillingFlow() → Purchase object. Verify the purchase token
//      server-side with the Play Developer API (purchases.products.get);
//      check purchaseState == PURCHASED and that the token is unconsumed.
//   3. Grant crowns, persist, THEN consumeAsync() — consuming before the
//      grant is durable can eat the player's money on a crash.
//   4. Handle PENDING purchases (slow payment methods): grant only on the
//      transition to PURCHASED, never on PENDING.
//
// Steam (desktop build) — Steamworks microtransactions (ISteamMicroTxn):
//   1. InitTxn/FinalizeTxn flow is server-driven: our backend calls
//      ISteamMicroTxn/InitTxn with the pack's price, Steam overlay confirms,
//      the client gets a callback, backend calls FinalizeTxn and only then
//      grants crowns. There is no client-side receipt at all.
//   2. Prices come from our backend config, not the client binary.
//
// Cross-cutting cautions:
//   • Receipt/token validation is SERVER-side in every case. A jailbroken
//     client that grants itself crowns only cheats itself (single-player),
//     but unverified grants corrupt refund handling and analytics.
//   • Refunds: on Apple/Google refund notifications, deduct the pack's
//     crowns (floor at 0); never claw back items already bought with them.
//   • Restore: crowns are consumables — nothing to restore. Owned themes /
//     wardens live in the profile and its native mirror.
//   • The adapter must stay async and failable; the UI already treats any
//     {ok:false} as a calm toast, never a blocking error.
// ─────────────────────────────────────────────────────────────────────────────

export interface PurchaseResult {
  ok: boolean;
  reason?: string;
}

/**
 * Attempt to buy a crown pack for real money. Stubbed until a storefront
 * exists: always declines, honestly. The `packId` matches store.ts
 * CROWN_PACKS ids and, later, the per-platform product id mapping above.
 */
export async function purchaseCrownPack(packId: string): Promise<PurchaseResult> {
  void packId; // used once a storefront is wired in (see plan above)
  return {
    ok: false,
    reason:
      "The royal mint opens with the App Store release — Crowns are earned through deeds until then.",
  };
}
