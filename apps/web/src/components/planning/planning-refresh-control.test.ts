import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  PlanningRefreshControl,
  runPlanningRefresh,
  type PlanningRefreshState,
} from "./planning-refresh-control.js";

test("runPlanningRefresh enters loading before refresh promise resolves", async () => {
  const states: PlanningRefreshState[] = [];
  let resolveRefresh: (() => void) | undefined;

  const refreshPromise = runPlanningRefresh(
    () =>
      new Promise<void>((resolve) => {
        resolveRefresh = resolve;
      }),
    (next) => {
      states.push(next);
    },
    () => 123,
  );

  assert.equal(states.length, 1);
  assert.equal(states[0]?.phase, "loading");

  assert.ok(resolveRefresh, "Refresh resolver should be assigned");
  resolveRefresh();
  await refreshPromise;

  assert.equal(states.at(-1)?.phase, "success");
  assert.equal(states.at(-1)?.refreshedAt, 123);
});

test("runPlanningRefresh captures error path and rethrows", async () => {
  const states: PlanningRefreshState[] = [];

  await assert.rejects(
    () =>
      runPlanningRefresh(
        async () => {
          throw new Error("API 503");
        },
        (next) => {
          states.push(next);
        },
      ),
    /API 503/,
  );

  assert.equal(states[0]?.phase, "loading");
  assert.equal(states[1]?.phase, "error");
  assert.equal(states[1]?.errorMessage, "API 503");
});

test("PlanningRefreshControl renders disabled state when refresh is unavailable", () => {
  const markup = renderToStaticMarkup(
    React.createElement(PlanningRefreshControl, {
      onRefresh: async () => {},
      disabled: true,
      disabledReason: "Select project",
    }),
  );

  assert.match(markup, /disabled/);
  assert.match(markup, /Select project/);
  assert.match(markup, /Refresh view/);
});
