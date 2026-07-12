<p align="center">
  <img src="web/public/meergate_mascot.png" alt="MeerGate" width="128" />
</p>

<h1 align="center">MeerGate</h1>

<p align="center">
  <b>Open-source API release confidence — self-host it in one command.</b>
</p>

<p align="center">
  Test your <b>REST, gRPC, WebSocket & browser</b> flows, track coverage, and gate every
  release on one clear answer: <b>ready</b> or <b>blocked</b>.
</p>

<p align="center">
  <img src="https://img.shields.io/github/stars/hasimyerli/meergate?style=flat&color=0a7d42" alt="Stars" />
  <img src="https://img.shields.io/github/last-commit/hasimyerli/meergate?color=0a7d42" alt="Last commit" />
  <img src="https://img.shields.io/badge/Go-1.26-00ADD8?logo=go&logoColor=white" alt="Go 1.26" />
  <img src="https://img.shields.io/badge/Next.js-15-000000?logo=nextdotjs" alt="Next.js 15" />
  <img src="https://img.shields.io/badge/self--hosted-✓-0a7d42" alt="Self-hosted" />
  <img src="https://img.shields.io/badge/license-AGPL--3.0-0a7d42" alt="License: AGPL-3.0" />
</p>

<p align="center">
  <a href="#quick-start"><b>Quick start</b></a> ·
  <a href="#the-release-gate--ship-on-evidence-not-vibes">Release gate</a> ·
  <a href="#rule--test--evidence">Differentiator</a> ·
  <a href="#how-it-works">How it works</a> ·
  <a href="#configuration">Config</a> ·
  <a href="#cloud">Cloud</a>
</p>

---

<p align="center">
  <img src="img/builder.png?v=2" alt="MeerGate builder — describe a test in plain language, build it visually, run it across protocols" width="840" />
</p>

<p align="center"><sub><i>Describe a test in plain language, refine it on the visual builder, run it across every protocol.</i></sub></p>

---

## Quick start

**Prerequisites:** [Docker](https://docs.docker.com/get-docker/) (that's all you need to run it). For local development instead: **Go 1.26**, **Node 20**, **pnpm 9**.

Run the whole platform in ~2 minutes — Postgres, API, UI and a demo exchange in one command:

```bash
git clone https://github.com/hasimyerli/meergate.git
cd meergate
cp .env.example .env      # set DEFAULT_ADMIN_PASSWORD (and JWT_SECRET) — see Configuration
make up                   # or: docker compose up --build
```

Open **http://localhost:3000**, log in with your admin credentials, and you're running the full app locally — your data never leaves your machine.

| Port | Service |
|------|---------|
| **3000** | Web UI (Next.js) |
| **3001** | API (Go — REST + WebSocket) |
| **4010** | `mock-exchange` — a demo API to try MeerGate against |
| **5432** | PostgreSQL |

> **Developing?** `make dev` runs everything locally with hot reload — Postgres + API (`:3001`) + Next.js (`:3000`) + `mock-exchange` (`:4010`); `Ctrl+C` stops all. Each folder also runs on its own (`cd api && make dev`, `cd web && make dev`, …).

---

## What is MeerGate?

MeerGate is a self-hosted platform for testing APIs — and knowing whether a release is safe to ship.

It goes beyond running tests: it **pulls your live API surface inward** (auto-discovers every gRPC service via reflection and every REST API via OpenAPI), shows you **what's tested and what's a risky gap**, lets you **author tests three ways** (plain-language AI, a drag-and-drop DAG builder, or YAML), and runs a **release gate** for each service that compares a candidate against the last known-good baseline and flags regressions.

One binary-simple stack. Your infra, your network, your data.

---

## Why MeerGate?

Most test tools answer *"how many tests passed?"* — a number that doesn't tell you if **this** release broke anything.

```
Old question:   "How many tests do we have?"
MeerGate:       "Can we ship this service safely?"
```

Engineers, QA and PMs all read the same signal per service: **green or red.**

---

## The release gate — ship on evidence, not vibes

This is the payoff. For every service, MeerGate turns a pile of test runs into **one decision, backed by evidence**: it runs a release candidate, compares it to the last known-good **baseline**, surfaces exactly what changed, and returns a verdict.

<p align="center">
  <img src="img/gaterelease.png?v=2" alt="MeerGate release gate — Ready to ship, no new regressions since baseline, still-passing count, service health and coverage" width="620" />
</p>

- **Candidate → baseline → regression diff** — not just *"3 tests failed,"* but *"this release introduced a new regression"* vs *"known failure / fixed / still passing."*
- **Real & persisted** — baselines and verdicts are stored, never faked. No data yet? You get an honest **"No baseline yet,"** never a made-up number.
- **One status per service:** `ready` · `blocked` · `no_baseline`.

Not *"I wrote a test."* → **"You can ship this service, and here's the evidence."**

---

## Rule → Test → Evidence

Plenty of tools generate tests. MeerGate's edge is running the **whole chain end-to-end**, so a release decision rests on proof:

| | | |
|---|---|---|
| **Rule** | what should be true | the contract from your changed service surface — endpoints, status codes, invariants |
| **Test** | how we verify it | a runnable manifest — `apiCall`, `grpcCall`, chained extracts, assertions, DAG-ordered |
| **Evidence** | the proof to ship | executed, compared to baseline, regressions surfaced — the dossier behind the gate |

---

## Features

*Everything to validate an API — end to end.*

| # | Feature | What it does | Built on |
|---|---------|--------------|----------|
| 01 | **See your whole API surface** | Auto-discovery brings every service and operation into one catalog. | gRPC reflection · OpenAPI / Swagger |
| 02 | **Know what's untested** | Operation-level coverage shows exactly which endpoints are risky gaps. | per-service coverage map |
| 03 | **Author tests three ways** | Describe it in plain language, drag it together visually, or write YAML. | AI · ReactFlow DAG builder · YAML |
| 04 | **Run anything, anywhere** | Multi-step flows across protocols, with dependencies, retries and resume. | REST · gRPC · WebSocket · Browser |
| 05 | **Catch regressions** | Baseline comparison flags exactly what a release broke — not just what failed. | candidate vs baseline diff |
| 06 | **Stay ahead** | Alerts on failures, pass-rate trends and flaky-test detection. | rules · incidents · insights |

No fake data — missing data shows an honest empty state, never a made-up number.

---

## How it works

*From a live endpoint to a release decision — four steps, most of them automated.*

1. **Connect & discover** — Point MeerGate at a gRPC host or an OpenAPI doc. It pulls in every service and operation — no manual list.
2. **See coverage** — A live map of what's tested and what's a risky, untested gap.
3. **Author & run** — Generate tests with AI, a visual builder, or YAML — then run them across every protocol and watch each step live.
4. **Release gate** — Create a release candidate, compare it to the baseline, get a verdict: **Ready** or **Blocked**.

### Your first run (with the built-in demo)

The stack ships with `mock-exchange` — a tiny demo API (login, wallet, buy/sell) so you can try MeerGate immediately:

1. **Service Catalog → Connect Service** (REST). Target + Swagger:
   - Running via `make up` (Docker): `http://mock-exchange:4010` and `http://mock-exchange:4010/openapi.json`
   - Running via `make dev` (local): `http://localhost:4010` and `http://localhost:4010/openapi.json`
   > Inside Docker, services reach each other by name (`mock-exchange`), not `localhost`.
2. **Sync** — its operations are discovered into the catalog.
3. **Author a test** (AI, builder or YAML), then **Run** it — a login → buy → assert-balance flow works out of the box.
4. **Release Gates** — create a candidate, evaluate, and read the verdict.

---

## AI-assisted

Describe a test in plain language — MeerGate writes the multi-step, multi-protocol test, then runs it through a release gate. (AI accelerates authoring and triage; the catalog, engine and gates work without it.)

- **Author with AI** — plain language → a runnable test. Switch between AI, the visual DAG builder and YAML anytime; they're the same test.
- **Bring your own AI key** — connect your own OpenAI / Anthropic key from **Settings**. Your key, your usage, your data.
- **MCP server included** — drive MeerGate from **Claude Desktop, Cursor, Claude Code** or any MCP client (see [`mcp/`](mcp)): *"list my tests"*, *"run the payments gate"*, *"generate a test for POST /orders."*

<details>
<summary><b>Connect the MCP server</b></summary>

The MCP server is stdio-based — a client spawns it on demand. Point your client at it (e.g. a project `.mcp.json`), with the API running:

```jsonc
{
  "mcpServers": {
    "meergate": {
      "command": "npx",
      "args": ["tsx", "<repo>/mcp/src/index.ts"],
      "env": {
        "API_URL": "http://localhost:3001",
        "API_USERNAME": "admin",
        "API_PASSWORD": "<your admin password>"
      }
    }
  }
}
```

Run `cd mcp && npm install` once first. Without credentials, use the `mcp_login` tool.
</details>

---

## Configuration

Copy `.env.example` to `.env`. The essentials:

| Variable | What | Notes |
|----------|------|-------|
| `DATABASE_URL` | PostgreSQL DSN | set by compose; override for external DB |
| `JWT_SECRET` | auth token secret | **required** — `openssl rand -hex 32` |
| `DEFAULT_ADMIN_USERNAME` / `DEFAULT_ADMIN_PASSWORD` | first-run admin seed | **password required** — no admin is created if empty (no insecure default) |
| `API_PORT` · `API_HOST` | API bind | default `3001` / `0.0.0.0` |
| `MAX_CONCURRENCY` | max tests running at once | default `3` |
| `DEFAULT_STEP_TIMEOUT_MS` · `DEFAULT_WS_TIMEOUT_MS` | step / WebSocket timeouts | |
| `AI_PROVIDER` | `anthropic` \| `openai` \| `cursor-cli` | leave AI keys empty to run without AI |
| `AI_ANTHROPIC_API_KEY` / `AI_API_KEY` · `AI_API_URL` · `AI_MODEL` | LLM backend | your key, your usage |
| `LOG_LEVEL` | `debug` \| `info` \| … | |

---

## Project structure

A flat **monorepo** — each part is self-contained (its own `Dockerfile` + `Makefile`), can run on its own, and is extractable to its own repo later. They talk over HTTP/WS, never in-process.

```
api/            Go API — REST + WebSocket (:3001), Postgres, JWT auth
engine/         Standalone Go test engine (its own module) — the API calls it as a tool
web/            Next.js UI (:3000)
mcp/            MCP server for AI clients (Claude Desktop, Cursor…)
mock-exchange/  Dependency-free demo API (:4010) to try MeerGate against
docs/           Architecture & engine docs
Makefile · compose.yml   root orchestration (make up = whole stack)
```

---

## Tech stack

**Go 1.26** · Chi · pgx/v5 · chromedp · gRPC reflection · OpenAPI &nbsp;|&nbsp; **Next.js 15** · React 19 · Tailwind · ReactFlow &nbsp;|&nbsp; **PostgreSQL 16**

The Go server is an **API only** (`:3001`); Next.js serves the UI (`:3000`) and proxies `/api` to it — separate containers, wired together by `compose.yml`. The test engine (in `engine/`) is a standalone Go module the API embeds. Migrations run automatically on API startup.

---

## Contributing

MeerGate is early and self-hostable today — issues, ideas and PRs are very welcome. Found a bug or want a feature? [Open an issue](https://github.com/hasimyerli/meergate/issues) and let's talk.

```bash
make dev      # whole stack locally, hot reload (Ctrl+C stops all)
make up       # whole stack in Docker
make test     # go test across the api + engine modules
```

<sub><b>Ports busy?</b> `5432` is often a local Postgres — stop it or remap. <b>Web can't reach the API in Docker?</b> the UI proxy targets the `api` service, not `localhost`. <b>HMR wedged?</b> stop, then `rm -rf web/.next`.</sub>

---

## Cloud

MeerGate is **fully usable self-hosted, for free** — that's this repo.

A managed **Cloud** (isolated workspace per company, pick your region & runner, zero infra to run) is in the works. Don't want to self-host? **[Join the waitlist →](https://www.meergate.com)**

---

## License

MeerGate is licensed under the **[GNU AGPL-3.0](LICENSE)** — free to use, self-host, and modify. If you run a modified version as a network service, you must make your source available to its users under the same license.

Copyright © 2026 Haşim Yerli.

**Commercial license** — need MeerGate without AGPL's copyleft obligations (e.g. to embed it in a closed-source product or ship it as a hosted service)? A separate commercial license is available; open an [issue](https://github.com/hasimyerli/meergate/issues) to get in touch.
