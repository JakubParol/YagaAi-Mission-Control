import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ListTodo } from "lucide-react";

import { PlanningTopShell } from "./planning-top-shell.js";

test("PlanningTopShell renders page identity and labels shell for accessibility", () => {
  const markup = renderToStaticMarkup(
    React.createElement(PlanningTopShell, {
      icon: ListTodo,
      title: "List",
      subtitle: "Unified project view",
    }),
  );

  assert.match(markup, /aria-label=\"List top shell\"/);
  assert.match(markup, />List</);
  assert.match(markup, />Unified project view</);
});

test("PlanningTopShell renders control and action slots", () => {
  const markup = renderToStaticMarkup(
    React.createElement(PlanningTopShell, {
      icon: ListTodo,
      title: "Backlog",
      controls: React.createElement("button", { type: "button" }, "Search"),
      actions: React.createElement("button", { type: "button" }, "Refresh"),
    }),
  );

  assert.match(markup, />Search</);
  assert.match(markup, />Refresh</);
});
