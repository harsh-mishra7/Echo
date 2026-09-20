# `apps/web` — Operator Dashboard

`apps/web` is the operator/admin dashboard for **Echo**, a B2B SaaS AI chatbot + voice assistant
customer-support platform. It's what an organization's team uses to manage conversations, the
knowledge base, widget customization, integrations, the voice-AI plugin, and billing. The
end-user-facing chat widget that customers embed on their own sites lives in `apps/widget` /
`apps/embed`, not here.

See also: [`docs/auth.md`](./auth.md) for a deep, line-referenced walkthrough of authentication
(Clerk + Convex + the separate widget "contact session" auth track), and the root
[`README.md`](../README.md) for the overall product/tech-stack overview.

## Tech stack

- **Framework**: Next.js 15.5 (App Router), React 19, TypeScript. `"type": "module"`.
- **Auth**: Clerk (`@clerk/nextjs`) — users, organizations, plan/billing gating.
- **Backend/data**: [Convex](https://convex.dev) (`convex` + `@convex-dev/agent`) via the shared
  workspace package `@workspace/backend`. There is no REST/GraphQL API of its own — components
  call Convex functions directly with `useQuery` / `useMutation` / `useAction`.
- **UI**: `@workspace/ui`, an internal shadcn/ui-based component library shared with `apps/widget`.
- **Styling**: Tailwind CSS v4 (CSS-first — no `tailwind.config.js`; theme lives in
  `packages/ui/src/styles/globals.css`).
- **State**: Jotai for small pieces of local/persisted UI state (e.g. the conversations status
  filter).
- **Forms**: `react-hook-form` + `zod`.
- **Monitoring**: Sentry (`@sentry/nextjs`) for client/server/edge.
- Dev server runs on port 3000 (`next dev --port 3000`).

## Directory structure

```
apps/web/
├── app/                              # Next.js App Router — thin route files only
│   ├── (auth)/                       # unauthenticated route group
│   │   ├── sign-in/[[...sign-in]]/page.tsx
│   │   ├── sign-up/[[...sign-up]]/page.tsx
│   │   └── org-selection/[[...org-selection]]/page.tsx
│   ├── (dashboard)/                  # authenticated route group
│   │   ├── page.tsx                  # "/" — redirected to /conversations
│   │   ├── billing/page.tsx
│   │   ├── customization/page.tsx
│   │   ├── files/page.tsx
│   │   ├── integrations/page.tsx
│   │   ├── plugins/vapi/page.tsx
│   │   └── conversations/
│   │       ├── page.tsx
│   │       └── [conversationId]/page.tsx
│   ├── api/sentry-example-api/route.ts   # only Next.js API route (Sentry test)
│   └── layout.tsx                    # root layout: ClerkProvider, fonts, Toaster
├── modules/                          # feature-slice architecture — the bulk of the app
│   ├── auth/        # guards + Clerk view wrappers
│   ├── dashboard/    # sidebar, conversations inbox, thread view, contact panel
│   ├── customization/ # widget greeting/suggestions/voice settings form
│   ├── files/         # knowledge-base (RAG) document management
│   ├── integrations/  # embed-snippet generator
│   ├── plugins/        # Vapi voice-AI plugin connection
│   └── billing/        # Clerk pricing table + upsell overlay
├── components/providers.tsx          # ConvexProviderWithClerk wrapper
├── lib/country-utils.ts              # timezone → country/flag helper
├── middleware.ts                     # Clerk auth + org-enforcement middleware
├── next.config.mjs                   # Sentry-wrapped Next config, "/" → "/conversations" redirect
├── components.json                   # shadcn/ui config (style: new-york)
└── sentry.*.config.ts, instrumentation*.ts
```

Each route under `app/` is a thin wrapper that renders a `View` component from the matching
`modules/<feature>/ui/views/*`. Feature modules own their own `components/`, `views/`, `layouts/`,
`schemas.ts`/`types.ts`, `hooks/`, and `constants.ts`/`atoms.ts`. Shared UI primitives live in
`packages/ui`, not in `apps/web/components/` (which only holds the Convex/Clerk provider wrapper).

## Routes

| Route | Purpose |
|---|---|
| `/sign-in`, `/sign-up` | Clerk `<SignIn>` / `<SignUp>` (hash routing) |
| `/org-selection` | Forces every signed-in user into an organization via Clerk `<OrganizationList hidePersonal>` — there's no "personal workspace" concept |
| `/` | Demo/placeholder page; permanently redirected to `/conversations` |
| `/conversations` | Inbox — resizable list (filterable: all/unresolved/escalated/resolved) + thread pane |
| `/conversations/[conversationId]` | Full AI+human chat thread, with an "Enhance" (AI-assisted reply) action and a contact-info side panel |
| `/files` | Knowledge base — upload/list/delete RAG documents (Pro-plan gated) |
| `/customization` | Widget greeting message, quick-reply suggestions, optional Vapi voice settings (Pro-plan gated) |
| `/integrations` | Shows the org ID and generates `<script>` embed snippets (HTML/React/Next.js/JS) for the deployed widget |
| `/plugins/vapi` | Connect/disconnect the Vapi voice-AI plugin, stores API keys as Convex-managed secrets (Pro-plan gated) |
| `/billing` | Clerk `<PricingTable forOrganizations>` |
| `/sentry-example-page`, `/api/sentry-example-api` | Sentry monitoring smoke tests, not product features |

## Authentication

Full details in [`docs/auth.md`](./auth.md). Summary:

- `app/layout.tsx` wraps the app in `<ClerkProvider>` → `<Providers>` →
  `<ConvexProviderWithClerk>`, which forwards Clerk's session JWT into every Convex call.
- `middleware.ts` (`clerkMiddleware`) protects every route except `/sign-in` and `/sign-up`, and
  redirects any signed-in user without an active organization to `/org-selection`. This guarantees
  an `orgId` is always present downstream, which the whole Convex authorization model relies on.
- Client-side guards (`AuthGuard`, `OrganizationGuard` in `modules/auth/ui/components/`) provide a
  second line of defense for the async gap before Convex/Clerk state resolves, and are composed
  into `DashboardLayout`.
- Convex trusts Clerk as an OIDC provider (`packages/backend/convex/auth.config.ts`), matching a
  Clerk JWT template named `convex` that carries a custom `orgId` claim.
- Pro-plan features (`customization`, `files`, `plugins/vapi`) are gated client-side with Clerk's
  `<Protect condition={(has) => has({ plan: "pro" })}>` (falling back to a `PremiumFeatureOverlay`
  upsell) and re-validated server-side against a Convex `subscriptions` table kept in sync via a
  Clerk webhook (`packages/backend/convex/http.ts`).

## API layer

`apps/web` has no real Next.js API routes of its own — the only one present
(`api/sentry-example-api/route.ts`) exists purely to test Sentry error reporting. The actual
backend is a set of **Convex functions** in `packages/backend/convex/private/*` (the
"dashboard-only, Clerk+org-authenticated" namespace), called directly from React components:

- `private/conversations.ts` — list/filter, get one, update status
- `private/messages.ts` — thread messages, create, AI-assisted `enhanceResponse`
- `private/contactSessions.tsx` — end-user session info per conversation
- `private/widgetSettings.ts` — get/upsert widget customization
- `private/plugins.ts`, `private/secrets.ts`, `private/vapi.ts` — Vapi plugin connection and API
- `private/files.ts` — knowledge-base document management (`@convex-dev/rag`)

The counterpart `public/*` namespace (unauthenticated, contact-session based) is what
`apps/widget` talks to instead.

## Monorepo context

Root: pnpm + Turborepo workspace (`apps/*`, `packages/*`).

- **`apps/web`** (this app, port 3000) — the dashboard.
- **`apps/widget`** (port 3001) — the embeddable chat widget end-users interact with; shares
  `@workspace/backend` and `@workspace/ui` with `apps/web` but calls Convex's `public/*` functions.
- **`apps/embed`** (port 3002) — a Vite-built vanilla `widget.js` that third-party sites embed via
  `<script>`; this is exactly what `apps/web`'s Integrations page generates snippets for.
- **`packages/backend`** (`@workspace/backend`) — the single shared Convex backend (schema, AI
  agent/RAG logic, Clerk webhook) used by both `apps/web` and `apps/widget`.
- **`packages/ui`** (`@workspace/ui`) — shared shadcn/ui component library, including a
  purpose-built `ai-elements/` chat-UI subfolder, and the single Tailwind v4 theme source.
- **`packages/eslint-config`**, **`packages/typescript-config`** — shared lint/TS config bases.
