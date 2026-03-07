import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AssigneeAvatarTooltip } from "./assignee-avatar-tooltip.js";

test("AssigneeAvatarTooltip renders themed tooltip wrapper and avatar", () => {
  const markup = renderToStaticMarkup(
    React.createElement(AssigneeAvatarTooltip, {
      name: "Unassigned",
      avatar: null,
    }),
  );

  assert.match(markup, /data-slot="tooltip"/);
  assert.match(markup, /Unassigned assignee avatar/);
});
