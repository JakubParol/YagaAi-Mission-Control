import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { Avatar, buildAvatarFallbackText } from "./avatar.js";

test("buildAvatarFallbackText applies fallback precedence", () => {
  assert.equal(buildAvatarFallbackText("alice", "zephyr", "az"), "AZ");
  assert.equal(buildAvatarFallbackText("alice", "zephyr", null), "AZ");
  assert.equal(buildAvatarFallbackText("alice"), "A");
  assert.equal(buildAvatarFallbackText("  bob"), "B");
  assert.equal(buildAvatarFallbackText(""), "?");
  assert.equal(buildAvatarFallbackText(null), "?");
});

test("Avatar renders image when source is provided", () => {
  const markup = renderToStaticMarkup(
    React.createElement(Avatar, {
      src: "https://cdn.example.com/alice.png",
      name: "Alice",
    }),
  );

  assert.match(markup, /<img/);
  assert.match(markup, /alice\.png/);
});

test("Avatar renders fallback text when source is missing", () => {
  const markup = renderToStaticMarkup(
    React.createElement(Avatar, {
      src: null,
      name: "Alice",
    }),
  );

  assert.doesNotMatch(markup, /<img/);
  assert.match(markup, />A</);
});
