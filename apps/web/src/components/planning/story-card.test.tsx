import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { StoryCard } from "./story-card.js";

function baseStory() {
  return {
    id: "story-1",
    key: "MC-303",
    title: "Web: Hover-only More actions on Work Item cards",
    status: "TODO" as const,
    priority: null,
    story_type: "USER_STORY",
    epic_key: "MC-44",
    epic_title: "Web Early Access",
    position: 0,
    task_count: 0,
    done_task_count: 0,
    labels: [],
    label_ids: [],
  };
}

test("StoryCard keeps hover-only actions and required line clamps", () => {
  const markup = renderToStaticMarkup(
    React.createElement(StoryCard, {
      story: baseStory(),
      actions: React.createElement("button", { type: "button" }, "Actions"),
    }),
  );

  assert.match(markup, /absolute right-2 top-2 opacity-0 pointer-events-none/);
  assert.match(markup, /line-clamp-2/);
  assert.match(markup, /line-clamp-1/);
  assert.match(markup, /MC-44 Web Early Access/);
});

test("StoryCard metadata row follows type+key then story points and unassigned slot", () => {
  const markup = renderToStaticMarkup(
    React.createElement(StoryCard, {
      story: baseStory(),
    }),
  );

  assert.match(markup, /data-testid="story-card-metadata-row"/);
  assert.match(markup, /MC-303/);
  assert.match(markup, /title="Story points"/);
  assert.match(markup, /title="Unassigned"/);
});

test("StoryCard renders assignee avatar with initials fallback when assignee has no image", () => {
  const markup = renderToStaticMarkup(
    React.createElement(StoryCard, {
      story: {
        ...baseStory(),
        assignee: {
          name: "Alice",
          last_name: "Builder",
          initials: "AB",
          avatar: null,
        },
      },
    }),
  );

  assert.match(markup, /Alice assignee avatar/);
  assert.match(markup, />AB</);
});
