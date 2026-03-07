# MC-386 — Epic Overview Usability Check

Date: 2026-03-07
Scope: `/planning/epics-overview`
Method: Internal scenario walkthrough, keyboard + mouse interactions.

## Scenarios

1. Open epic context and inspect top stories
- Baseline flow (before split-view): click epic row expand, scan inline table, collapse, move to next row.
- New flow: select epic row, inspect right panel immediately, navigate to next epic via `j`.
- Result: from ~4 interactions to ~2 interactions per epic transition.

2. Update story status without navigation
- Baseline flow: open story details, change status, return to epic list.
- New flow: in split-view panel use inline status selector.
- Result: from ~5 interactions to ~2 interactions.

3. Add story to active sprint from epic context
- Baseline flow: open story page, open action menu, add to sprint.
- New flow: split-view panel button `Add to sprint`.
- Result: from ~5 interactions to ~2 interactions.

4. Focus filtering and continue scan
- Baseline flow: mouse click search field, type, mouse click next row.
- New flow: `/` focuses filter, type, `j/k` to move epics.
- Result: removes pointer context switches for repeated review.

## Outcome

- Click/key interaction count reduced in all tested scenarios.
- AC expectation for "less clicks" is satisfied in internal usability pass.
- Remaining risk: no external user study yet (only internal walkthrough).
