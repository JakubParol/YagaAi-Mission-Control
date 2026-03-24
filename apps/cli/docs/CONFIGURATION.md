# Configuration

Configuration model for Mission Control CLI.

## Execution Profiles

Three wrappers are installed by `install.sh`:

| Wrapper | Target | Write-safe |
|---|---|---|
| `mc-dev` | DEV API (`http://127.0.0.1:5000`) | yes |
| `mc-prod` | PROD API (`http://127.0.0.1:5100`) | yes |
| `mc` | none (falls back to `http://127.0.0.1:5000` for reads) | **no** — write operations require explicit target |

Bare `mc` blocks POST/PATCH/DELETE unless `MC_API_BASE_URL` or `--api-base` is set. This prevents accidental writes to PROD from unconfigured shells.

For agent execution, the execution profile (DEV or PROD) is determined per work item by the dispatch/runtime context — not by agent identity. The dispatch layer passes the target environment in the delivery contract, and the assigned agent uses `mc-dev` or `mc-prod` accordingly.

## Precedence

1. CLI flags
2. Environment variables
3. Defaults

## Environment Variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `MC_API_BASE_URL` | no | `http://127.0.0.1:5000` | Base URL for Mission Control API |
| `MC_ACTOR_ID` | no | — | Actor identity value sent in headers |
| `MC_ACTOR_TYPE` | no | `user` | Actor type sent in headers |
| `MC_OUTPUT` | no | `table` | Output mode: `table` or `json` |
| `MC_TIMEOUT_SECONDS` | no | `30` | HTTP request timeout |

When `MC_API_BASE_URL` is unset and `--api-base` is not passed, the CLI treats the API target as **implicit**. Reads still work (using the default), but writes fail with an actionable error.

## HTTP Contract Alignment

- Response and error handling must follow the envelope documented in:
  - `services/api/docs/API_CONTRACTS.md`
- CLI should expose API `code` and `message` from error responses.

## Headers

Exact auth model is defined in API docs; CLI supports passing actor/auth headers via `--actor-id` / `--actor-type` flags or `MC_ACTOR_ID` / `MC_ACTOR_TYPE` env vars without embedding policy logic.

## Output and Exit Codes

- `0`: success
- `1`: CLI usage/validation error (including write-guard rejection)
- `2`: API returned non-2xx response
- `3`: network/timeout/transport error

## Navigation

- ↑ [docs/INDEX.md](./INDEX.md)
- ↑ [COMMANDS_V1.md](./COMMANDS_V1.md)
