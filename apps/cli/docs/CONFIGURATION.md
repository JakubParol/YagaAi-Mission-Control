# Configuration

Configuration model for Mission Control CLI.

## Precedence

1. CLI flags
2. Environment variables
3. Defaults

## Environment Variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `MC_API_BASE_URL` | no | `http://127.0.0.1:8080` | Base URL for Mission Control API |
| `MC_ACTOR_ID` | no | — | Actor identity value sent in headers |
| `MC_ACTOR_TYPE` | no | `user` | Actor type sent in headers |
| `MC_OUTPUT` | no | `table` | Output mode: `table` or `json` |
| `MC_TIMEOUT_SECONDS` | no | `30` | HTTP request timeout |

## HTTP Contract Alignment

- Response and error handling must follow the envelope documented in:
  - `services/api/docs/API_CONTRACTS.md`
- CLI should expose API `code` and `message` from error responses.

## Headers

Exact auth model is defined in API docs; CLI supports passing actor/auth headers via `--actor-id` / `--actor-type` flags or `MC_ACTOR_ID` / `MC_ACTOR_TYPE` env vars without embedding policy logic.

## Output and Exit Codes

- `0`: success
- `1`: CLI usage/validation error
- `2`: API returned non-2xx response
- `3`: network/timeout/transport error

## Navigation

- ↑ [docs/INDEX.md](./INDEX.md)
- ↑ [COMMANDS_V1.md](./COMMANDS_V1.md)
