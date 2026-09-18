# Authentication in Echo

> A code-referenced walkthrough of how identity, sessions and authorization work across the monorepo.
> Line numbers refer to the state of the repo at commit `71a7346`.

---

## 1. The big picture: two independent auth systems

Echo is a B2B SaaS with two completely different kinds of "user", and each gets its own auth
mechanism. They never share a credential, a token, or a provider.

| | **Track A — Dashboard** | **Track B — Widget** |
|---|---|---|
| Who | Business staff (your customer) | End users (your customer's customer) |
| App | [`apps/web`](../apps/web) | [`apps/widget`](../apps/widget) + [`apps/embed`](../apps/embed) |
| Provider | **Clerk** (users + organizations + billing) | **Home-grown "contact sessions"** |
| Credential | Clerk JWT (`convex` template), cookie-managed | `contactSessionId` (a Convex doc id) in `localStorage` |
| Verified by | `ctx.auth.getUserIdentity()` in Convex | Explicit DB lookup + expiry check in each function |
| Tenant key | `identity.orgId` (from the JWT) | `contactSession.organizationId` |
| Backend namespace | `convex/private/*` | `convex/public/*` |

Both tracks converge on the same Convex backend ([`packages/backend`](../packages/backend)), and the
folder a Convex function lives in *is* its auth contract:

- **`convex/private/*`** — requires a Clerk identity **and** an active org. Entered by the dashboard.
- **`convex/public/*`** — no Clerk identity. Callable by anyone on the internet; each function must
  authorize itself from the arguments it is given (`contactSessionId` / `organizationId`).
- **`convex/system/*`** — `internalQuery` / `internalMutation` only. Not reachable from any client;
  callable only from other Convex functions. This is where the privileged operations live
  (session refresh, subscription upsert).

---

## 2. Track A — Dashboard authentication (Clerk → Convex)

### 2.1 Wiring the provider chain

The root layout wraps the whole app in `ClerkProvider`, which in turn wraps `Providers`:

- [`apps/web/app/layout.tsx:66-71`](../apps/web/app/layout.tsx) — `ClerkProvider` is the outermost
  auth boundary.
- [`apps/web/components/providers.tsx:14-18`](../apps/web/components/providers.tsx) — the key line is
  `<ConvexProviderWithClerk client={convex} useAuth={useAuth}>`. This is the bridge: Convex asks
  Clerk's `useAuth` for a fresh JWT and attaches it to every Convex websocket/HTTP call. Without this,
  `ctx.auth.getUserIdentity()` on the backend would always be `null`.

Order matters — `ClerkProvider` must be outside, because `useAuth()` used inside `Providers` reads
from Clerk's context.

### 2.2 Edge enforcement: the middleware

[`apps/web/middleware.ts`](../apps/web/middleware.ts) runs before any dashboard page renders and does
two jobs:

1. **Authentication** (`:14`) — everything except `/sign-in*` and `/sign-up*` goes through
   `auth.protect()`, which redirects anonymous visitors to the sign-in page.
2. **Organization enforcement** (`:16-25`) — a signed-in user with no active organization
   (`userId && !orgId`) is redirected to `/org-selection`, carrying the original URL in a
   `redirectUrl` search param. `/org-selection` itself is in `isOrgFreeRoute` (`:5-9`) so this
   doesn't loop.

This is the reason **every authenticated request in this app is guaranteed to carry an `orgId`** —
the whole backend authorization model leans on that invariant.

The `matcher` at `:31-38` skips Next internals and static assets, and always runs on `/api` routes.

### 2.3 Client-side guards (second line of defence)

The middleware protects navigation; the guards protect *rendering*, and handle the async gap while
Convex is still validating the token.

- [`apps/web/modules/auth/ui/components/auth-guard.tsx`](../apps/web/modules/auth/ui/components/auth-guard.tsx)
  uses Convex's `<AuthLoading>` / `<Authenticated>` / `<Unauthenticated>` trio. Note this reflects
  **Convex's** view of auth, not Clerk's — it only flips to `Authenticated` once Convex has actually
  verified the JWT. Unauthenticated renders `SignInView` inline instead of redirecting.
- [`apps/web/modules/auth/ui/components/organization-guard.tsx`](../apps/web/modules/auth/ui/components/organization-guard.tsx)
  reads `useOrganization()` and renders the org picker inline when no org is active.

They are composed in [`apps/web/modules/dashboard/ui/layouts/dashboard-layout.tsx:17-26`](../apps/web/modules/dashboard/ui/layouts/dashboard-layout.tsx):
`AuthGuard` → `OrganizationGuard` → sidebar + page. So the guarantee "signed in **and** has an org"
holds for every page under [`apps/web/app/(dashboard)/`](../apps/web/app/(dashboard)).

### 2.4 The auth routes

All three are thin pages that delegate to a view; the views are one-liners around Clerk's prebuilt
components:

| Route | Page | View |
|---|---|---|
| `/sign-in` | [`(auth)/sign-in/[[...sign-in]]/page.tsx`](../apps/web/app/(auth)/sign-in/[[...sign-in]]/page.tsx) | [`sign-in-view.tsx`](../apps/web/modules/auth/ui/views/sign-in-view.tsx) — `<SignIn routing="hash" />` |
| `/sign-up` | [`(auth)/sign-up/[[...sign-up]]/page.tsx`](../apps/web/app/(auth)/sign-up/[[...sign-up]]/page.tsx) | [`sign-up-view.tsx`](../apps/web/modules/auth/ui/views/sign-up-view.tsx) |
| `/org-selection` | [`(auth)/org-selection/[[...org-selection]]/page.tsx`](../apps/web/app/(auth)/org-selection/[[...org-selection]]/page.tsx) | [`org-selection-view.tsx`](../apps/web/modules/auth/ui/views/org-selection-view.tsx) — `<OrganizationList hidePersonal />` |

The `[[...slug]]` optional catch-all segments exist because Clerk's components own their own
sub-routing (verification steps, SSO callbacks, etc.). `routing="hash"` in the views is what lets the
same component also render *inside* `AuthGuard` at an arbitrary URL.

`hidePersonal` on `OrganizationList` is deliberate: this product has no concept of a personal
workspace — an org is mandatory.

Session/user UI (switch org, sign out) lives in
[`dashboard-sidebar.tsx:86`](../apps/web/modules/dashboard/ui/components/dashboard-sidebar.tsx)
(`OrganizationSwitcher`) and `:195` (`UserButton`).

### 2.5 How Convex trusts the Clerk token

[`packages/backend/convex/auth.config.ts`](../packages/backend/convex/auth.config.ts) declares a
single OIDC provider:

- `domain: process.env.CLERK_JWT_ISSUER_DOMAIN` — set on the **Convex dashboard**, not in `.env.local`.
- `applicationID: "convex"` — this must match the name of the JWT template configured in Clerk.

Convex fetches the issuer's JWKS and verifies the token signature itself. The `orgId` claim the
backend relies on is **not** standard OIDC — it exists only because the Clerk `convex` JWT template
is configured to include it. If that template is missing the claim, every `private/*` function
starts failing with "Organization not found" even though sign-in works fine. Worth remembering when
setting up a new Clerk instance.

### 2.6 The `private/*` authorization pattern

Every dashboard-facing Convex function repeats the same four-step preamble. Canonical example:
[`packages/backend/convex/private/widgetSettings.ts:17-34`](../packages/backend/convex/private/widgetSettings.ts).

1. `const identity = await ctx.auth.getUserIdentity()` → throw `UNAUTHORIZED` if `null`.
2. `const orgId = identity.orgId as string` → throw `UNAUTHORIZED` if falsy.
3. Scope every DB read/write by `orgId`, always via the `by_organization_id` index.
4. When a document id comes in from the client, **re-check ownership** after loading it.

Step 4 is the one that actually prevents cross-tenant access, and
[`private/contactSessions.tsx:36-41`](../packages/backend/convex/private/contactSessions.tsx) is the
clearest example: it loads the conversation, compares `conversation.organizationId !== orgId`, and
throws before touching the linked contact session.

The same preamble appears in all 9 files that call `getUserIdentity()`:
[`private/conversations.ts`](../packages/backend/convex/private/conversations.ts) (×3),
[`private/messages.ts`](../packages/backend/convex/private/messages.ts) (×3),
[`private/files.ts`](../packages/backend/convex/private/files.ts) (×3),
[`private/vapi.ts`](../packages/backend/convex/private/vapi.ts) (×2),
[`private/widgetSettings.ts`](../packages/backend/convex/private/widgetSettings.ts) (×2),
[`private/plugins.ts`](../packages/backend/convex/private/plugins.ts) (×2),
[`private/secrets.ts`](../packages/backend/convex/private/secrets.ts),
[`private/contactSessions.tsx`](../packages/backend/convex/private/contactSessions.tsx),
and [`users.ts`](../packages/backend/convex/users.ts).

> The `as string` cast on `identity.orgId` is unchecked — `orgId` isn't in Convex's
> `UserIdentity` type because it's a custom claim. The falsy check on the next line is what makes it
> safe at runtime.

### 2.7 Authorization tier 2: subscription / plan gating

Being authenticated isn't enough for premium features. Gating happens on both ends:

**UI** — Clerk's `<Protect condition={(has) => has({ plan: "pro" })}>` with a
`PremiumFeatureOverlay` fallback, applied per page:
[`plugins/vapi/page.tsx:8-17`](../apps/web/app/(dashboard)/plugins/vapi/page.tsx),
[`files/page.tsx`](../apps/web/app/(dashboard)/files/page.tsx),
[`customization/page.tsx`](../apps/web/app/(dashboard)/customization/page.tsx).

**Backend** — the UI check is cosmetic, so the server re-checks against its own `subscriptions`
table: [`private/files.ts:50-61`](../packages/backend/convex/private/files.ts) runs
`internal.system.subscriptions.getByOrganizationId` and throws unless `status === "active"`.

**How the table gets filled** — the Clerk webhook at
[`packages/backend/convex/http.ts:14-59`](../packages/backend/convex/http.ts):

- `validateRequest` (`:61-77`) verifies the **Svix signature** using `CLERK_WEBHOOK_SECRET` before
  anything is trusted. An unverified payload returns 400. This is the auth for the webhook endpoint.
- On `subscription.updated` it reads `payer.organization_id`, calls back into Clerk to adjust
  `maxAllowedMemberships` (5 for active, 1 otherwise), and upserts into `subscriptions` via
  `internal.system.subscriptions.upsert`.

Note the server-to-server Clerk client here (`:8-10`) uses `CLERK_SECRET_KEY` and runs with full
admin rights — which is why it lives behind `httpAction` + signature verification.

---

## 3. Track B — Widget authentication (contact sessions)

The widget is embedded on a third-party website. There is no Clerk, no cookie, no login — the end
user only ever gives a name and email.

Notice what's *absent* in
[`apps/widget/components/providers.tsx:11-15`](../apps/widget/components/providers.tsx): a plain
`ConvexProvider`, not `ConvexProviderWithClerk`. The widget never sends a JWT, which is precisely why
everything it calls must live in `convex/public/*` and authorize itself manually.

### 3.1 Establishing *which tenant* the widget belongs to

The organization id travels from the host page into the widget:

1. The site owner drops a script tag with `data-organization-id`. The embed script reads it from
   `document.currentScript` and falls back to scanning for `script[src*="embed"]`:
   [`apps/embed/embed.ts:15-36`](../apps/embed/embed.ts). No id → it logs an error and bails (`:39-42`).
2. The script renders an iframe pointing at the widget app with `?organizationId=...`
   (config in [`apps/embed/config.ts`](../apps/embed/config.ts)).
3. The widget page reads it from `searchParams` and passes it down:
   [`apps/widget/app/page.tsx:12-15`](../apps/widget/app/page.tsx) →
   [`widget-view.tsx:18-23`](../apps/widget/modules/widget/ui/views/widget-view.tsx).

This value is **fully attacker-controlled** — it's an HTML attribute on someone else's page. It is
only an *identifier*, never a secret, and the backend treats it that way: it's validated for
existence, but possessing it grants nothing beyond what the widget is meant to expose.

### 3.2 The boot sequence

[`widget-loading-screen.tsx`](../apps/widget/modules/widget/ui/screens/widget-loading-screen.tsx) is
a four-step state machine (`InitStep = "org" | "session" | "settings" | "vapi" | "done"`), each step
an effect that advances `step` on completion.

| Step | Lines | What it does |
|---|---|---|
| `org` | `:42-80` | Calls `api.public.organizations.validate`. Invalid → error screen. |
| `session` | `:87-120` | Reads `contactSessionId` from storage; if present, calls `api.public.contactSessions.validate` and records `sessionValid`. Missing or failing is **not** an error — it just means "not signed in". |
| `settings` | `:132-142` | Loads widget settings (branding, greeting). |
| `vapi` | `:147-174` | Loads the Vapi public key; failure degrades gracefully to no-voice. |
| `done` | `:176-183` | `hasValidSession ? "selection" : "auth"` — the routing decision. |

The org check itself, [`public/organizations.ts:13-24`](../packages/backend/convex/public/organizations.ts),
is a Convex **action** (not a query) because it calls Clerk's REST API via `@clerk/backend` — a
`getOrganization` that throws means invalid. Actions are required here since queries can't do network I/O.

### 3.3 Creating a session

[`widget-auth-screen.tsx`](../apps/widget/modules/widget/ui/screens/widget-auth-screen.tsx) is a
zod-validated name + email form (`:24-27`). On submit (`:46-72`) it:

1. Collects a browser fingerprint-ish `metadata` blob — user agent, languages, platform, screen and
   viewport size, timezone, referrer, current URL (`:49-62`). This is analytics/support context for
   the dashboard operator, not a security control.
2. Calls `api.public.contactSessions.create`, stores the returned id, and moves to the selection screen.

[`public/contactSessions.ts:27-38`](../packages/backend/convex/public/contactSessions.ts) simply
inserts the row with `expiresAt = now + SESSION_DURATION_MS`. **There is no verification of the email
address** — no magic link, no OTP. Identity here is self-asserted; the session id is the only thing
that carries weight afterwards.

### 3.4 Where the session lives: the atom family

[`widget-atoms.ts:12-17`](../apps/widget/modules/widget/atoms/widget-atoms.ts):

```ts
export const contactSessionIdAtomFamily = atomFamily((organizationId: string) =>
  atomWithStorage<Id<"contactSessions"> | null>(`${CONTACT_SESSION_KEY}_${organizationId}`, null),
);
```

Two things worth internalizing:

- `atomWithStorage` persists to `localStorage` — the session survives reloads, and, because it's
  `localStorage` rather than a cookie, it is **readable by JavaScript**. The widget runs in its own
  iframe origin, which is what keeps the host page from reading it.
- The **atom family is keyed by organization id** (storage key `echo_contact_session_<orgId>`), so a
  person who visits two different Echo customers' sites gets two independent sessions. Every consumer
  therefore calls `contactSessionIdAtomFamily(organizationId || "")` rather than a plain atom —
  see [`widget-chat-screen.tsx:56-57`](../apps/widget/modules/widget/ui/screens/widget-chat-screen.tsx),
  [`widget-inbox-screen.tsx:26-27`](../apps/widget/modules/widget/ui/screens/widget-inbox-screen.tsx),
  [`widget-selection-screen.tsx:35-36`](../apps/widget/modules/widget/ui/screens/widget-selection-screen.tsx).

### 3.5 The session id as a bearer token

There is no `Authorization` header anywhere. Instead, `contactSessionId` is passed as an **explicit
argument to every public call**, and each handler re-authorizes from scratch. The recurring pattern
(load the doc, reject if missing or expired) is in
[`public/conversations.ts:18-25`](../packages/backend/convex/public/conversations.ts).

Ownership checks on top of that:

- [`public/conversations.ts:86-91`](../packages/backend/convex/public/conversations.ts) — `getOne`
  rejects when `conversation.contactSessionId !== session._id`.
- [`public/messages.ts:46-51`](../packages/backend/convex/public/messages.ts) — `create` does the
  same before letting a message through, and additionally refuses `resolved` conversations (`:53-58`).
- [`public/conversations.ts:27-33`](../packages/backend/convex/public/conversations.ts) — `getMany`
  needs no extra check: it queries by the `by_contact_session_id` index, so the session id *is* the filter.

### 3.6 Sliding expiry

Durations: [`packages/backend/convex/constants.ts`](../packages/backend/convex/constants.ts) —
24 h lifetime, 4 h auto-refresh threshold.

Refresh is an **internal** mutation,
[`system/contactSessions.ts:5-40`](../packages/backend/convex/system/contactSessions.ts): if the
remaining time is under the threshold, it patches `expiresAt` forward by a full 24 h. It re-validates
existence and expiry itself rather than trusting its caller.

It is invoked from the write paths only, so an active conversation keeps a session alive
indefinitely while idle ones lapse:

- [`public/conversations.ts:117-119`](../packages/backend/convex/public/conversations.ts) (on conversation create)
- [`public/messages.ts:61-63`](../packages/backend/convex/public/messages.ts) (on each message)

Expiry is purely lazy — `expiresAt` is compared on read, nothing sweeps the table, and the
`by_expires_at` index in [`schema.ts:70`](../packages/backend/convex/schema.ts) is currently unused
(presumably reserved for a cleanup cron).

### 3.7 Voice calls (Vapi)

[`public/secrets.ts:10-43`](../packages/backend/convex/public/secrets.ts) looks up the org's plugin,
pulls the secret from the secret store ([`lib/secrets.ts`](../packages/backend/convex/lib/secrets.ts)),
and deliberately returns **only** `publicApiKey` — `privateApiKey` is checked for presence but never
sent to the browser. That public key is then handed to the Vapi SDK in
[`use-vapi.tsx:22-27`](../apps/widget/modules/widget/hooks/use-vapi.tsx).

---

## 4. Where the two tracks meet

The one place a Clerk-authenticated user reads contact-session data:
[`private/contactSessions.tsx`](../packages/backend/convex/private/contactSessions.tsx) —
`getOneByConversationId`. An operator viewing a conversation needs the contact's name/email, and the
function walks conversation → org check → contact session, refusing if the conversation belongs to a
different org. This is the correct shape for any future cross-boundary read.

The `conversations` table ([`schema.ts:32-45`](../packages/backend/convex/schema.ts)) is the join
point: it carries both an `organizationId` (Track A's tenant key) and a `contactSessionId`
(Track B's identity), which is why the indexes for both exist on it.

---

## 5. Request lifecycle, end to end

**Dashboard call** (e.g. saving widget settings)
```
Browser → Clerk issues JWT (template "convex")
  → ConvexProviderWithClerk attaches it
    → Convex verifies signature against CLERK_JWT_ISSUER_DOMAIN
      → private/* handler: getUserIdentity() → orgId → org-scoped query
```

**Widget call** (e.g. sending a message)
```
Host page script tag (data-organization-id) → iframe ?organizationId=
  → localStorage echo_contact_session_<orgId> → contactSessionId
    → passed as an argument to public/*
      → handler loads session, checks expiresAt, checks conversation ownership
        → refreshes session if inside the 4h threshold
```

---

## 6. Environment variables

| Variable | Where it's set | Used by |
|---|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `apps/web` | `ClerkProvider`, middleware |
| `CLERK_SECRET_KEY` | Convex deployment | [`public/organizations.ts:6`](../packages/backend/convex/public/organizations.ts), [`http.ts:9`](../packages/backend/convex/http.ts) |
| `CLERK_JWT_ISSUER_DOMAIN` | Convex deployment | [`auth.config.ts`](../packages/backend/convex/auth.config.ts) |
| `CLERK_WEBHOOK_SECRET` | Convex deployment | [`http.ts:69`](../packages/backend/convex/http.ts) (Svix verification) |
| `NEXT_PUBLIC_CONVEX_URL` | `apps/web`, `apps/widget` | both `providers.tsx` files |
| `VITE_WIDGET_URL` | `apps/embed` build | [`config.ts`](../apps/embed/config.ts) |

Also required in Clerk itself: a JWT template named **`convex`** that includes the `orgId` claim, and
a webhook subscribed to `subscription.updated` pointing at `<convex-site-url>/clerk-webhook`.

---

## 7. Observations worth knowing

Things I noticed reading the code — not all of them are bugs, but they're the sharp edges.

1. **`public/messages.getMany` doesn't check thread ownership.**
   [`public/messages.ts:104-117`](../packages/backend/convex/public/messages.ts) validates that the
   contact session exists and hasn't expired, then lists messages for the supplied `threadId` —
   without verifying the thread belongs to that session. Its siblings (`create`, `conversations.getOne`)
   do perform that check. Anyone with any valid session id plus a known thread id could read another
   conversation's messages.

2. **`public/conversations.create` doesn't check the session's org matches `organizationId`.**
   [`public/conversations.ts:107-146`](../packages/backend/convex/public/conversations.ts) takes both
   as independent arguments and never compares `session.organizationId` to `args.organizationId`, so a
   conversation can be filed under one org using a session belonging to another.

3. **`public/widgetSettings.getByOrganizationId`** is an unauthenticated query over any org id
   ([`public/widgetSettings.ts`](../packages/backend/convex/public/widgetSettings.ts)). Fine as long
   as widget settings stay non-sensitive (greeting, suggestions, assistant id) — worth revisiting if
   anything confidential is ever added to that table.

4. **A session id is a long-lived bearer credential in `localStorage`** with no rotation and no
   binding to the device or IP, whose lifetime extends automatically with use. The iframe origin
   boundary is doing the heavy lifting on containment.

5. **Email is never verified**, so contact identity is self-asserted. Reasonable for a support widget;
   just don't treat `contactSession.email` as proof of anything in the dashboard.

6. **[`users.ts:24`](../packages/backend/convex/users.ts) has a hardcoded `throw new Error("Testing Error")`**
   after the auth checks, making `addUser` permanently fail. Looks like leftover Sentry test
   scaffolding (cf. [`apps/web/app/sentry-example-page`](../apps/web/app/sentry-example-page)).
   The unreachable `return` below it is the tell.

7. **`private/*` is a naming convention, not an enforced boundary.** Every function in that folder is
   still a publicly callable Convex endpoint; the guarantee comes entirely from each handler starting
   with the `getUserIdentity()` preamble. A new function that forgets it is wide open. Only
   `system/*` (`internalQuery` / `internalMutation`) is structurally unreachable from clients.
