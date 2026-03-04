import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AssigneeAvatarTooltip } from "./assignee-avatar-tooltip.js";

test("AssigneeAvatarTooltip renders avatar and hidden tooltip label", () => {
  const markup = renderToStaticMarkup(
    React.createElement(AssigneeAvatarTooltip, {
      name: "Unassigned",
      avatar: null,
    }),
  );

  assert.match(markup, /role="tooltip"/);
  assert.match(markup, /Unassigned/);
});
