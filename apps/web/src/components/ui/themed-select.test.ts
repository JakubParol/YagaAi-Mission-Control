import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  ThemedSelect,
  findFirstEnabledOptionIndex,
  findLastEnabledOptionIndex,
  getHighlightIndexForKey,
  getNextEnabledOptionIndex,
  resolveInitialHighlightIndex,
  stopThemedSelectEventPropagation,
  type ThemedSelectOption,
} from "./themed-select.js";

const OPTIONS: readonly ThemedSelectOption[] = [
  { value: "api", label: "API" },
  { value: "cli", label: "CLI", disabled: true },
  { value: "web", label: "WEB" },
] as const;

test("renders combobox trigger with placeholder when no value selected", () => {
  const markup = renderToStaticMarkup(
    React.createElement(ThemedSelect, {
      value: "",
      options: OPTIONS,
      placeholder: "Select a label to attach",
      onValueChange: () => {},
    }),
  );

  assert.match(markup, /role="combobox"/);
  assert.match(markup, /Select a label to attach/);
  assert.match(markup, /aria-expanded="false"/);
});

test("renders custom selected value content when renderValue is provided", () => {
  const markup = renderToStaticMarkup(
    React.createElement(ThemedSelect, {
      value: "api",
      options: OPTIONS,
      placeholder: "Select",
      renderValue: (option: ThemedSelectOption) =>
        React.createElement("span", null, `Selected: ${option.label}`),
      onValueChange: () => {},
    }),
  );

  assert.match(markup, /Selected: API/);
});

test("resolveInitialHighlightIndex prioritizes selected option and falls back to first enabled", () => {
  assert.equal(resolveInitialHighlightIndex(OPTIONS, "web"), 2);
  assert.equal(resolveInitialHighlightIndex(OPTIONS, "cli"), 0);
  assert.equal(resolveInitialHighlightIndex(OPTIONS, ""), 0);
});

test("find enabled option helpers skip disabled options", () => {
  assert.equal(findFirstEnabledOptionIndex(OPTIONS), 0);
  assert.equal(findLastEnabledOptionIndex(OPTIONS), 2);
  assert.equal(getNextEnabledOptionIndex(OPTIONS, 0, 1), 2);
  assert.equal(getNextEnabledOptionIndex(OPTIONS, 2, -1), 0);
});

test("getHighlightIndexForKey supports arrow/home/end keyboard navigation", () => {
  assert.equal(getHighlightIndexForKey(OPTIONS, 0, "ArrowDown"), 2);
  assert.equal(getHighlightIndexForKey(OPTIONS, 2, "ArrowDown"), 0);
  assert.equal(getHighlightIndexForKey(OPTIONS, 2, "ArrowUp"), 0);
  assert.equal(getHighlightIndexForKey(OPTIONS, 2, "Home"), 0);
  assert.equal(getHighlightIndexForKey(OPTIONS, 0, "End"), 2);
});

test("stopThemedSelectEventPropagation prevents parent click handlers from seeing select interactions", () => {
  let stopped = false;

  stopThemedSelectEventPropagation({
    stopPropagation() {
      stopped = true;
    },
  });

  assert.equal(stopped, true);
});
