import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveInitialProjectSelection,
  type ProjectSelectorItem,
} from "./project-selector-init.js";

const PROJECTS: ProjectSelectorItem[] = [
  { id: "p1", key: "P1", name: "Project 1", is_default: false },
  { id: "p2", key: "P2", name: "Project 2", is_default: true },
  { id: "p3", key: "P3", name: "Project 3", is_default: false },
];

test("returns null when project list is empty", () => {
  const selection = resolveInitialProjectSelection({
    projects: [],
    selectedProjectIds: [],
    projectKeyFromUrl: null,
  });

  assert.equal(selection, null);
});

test("returns null when project is already selected", () => {
  const selection = resolveInitialProjectSelection({
    projects: PROJECTS,
    selectedProjectIds: ["p1"],
    projectKeyFromUrl: null,
  });

  assert.equal(selection, null);
});

test("prefers matching URL project over default project", () => {
  const selection = resolveInitialProjectSelection({
    projects: PROJECTS,
    selectedProjectIds: [],
    projectKeyFromUrl: "P1",
  });

  assert.equal(selection?.targetProject.id, "p1");
  assert.equal(selection?.shouldUpdateUrl, false);
});

test("falls back to default project when URL param is missing", () => {
  const selection = resolveInitialProjectSelection({
    projects: PROJECTS,
    selectedProjectIds: [],
    projectKeyFromUrl: null,
  });

  assert.equal(selection?.targetProject.id, "p2");
  assert.equal(selection?.shouldUpdateUrl, true);
});

test("falls back to first project when no default exists", () => {
  const nonDefaultProjects: ProjectSelectorItem[] = [
    { id: "p1", key: "P1", name: "Project 1", is_default: false },
    { id: "p2", key: "P2", name: "Project 2", is_default: false },
  ];

  const selection = resolveInitialProjectSelection({
    projects: nonDefaultProjects,
    selectedProjectIds: [],
    projectKeyFromUrl: null,
  });

  assert.equal(selection?.targetProject.id, "p1");
  assert.equal(selection?.shouldUpdateUrl, true);
});

test("uses default project when URL key does not match any project", () => {
  const selection = resolveInitialProjectSelection({
    projects: PROJECTS,
    selectedProjectIds: [],
    projectKeyFromUrl: "UNKNOWN",
  });

  assert.equal(selection?.targetProject.id, "p2");
  assert.equal(selection?.shouldUpdateUrl, true);
});

