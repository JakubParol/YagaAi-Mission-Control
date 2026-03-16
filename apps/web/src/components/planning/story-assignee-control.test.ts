import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  StoryAssigneeControl,
  isUnassignedSelection,
  type StoryAssigneeSelection,
} from "./story-assignee-control.js";

const UNASSIGNED: StoryAssigneeSelection = {
  assignee_agent_id: null,
  assignee_name: null,
  assignee_last_name: null,
  assignee_initials: null,
  assignee_avatar: null,
};

test("StoryAssigneeControl renders a direct combobox trigger for one-step selection", () => {
  const markup = renderToStaticMarkup(
    React.createElement(StoryAssigneeControl, {
      storyId: "story-1",
      currentAssignee: UNASSIGNED,
      assigneeOptions: [
        {
          id: "naomi",
          name: "Naomi",
          last_name: "N",
          initials: "NN",
          role: "Engineer",
          avatar: null,
        },
      ],
      onChange: () => {},
    }),
  );

  assert.match(markup, /role="combobox"/);
  assert.match(markup, /Current assignee: Unassigned/);
  assert.doesNotMatch(markup, />Assignee</);
});

test("isUnassignedSelection only treats a fully empty assignee as unassigned", () => {
  assert.equal(isUnassignedSelection(UNASSIGNED), true);
  assert.equal(
    isUnassignedSelection({
      assignee_agent_id: "naomi",
      assignee_name: "Naomi",
      assignee_last_name: "N",
      assignee_initials: "NN",
      assignee_avatar: null,
    }),
    false,
  );
});
