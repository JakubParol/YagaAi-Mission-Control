# MC-416 — Orchestration Timeline Failure Triage Walkthrough

## Scope

Route: `/planning/timeline`

Goal: enable operators to triage a failed/stuck orchestration run without direct DB or queue access.

## Walkthrough: dead-letter investigation

1. Open `Planning -> Timeline`.
2. In `Status`, select `Failed`.
3. In `Failure category`, select `Dead-letter transitions`.
4. (Optional) Set `From/To` window around the incident time.
5. Select the target run from the left `Runs` stream.
6. In `Lifecycle events`, click `orchestration.delivery.dead_lettered`.
7. Use copy actions in drill-down to copy:
- `Correlation ID`
- `Causation ID`
8. Review `Reason` and `Payload` fields for retry/max-attempt evidence.

Expected result:
- dead-letter rows are visually marked and filterable,
- correlation/causation IDs are visible and copyable,
- payload/reason provide enough context for incident ticket and replay decision.

## Walkthrough: watchdog retry triage

1. Keep run selected.
2. Set `Failure category` to `Watchdog actions`.
3. Inspect `orchestration.watchdog.action` events and their reason code/message.
4. Switch to `Retry transitions` to inspect generated retry scheduling rows.
5. Compare timestamps in timeline rows to detect heartbeat-loss cadence.

## Troubleshooting hints

- If the page shows `Timeline feed unavailable`, verify API health and worker connectivity.
- If no runs are visible, clear `run_id`/time filters and refresh.
- If no events are visible for a selected run, widen the time range and refresh.

## Navigation

- ↑ [docs/INDEX.md](./INDEX.md)
- ↑ [AGENTS.md](../AGENTS.md)
