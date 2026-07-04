# Warden's Keep — Monetization Design

Status: **scaffolding only — no real payments exist in the app.** The store
UI, currency, and catalog ship now; the actual storefront arrives with the
App Store / Play Store release. Until then the payments adapter honestly
declines every purchase attempt.

Companion research and binding directives: see
[docs/research/UI_DENSITY_DIRECTIVES.md](research/UI_DENSITY_DIRECTIVES.md)
(section 3, "Monetization — ethical scaffolding") and the fair-monetization
positioning in [docs/MARKETING_PLAN.md](MARKETING_PLAN.md).

## Philosophy

1. **Earnable premium currency.** Crowns (👑) are the profile-level premium
   currency, and they are earned by playing *today*: achievements carry crown
   bounties and the daily challenge pays a flat bounty. Purchasing crowns is
   a shortcut that arrives later — never the only faucet.
2. **No pay-to-win pressure.** Warden's Keep is a single-player management
   sim. There is no ladder, no PvP, no one to beat with a wallet. Crown → coin
   conversion is a self-directed leg-up, clearly labelled, never required by
   the balance curve.
3. **Everything meaningful stays earnable by play.** Every warden class is
   unlocked by deeds (achievements). Crowns buy an *instant-unlock shortcut*,
   and the store refuses to sell a warden you already have — you can never
   pay for something your play already earned.
4. **Transparency.** Real prices are shown as real prices. The stubbed store
   says exactly what it is ("the royal mint opens with the App Store
   release"). No fake payment sheets, no dark patterns, no urgency theater.
5. **Cosmetics carry the store.** Keep themes are pure re-dressings of the
   postcard and palette accent — zero mechanical effect.

## Catalog

### Crown packs (real money — display data until the storefront ships)

| Pack | Crowns | Price |
|---|---|---|
| Pouch of Crowns (`pouch`) | 50 👑 | $1.99 |
| Chest of Crowns (`chest`) | 140 👑 | $4.99 |
| Royal Vault (`vault`) | 320 👑 | $9.99 |

Defined in `src/ui/store.ts` (`CROWN_PACKS`) as display data only. Once live,
localized prices come from the platform store at runtime; the USD strings
become fallback labels.

### Keep themes (cosmetic DLC) — `THEMES` in `src/ui/store.ts`

| Theme | Cost | Effect |
|---|---|---|
| The Keep (`standard`) | free, owned by default | live clock, gold accent `0xd9a441` |
| Midnight Keep (`midnight`) | 60 👑 | eternal torchlit night (`phaseOverride: "night"`), accent `0x6a5acd` |
| Winterhold (`winterhold`) | 60 👑 | endless snowfall (`phaseOverride: "winter"`), accent `0x9fc4e0` |

Buying a theme applies it immediately; switching between owned themes is free
(`setActiveTheme`).

### Warden instant unlock

`WARDEN_UNLOCK_COST = 40` crowns per warden class. A convenience shortcut:
every warden remains earnable through its achievement forever, and
`buyWardenUnlock` rejects any warden already available by deeds or prior
purchase.

### Crown → coin conversion

- Rate: `COIN_PER_CROWN = 20` run-coin per crown.
- Minimum: `COIN_CONVERT_MIN = 5` crowns per conversion.
- The store deducts crowns and hands the coin to the caller to add to the
  live run — profile logic never touches run state.

## Crown faucets (earning without paying)

| Faucet | Amount | Notes |
|---|---|---|
| Achievements | per-def `crowns` bounty | `AchievementDef.crowns` on each def in `src/core/achievements.ts`; paid by `recordProgress` exactly once per achievement per profile (tracked in `profile.crownsGrantedFor`) |
| Daily challenge | 15 👑 flat (`DAILY_CROWN_BOUNTY`) | `grantDailyCrowns()` — at most once per calendar date (`profile.lastDailyCrownDate`) |

Both faucets persist through the standard profile save path (localStorage +
native Preferences mirror).

## The payments adapter — `src/ui/payments.ts`

Contract:

```ts
interface PurchaseResult { ok: boolean; reason?: string }
purchaseCrownPack(packId: string): Promise<PurchaseResult>
```

This is the **only** seam that will ever touch real money. Today it always
returns `{ ok: false, reason: "The royal mint opens with the App Store
release — Crowns are earned through deeds until then." }`. The UI treats any
`ok: false` as a calm toast.

Per-store wiring plan (full detail in the payments.ts comment block):

- **iOS — StoreKit 2** via a Capacitor IAP plugin. Consumable products
  (`keep.crowns.*`), runtime-fetched localized prices, server-side JWS
  verification with transaction-id replay protection, `finish()` only after
  the grant is durably recorded.
- **Android — Google Play Billing (≥ v6).** Server-side purchase-token
  verification via the Play Developer API, grant before `consumeAsync()`,
  correct handling of `PENDING` purchases.
- **Steam — ISteamMicroTxn.** Fully server-driven InitTxn → FinalizeTxn;
  grants only after finalize.
- **Cross-cutting:** receipt validation is server-side everywhere; refunds
  deduct the pack's crowns (floored at 0) but never claw back items already
  bought; crowns are consumables so there is nothing to "restore" — owned
  themes/wardens live in the profile.

## What we will NEVER do

- **No loot boxes / gacha** — every price is a known price for a known thing.
- **No timers that sell skips** — we will not build a wait, then sell the
  not-waiting. (Marketing promise: "No ads. No timers. No energy.")
- **No artificial frustration** — the balance curve is tuned for the free
  game; conversion exists as a convenience, never as relief from designed
  pain.
- **No pretend charging** — nothing simulates a purchase flow before the real
  storefront exists.
- **No paid exclusives on gameplay** — any warden, ending, or system content
  is reachable by play; money only ever buys time or cosmetics.
- **No dark-pattern pressure** — no countdown offers, no "your friends
  bought", no interrupting purchase prompts mid-run.

## Code map

| Piece | File |
|---|---|
| Profile fields (`crowns`, `crownsGrantedFor`, `ownedThemes`, `activeTheme`, `purchasedWardens`, `lastDailyCrownDate`), crown grants, `grantDailyCrowns`, `persistProfile`, `availableWardens` | `src/ui/profile.ts` |
| Catalog (`THEMES`, `CROWN_PACKS`) and pure purchase logic (`buyTheme`, `setActiveTheme`, `buyWardenUnlock`, `convertCrownsToCoin`) | `src/ui/store.ts` |
| Storefront adapter (`purchaseCrownPack`) | `src/ui/payments.ts` |
| Achievement crown bounties | `src/core/achievements.ts` |
| Tests | `test/store.test.ts` |
