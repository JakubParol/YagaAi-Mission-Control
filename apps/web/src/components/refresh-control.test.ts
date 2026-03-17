import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { TooltipProvider } from "@radix-ui/react-tooltip";

import {
  RefreshControl,
  runRefresh,
  type RefreshState,
} from "./refresh-control.js";

test("runRefresh enters loading before refresh promise resolves", async () => {
  const states: RefreshState[] = [];
  let resolveRefresh: (() => void) | undefined;

  const refreshPromise = runRefresh(
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

test("runRefresh captures error path and rethrows", async () => {
  const states: RefreshState[] = [];

  await assert.rejects(
    () =>
      runRefresh(
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

test("RefreshControl renders disabled state when refresh is unavailable", () => {
  const markup = renderToStaticMarkup(
    React.createElement(
      TooltipProvider,
      null,
      React.createElement(RefreshControl, {
        onRefresh: async () => {},
        disabled: true,
        disabledReason: "Select project",
      }),
    ),
  );

  assert.match(markup, /disabled/);
  assert.match(markup, /Refresh view/);
});
