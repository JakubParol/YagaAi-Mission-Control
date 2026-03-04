import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AvatarOption } from "./avatar-option.js";

test("AvatarOption renders avatar image and name", () => {
  const markup = renderToStaticMarkup(
    React.createElement(AvatarOption, {
      name: "Alice",
      role: "reviewer",
      avatar: "https://cdn.example.com/alice.png",
    }),
  );

  assert.match(markup, /<img/);
  assert.match(markup, /Alice/);
  assert.match(markup, /reviewer/);
});

test("AvatarOption falls back to initials when avatar is missing", () => {
  const markup = renderToStaticMarkup(
    React.createElement(AvatarOption, {
      name: "Bob",
      role: null,
      avatar: null,
    }),
  );

  assert.doesNotMatch(markup, /<img/);
  assert.match(markup, />B</);
  assert.match(markup, /Bob/);
});

test("AvatarOption prioritizes explicit initials over derived values", () => {
  const markup = renderToStaticMarkup(
    React.createElement(AvatarOption, {
      name: "Bob",
      lastName: "Builder",
      initials: "bb",
      role: null,
      avatar: null,
    }),
  );

  assert.doesNotMatch(markup, /<img/);
  assert.match(markup, />BB</);
});

test("AvatarOption derives initials from name and last name when provided", () => {
  const markup = renderToStaticMarkup(
    React.createElement(AvatarOption, {
      name: "Bob",
      lastName: "Builder",
      role: null,
      avatar: null,
    }),
  );

  assert.doesNotMatch(markup, /<img/);
  assert.match(markup, />BB</);
});
