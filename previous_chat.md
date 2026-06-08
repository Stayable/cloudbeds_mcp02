Built and shipped. Now subscribed to PR #8 — checking CI status and any review comments.
Used ToolSearch

Two webhook events: a Vercel deployment failure and the matching vercel[bot] comment. Let me get real evidence — PR status plus the actual Vercel build logs — before deciding.

Let me pull the actual build logs to be definitive. I need the team ID first.

Diagnosis is conclusive. Build logs show the single failure line:

    The specified Root Directory "middleware" does not exist. Please update your Project Settings.

This is a pre-existing Vercel project misconfiguration, unrelated to this PR. The claude-code Vercel project is set to deploy from a Root Directory named middleware, which doesn't exist in the repo (the repo has client-portal and now cloudbeds-mcp). The build fails before touching any code, on commit clone — it would fail identically on main.

My PR added cloudbeds-mcp/, a stdio MCP server. It is not a Vercel-deployable web app and isn't the project's root directory, so it can't cause or fix this. There's no code change in this PR that would make Vercel go green.

The fix is a Vercel project settings change, not a code change — and it's your call:

    If the Vercel project is meant to deploy the investor portal → set Root Directory to client-portal (Vercel → claude-code → Settings → Build & Deployment → Root Directory).
    If this repo shouldn't auto-deploy at all → disconnect the Git integration or ignore the check.

I won't touch Vercel settings unilaterally — that affects your live deployment and is outside the scope of "create a Cloudbeds MCP."
Status of the actual work

    PR #8 (draft): https://github.com/rbeyer999/Claude-Code/pull/8 — Cloudbeds MCP server, builds clean, all 15 tools verified over the MCP handshake.
    The only failing check is the unrelated Vercel root-dir issue above.

I'm still subscribed to the PR. Since this failure is static (it won't self-resolve and no webhook fires on settings changes or new pushes), I'll stay watching but won't re-kick it — re-running won't help until the Root Directory is fixed. Want me to flag the Vercel setting fix to whoever owns that project, or leave it?

Cloudbeds OpenAPI specs
Welcome to the repository for the latest OpenAPI specs for the Cloudbeds API's. This is a compliment to the developer documentation at https://developers.cloudbeds.com which has guides and tutorials as well as API documentation built from the same OpenAPI specs found in this repository.

We have a Python SDK that is auto-generated from these docs, you can find it at https://github.com/cloudbeds/cloudbeds-api-python.

There are tools to generate similar API client SDK's for most popular languages from OpenAPI specs, our hope is you find the specs here useful for generating your own API client if needed as well as just browsing in your favorite OpenAPI spec viewer.

Good — that's the authoritative source. Let me find the spec repo and validate my tool definitions against the real operationIds rather than my documented best-guesses.

The real PMS spec is pms-v1.2-openapi.yaml. Let me pull it directly so I can validate exact operationIds and paths rather than rely on summaries.

All my read endpoints validate against the real spec except one: there is no /getTransactions in v1.2 — that was a bad guess. Let me verify the exact parameters for the key endpoints so the tool schemas match the spec, then fix.
RanExtract parameters for key endpoints

Now let me verify the remaining param details: getReservations status enum + pagination/guestName, and the propertyID param naming for the guest/rate/roomtype/hotel-detail endpoints.
RanVerify status enum, pagination, propertyID naming

Clear picture now. Several corrections needed: getGuestList/getRatePlans/getRoomTypes/getAvailableRoomTypes/getRooms take propertyIDs (plural); getReservations has no guestName (it's firstName/lastName); availability's rooms/adults/children are required; and getTransactions doesn't exist. Let me verify the write-tool params before rewriting.

Spec fully decoded. My write-tool guesses had errors too: postReservationNote uses reservationNote (not note), and postPayment supports cardType. Now I'll correct everything against the real spec — propertyIDs (plural) where required, required availability params, the firstName/lastName filters, and replacing the nonexistent getTransactions with the real getReservationsWithRateDetails.
Editedindex.ts+64-19

Now the write tools — fix reservationNote and add cardType:
Editedindex.ts+24-7

you can review chrome that is logged into the developers site

"Create a new project" — I need to know what kind before I create anything, since this could mean a new project inside the repo or a new external Vercel project (relevant given the failing deploys).
AskedProject type

disregard. i was trying to solve the vercel issue. how do i do that

What kind of project do you want me to create?

[User dismissed — do not proceed, wait for next instruction]

The Vercel project's Root Directory is set to middleware, a folder that doesn't exist in the repo — so every build dies immediately on clone. Fix it in Vercel project settings. Let me confirm what the deployable app actually needs.
Read.env.example

Here's the fix. Two parts — one you do in the Vercel dashboard, one I can do in the repo.
1. Point the project at the real app (dashboard — you)

The deployable app is client-portal (Next.js). middleware doesn't exist.

    Vercel → claude-code project → Settings → Build and Deployment
    Root Directory → change middleware → client-portal → Save
    Redeploy (Deployments → ⋯ → Redeploy, or just push)

If you don't actually want this repo to auto-deploy at all, instead go Settings → Git → Disconnect, or Settings → Git → Ignored Build Step — that stops the failing checks entirely.
2. Two things that will make it fail even after the root dir is fixed

Honest heads-up so you don't whack-a-mole:

    Env vars. client-portal needs these set in Vercel (Settings → Environment Variables), or the build/runtime breaks: DATABASE_URL, JWT_SECRET, MAGIC_LINK_SECRET, SMTP_HOST/PORT/USER/PASS, EMAIL_FROM, NEXT_PUBLIC_APP_URL.
    Prisma. The build script is just next build, but this app uses Prisma — Vercel's cached install often skips prisma generate, causing build failures. It needs prisma generate && next build.

I can fix the Prisma one in the repo right now (update the build script + add a vercel.json pinning the root directory so the setting is version-controlled). Want me to?

Note: none of this is related to PR #8 (the Cloudbeds MCP). That PR is good — it's only failing because it shares this same broken Vercel project. Fixing the root directory clears it.

Want me to apply the repo-side Prisma/vercel.json fix?

how can i create a new deployable app

Two ways, depending on whether you want it in this repo or standalone. Since you already run a monorepo (client-portal, cloudbeds-mcp), the cleanest path matching your setup:
Add a new app to this repo + its own Vercel project

1. Scaffold the app (Next.js, matching client-portal):

cd /path/to/Claude-Code
npx create-next-app@latest my-app --ts --tailwind --app --eslint

This creates my-app/ with a working build out of the box.

2. Commit & push it on a branch.

3. Create a separate Vercel project for it (this is the key step — one Vercel project per deployable folder):

    Vercel → Add New → Project → import rbeyer999/Claude-Code
    Root Directory → set to my-app (not the repo root, not middleware)
    Add any env vars → Deploy

Each Vercel project deploys exactly one subdirectory. That's why the existing claude-code project is broken — its Root Directory points at a folder (middleware) that doesn't exist. A fresh app in its own correctly-pointed project deploys clean.

    Note: cloudbeds-mcp is not deployable to Vercel — it's a stdio MCP server that runs locally inside Claude, not a web app. Only web apps (Next.js, static sites, serverless APIs) deploy to Vercel.

Or: standalone repo

If it's a separate product, I can create a new GitHub repo for it instead and you'd connect that to Vercel directly.

I can do most of this for you. Tell me:

    What's the app for / what stack? (default: Next.js + TS + Tailwind, like client-portal)
    In this repo or a new repo?

Say the word and I'll scaffold it, push it on a branch, and give you the exact Vercel import settings.

the new app is for this cloudbeds mcp

Right — to be deployable on Vercel, the Cloudbeds MCP needs an HTTP transport, not the stdio one I built (stdio only runs locally inside a client). The modern way is a remote MCP server over Streamable HTTP, which Vercel hosts via Next.js. Let me confirm the current package/approach so I don't build against stale APIs.

Let me use the Vercel MCP's own docs search — it's authenticated.

Confirmed approach: mcp-handler's createMcpHandler exposed from a Next.js route, Streamable HTTP (no Redis needed — that's only for SSE), gated by a bearer token. Vercel deploys a single root dir and can't reach a sibling folder, so the deployable app must be self-contained.

Building cloudbeds-mcp-server/ now — a Next.js app serving the same Cloudbeds tools over HTTP.

Now the shared Cloudbeds client and tool registration (reused, spec-validated):

Now the MCP route handler with the bearer-token gate, plus a minimal landing page:
Createdroute.ts+49-0

npx plugins add vercel/vercel-plugin

The same claude-code project is rebuilding/failing (still rootDirectory: middleware) — skipping that. You tried a Vercel debug tool; let me load the real one.
Used ToolSearch

The recurring failures and your deploy are actually the same fix: repoint the existing claude-code project's Root Directory off middleware. If I can do that via the Vercel API, the already-connected git integration would deploy cloudbeds-mcp-server on the next push — solving both at once. Let me check for an update-project tool.
Used ToolSearch

Let me confirm the project's exact current settings so my fix instructions are precise.
Used Vercel: get project

Now I have the full, honest picture — and the bottom line on what I can and can't do from here.

Root cause (confirmed via API): the claude-code project (prj_fARF8…) has Root Directory = middleware, framework null, and it auto-deploys this branch. middleware/ doesn't exist in the repo, so every build dies on clone. Every red X you're seeing — including the ones firing right now — is this one setting. Nothing in PR #8 causes it.

What I cannot do from this container (not permissions — capability):

    The Vercel MCP is read-only for project settings — there's get_project/list_projects/logs/deploy, but no tool to change Root Directory or env vars. So I can't fix the setting via API.
    The Vercel CLI can't authenticate here — no VERCEL_TOKEN, and the login endpoint is blocked by this environment's network policy.
    deploy_to_vercel doesn't actually deploy — it just prints "run vercel deploy / push to git."

So I can read everything and push code, but I can't touch Vercel project config or run an authenticated deploy. That part needs you (dashboard) or a VERCEL_TOKEN.

There is one thing I can do purely with git that turns the red X green and ships the app — but it has a naming trade-off. Let me have you pick:
AskedResolve Vercel
AskedResolve Vercel

This is the same known failure (the claude-code project's middleware Root Directory) — already diagnosed, no new action. Re-asking the choice my last attempt dropped:
AskedResolve Vercel

How do you want to resolve the Vercel situation (stop the recurring failures and/or deploy the Cloudbeds MCP server)?

Give me a Vercel token

You picked the Vercel token path. Let me check whether it's available yet.
RanCheck for Vercel token

Token isn't set. Before you go create one, I need to check something I saw earlier — the CLI's failure looked like a network block, not just missing auth. If this environment can't reach Vercel's API, a token won't help. Let me verify.
RanTest network reachability to Vercel API

That settles it — the token path can't work in this environment. Both vercel.com and api.vercel.com return 403 "Host not in allowlist". This container's network policy blocks Vercel entirely, so the Vercel CLI can't reach the API no matter what token I'm given. (The Vercel MCP tools work because they egress through Anthropic's MCP proxy, not the container's network — but those tools are read-only for project config and deploy_to_vercel doesn't actually deploy.)

So, honestly, there is no path for me to deploy from inside this session. Not permissions — the network is walled off from Vercel. Your options:

1. Dashboard (the real fix — ~2 min, recommended). This stops the failures and deploys the app in one place:

    Vercel → claude-code project → Settings → Build & Deployment → Root Directory → change middleware → cloudbeds-mcp-server → Save
    Settings → Environment Variables → add MCP_BEARER_TOKEN (openssl rand -hex 32) and CLOUDBEDS_API_KEY (+ CLOUDBEDS_ALLOW_WRITES=true if you want writes)
    Deployments → Redeploy

That one Root Directory change is what kills every red X you've been getting.

2. Let me make the check go green via git (I can do this now). I move cloudbeds-mcp-server/ → middleware/ so the existing project finds it and builds. Push triggers a successful deploy. Trade-offs: the folder gets the misleading name middleware, and you still must add the two secret env vars in the dashboard for the app to actually function (it returns 503 until then). This only avoids the Root-Directory click — you're in the dashboard for secrets regardless.

3. Open the network. If you add api.vercel.com to this environment's allowed domains (network policy) and set VERCEL_TOKEN, a future session could deploy via CLI. Bigger lift, needs a new environment/session.

My recommendation: #1. Since you must set secrets in the dashboard anyway, flipping the Root Directory field on the same visit is the whole fix — cleaner than the middleware rename.

Want me to do #2 to stop the failing checks immediately, or are you good to take #1?

Unsubscribed — no more Vercel failure notifications for PR #8.
Where things stand

Shipped (PR #8, branch claude/serene-clarke-S0kHP):

    cloudbeds-mcp/ — local stdio MCP server (run via Node in Claude Desktop/Code)
    cloudbeds-mcp-server/ — deployable HTTP MCP server (Next.js, bearer-gated)
    Both expose the same 15 tools, validated against the official pms-v1.2-openapi.yaml. Both build clean; auth gate + MCP handshake smoke-tested.

The Vercel noise was never your code — it's the claude-code project's Root Directory set to middleware, a folder that doesn't exist. I couldn't fix it from here (no write API for project settings; the container's network policy blocks api.vercel.com, so the CLI can't reach Vercel even with a token).
When you're ready to deploy (dashboard, ~2 min — fixes both at once)

Vercel → claude-code project → Settings → Build & Deployment:

    Root Directory: middleware → cloudbeds-mcp-server

Then Settings → Environment Variables:

    MCP_BEARER_TOKEN = openssl rand -hex 32
    CLOUDBEDS_API_KEY = your Cloudbeds self-service key
    (optional) CLOUDBEDS_ALLOW_WRITES=true

Then Deployments → Redeploy. Endpoint will be …/api/mcp; connect with Authorization: Bearer <token>. Full client config is in cloudbeds-mcp-server/README.md.

PR #8 is still a draft. Want me to mark it ready for review, or leave it as-is?

how do i add mcp_bearer_token
1. Generate a value

Run this anywhere (your terminal):

openssl rand -hex 32

Copy the output (a 64-char string). That's your token.
2. Add it in Vercel (for the deployed server)

    Vercel → your claude-code project → Settings → Environment Variables
    Key: MCP_BEARER_TOKEN
    Value: paste the string from step 1
    Environments: check Production, Preview, Development (all three)
    Save
    Redeploy so it takes effect: Deployments → ⋯ → Redeploy (env vars only apply to new deployments)

3. Add it locally (only if running npm run dev)

In cloudbeds-mcp-server/.env.local:

MCP_BEARER_TOKEN=<paste the same string>

4. Use it when connecting a client

Every MCP client must send it as a header:

Authorization: Bearer <the same string>

Example (Claude Code):

claude mcp add --transport http cloudbeds \
  https://<your-deployment>.vercel.app/api/mcp \
  --header "Authorization: Bearer <the same string>"

It's a shared secret — treat it like a password. Same string in Vercel and in the client; if they don't match you'll get 401, and if it's missing in Vercel you'll get 503.

Want me to generate one for you right now so you have a value to paste?

where's the string?

I hadn't generated one yet — here it is:
RanGenerate a random bearer token

Here's your token:

c14824b76b04679aa52da71b65e2694d0f33a5c78bcce9ea7b8f849fc5ef953b

Use this exact string in two places (they must match):

    Vercel → claude-code project → Settings → Environment Variables → MCP_BEARER_TOKEN = the string above → Save → Redeploy
    Your MCP client → Authorization: Bearer c14824b76b04679aa52da71b65e2694d0f33a5c78bcce9ea7b8f849fc5ef953b

Two cautions:

    Treat it like a password — anyone with it can hit your PMS endpoint. Now that it's appeared in this chat, generate a fresh one for real production use (just rerun openssl rand -hex 32) rather than relying on this one long-term.
    It's only half the picture — the deployed server also needs CLOUDBEDS_API_KEY set in Vercel, or tool calls return Cloudbeds auth errors even after the bearer check passes.

Want me to generate a separate token for a different environment, or are you set?

redeploy

https://developers.cloudbeds.com/reference/post_access-token-2 has information is this it?

That page is the OAuth 2.0 token endpoint — it's a different (and heavier) auth path than the self-service API key. Let me confirm against the spec I pulled earlier so I'm precise.
RanInspect access_token endpoint in spec

Confirmed from the spec — and the short answer is: not the easy path for you.

That page (/access_token) is the OAuth token endpoint. You don't get a credential by visiting it — it's the programmatic call you make at the end of an OAuth flow. Per the spec, it requires client_id, client_secret, redirect_uri, and a code, which means you'd first have to:

    Register an OAuth app (to get client_id + client_secret)
    Send a property admin through the authorize screen to grant access → receive a code
    POST that code here to exchange it for an access_token (+ refresh_token)

The result of that exchange would go in CLOUDBEDS_ACCESS_TOKEN (my server supports it as the alternative auth).
Which path you actually want
	Self-service API key	OAuth (this page)
Where	Cloudbeds UI → API Credentials	Register app + token exchange
Effort	Click, copy, done	Build the auth-code flow
Server var	CLOUDBEDS_API_KEY	CLOUDBEDS_ACCESS_TOKEN
Best for	Your own properties (you)	Marketplace apps serving other hotels

Since this is your PMS and an internal server, go with the self-service API key — skip OAuth entirely. It's a single string you paste into CLOUDBEDS_API_KEY. No client_id/code/exchange needed.

One nuance from the spec: that same endpoint can also "automatically deliver" an API key via a special grant type — but it still requires a registered app (client_id/client_secret/code). So it's not a shortcut; the UI-generated self-service key is.

You've got the developers site open — look for API Credentials / API Keys under your account or property settings (not the OAuth/Apps section). That's the page that hands you a key directly. Want me to pull the current Cloudbeds self-service-key doc to confirm the exact menu path?

yes

Confirmed the exact path. Here are the real menu clicks:
Generate a self-service API key in Cloudbeds

    Sign in at signin.cloudbeds.com
    Account → Apps & Marketplace
    Top menu → API Credentials page → click + New Credentials
    Pick the category that best matches the use, put https://localhost in Redirect URI, click Save
        It shows you a Client ID + Shared Secret — ignore those (those are for OAuth; you don't need them for an API key)
    Select your new entry in the API Credentials table, scroll right to the API Key column, click Create
    Check the scopes you need, then Create:
        Reads: read:hotel, read:reservation, read:guest, read:room, read:rate, read:dashboard, read:item, read:payment
        Writes (only if enabling write tools): write:reservation, write:payment
    Choose properties — toggle "Connect all properties" to get one key covering all 8 Stayable properties (otherwise pick specific ones)
    Copy the key now — it's shown once and can't be viewed again

That string → CLOUDBEDS_API_KEY in Vercel.

For your 8 properties: use "Connect all properties" in step 7 → single key, and the server passes propertyID/propertyIDs per call (run list_properties first to get the real Cloudbeds IDs).

Sources:

    Quickstart – API Authentication for property-level users (Cloudbeds)
    Apps and Integrations – Self-service API (Cloudbeds)
    Property and Group Account API Access (Cloudbeds)

Once you've created it and added it to Vercel (Preview + Production scope), the deployed endpoint will be fully functional. Want me to merge PR #8 to main now so production is live and ready for the key?

cbat_LiIJ4VqGhckV80QvB91yRiFcPoRmeiT6 is for 812

Quick heads-up first: that key is a live secret and it's now in this chat. I won't put it in the repo or any committed file. Once it's set up in Vercel, rotate it (regenerate in Cloudbeds) so the exposed copy is dead. Also note 812 = Jacksonville North, and this key looks single-property — you'll want "Connect all properties" (or 8 keys) for the full portfolio later.

Let me try to validate it against Cloudbeds directly (read-only getHotels) to confirm it works and see its scopes — though this sandbox may block outbound to Cloudbeds:
RanValidate Cloudbeds key with getHotels

Same wall — this sandbox's network allowlist blocks api.cloudbeds.com too (Host not in allowlist), just like Vercel. So I can't validate or install the key from here. Both the testing and the env-var setting have to happen where there's real network access: your machine and the Vercel dashboard.

Here's exactly what to do:
1. Validate the key (run in your terminal, not here)

curl "https://api.cloudbeds.com/api/v1.2/getHotels" \
  -H "x-api-key: cbat_LiIJ4VqGhckV80QvB91yRiFcPoRmeiT6"

    Returns Jacksonville North (812) → key works.
    403/scope error → the key is missing scopes (regenerate with the read scopes listed earlier).

2. Add it to Vercel

Vercel → claude-code → Settings → Environment Variables:

    CLOUDBEDS_API_KEY = cbat_LiIJ4VqGhckV80QvB91yRiFcPoRmeiT6
    Scope: Production + Preview (check both)
    Confirm MCP_BEARER_TOKEN is also scoped to both
    Redeploy (env vars only apply to new builds)

Notes

    Single-property key (812 only). Tools will work but only return Jacksonville North data. For all 8, regenerate with "Connect all properties" and you'll get one key for the portfolio.
    Rotate it after setup — it's been exposed in this chat.
    This still won't be reachable by an external MCP client until you turn off Deployment Protection for the deployment (that's the 403 an outside client hits before our auth).

Two open items I can act on once you're ready: merge PR #8 to main (makes production deploy live), and mark the PR ready for review. Want me to do either?

there was no all properties selection

That toggle only appears for group / organization-level credentials. Its absence means you created the key from a single property's account (812), not from a group account — so Cloudbeds only offered that one property.

Which path applies depends on how your 8 properties are structured in Cloudbeds, and I can't see that from here:

    If they're one group/organization account → you can generate a single all-properties key, but you have to create it from the group account (or a login with group-level access), not from inside property 812. Then the current server works as-is (one key, pass propertyID).
    If they're 8 separate property accounts → there's no group key; you'd get one key per property (8 keys), and the server needs to map each propertyID to its own key. That's a code change I'd make.

A quick tell: in Apps & Marketplace → API Credentials, if you can switch between properties or see all 8 listed, it's a group account. If you only ever see 812, they're separate.
AskedAccount setup
AskedAccount setup

How are your 8 Stayable properties structured in Cloudbeds — and how should I set up the key(s)?

8 separate accounts

cbat_LiIJ4VqGhckV80QvB91yRiFcPoRmeiT6 is 2535

Got it — 8 separate Cloudbeds accounts means 8 keys, and the server has to pick the right key per propertyID. I'll add a per-property key registry: set CLOUDBEDS_API_KEY_<propertyID> (e.g. CLOUDBEDS_API_KEY_812) and each tool call routes to the matching key. A single CLOUDBEDS_API_KEY still works as a fallback (covers your "just 812 for now" case).

Let me build it. First the registry in the client:
Editedcloudbeds.ts+81-1

Noted — correction logged: cbat_LiIJ4VqGhckV80QvB91yRiFcPoRmeiT6 is 2535 (St. Augustine), not 812. So that key goes in CLOUDBEDS_API_KEY_2535. (Still treat it as exposed → rotate after setup.)

Continuing the build — now rewiring the tools to route through the registry:

Now update the route to build the registry, and the .env.example:

Now build and smoke-test with two per-property keys to confirm routing:
RanBuild after registry refactor

Build's clean. Let me unit-test the registry routing logic (network to Cloudbeds is blocked, but I can verify key resolution/error paths directly):

cbat_LiIJ4VqGhckV80QvB91yRiFcPoRmeiT6 is 5399
RanUnit-test registry resolution

Re-noted — the key is now 5399 (Kissimmee West). (For the same string you've said 812 → 2535 → 5399; I'll use the latest, 5399. Tell me if a different one sticks.) The registry handles whichever ID you settle on — env var CLOUDBEDS_API_KEY_5399.

Test failed only on path (ran from /tmp). Re-running from the package dir:
RanRun registry unit test from package dir

All registry routing tests pass — keys resolve per property, helpful errors when ambiguous/missing, fallback works. Let me mirror this into the stdio package so both don't diverge, then commit. Reading the current stdio files:

Now create the shared tools.ts for the stdio package and slim its index.ts:

Build the stdio package and verify it still registers all tools:
RanBuild and verify stdio package

Both packages: clean build, all 15 tools register. Let me update the docs for per-property keys, then commit.

Now commit both packages and push (which also triggers a fresh preview build):
Pushedclaude/serene-clarke-S0kHP

Pushed (4da98c9). Let me confirm the new build goes green:

Building. Let me check the final state:
Used Vercel: get deployment

Per-property key support is built, tested, and pushed (4da98c9) — both packages build and register all 15 tools, and the registry routing is unit-tested (resolves per propertyID, errors helpfully when ambiguous/missing, falls back to a single key).

The new preview build is currently BUILDING (Next.js detected, same path as the build that already went green). I'll confirm READY once the build timer fires.

What changed for you:

    Set one env var per property: CLOUDBEDS_API_KEY_5399, CLOUDBEDS_API_KEY_812, etc. (one per Cloudbeds account)
    Each tool call routes to the key matching its propertyID
    list_properties fans out across all your keys and shows which Cloudbeds property each resolves to — so you can verify the ID mapping (useful given you've been pinning down which key is which)

So for the key you have now, set CLOUDBEDS_API_KEY_5399 in Vercel (Preview + Production), and calls with propertyID: "5399" will use it.

I'll report back when the build confirms green.

The wait timer fired — checking the build result now:
Used Vercel: get deployment

✅ READY — green build with the per-property registry. Endpoint:

https://claude-code-git-claude-serene-clarke-s0khp-rbeyer999s-projects.vercel.app/api/mcp

To make it live for a client, in Vercel (Preview + Production scope):

    CLOUDBEDS_API_KEY_5399 = cbat_LiIJ4VqGhckV80QvB91yRiFcPoRmeiT6
    MCP_BEARER_TOKEN = your token
    Redeploy (env vars apply to new builds only)
    Settings → Deployment Protection → disable for Preview (otherwise external clients hit Vercel's 403 before our auth)

Then a call with propertyID: "5399" routes to that key. Run list_properties first — it'll confirm the key actually resolves to Kissimmee West (good, since the ID moved around).
Still open

    Merge PR #8 → main for the stable production URL (right now this is a per-branch preview). Want me to mark it ready and merge?
    Add the other 7 property keys when you have them (CLOUDBEDS_API_KEY_<id> each).
    Rotate cbat_…5399 after setup — it's been exposed in this chat.

Code's done and verified. Just say the word on the merge.
