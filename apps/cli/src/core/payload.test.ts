import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { buildPayload, normalizeWorkItemPayload } from "./payload";
import { CliUsageError } from "./errors";

test("--set unescapes literal \\n to real newline", () => {
  const result = buildPayload({ sets: ["description=Line 1\\nLine 2"] });
  assert.equal(result.description, "Line 1\nLine 2");
});

test("--set unescapes literal \\t to real tab", () => {
  const result = buildPayload({ sets: ["notes=col1\\tcol2"] });
  assert.equal(result.notes, "col1\tcol2");
});

test("--set unescapes literal \\\\ to single backslash", () => {
  const result = buildPayload({ sets: ["path=C:\\\\Users\\\\me"] });
  assert.equal(result.path, "C:\\Users\\me");
});

test("--set preserves literal \\n inside mixed escape sequences", () => {
  const result = buildPayload({ sets: ["desc=a\\nb\\nc"] });
  assert.equal(result.desc, "a\nb\nc");
});

test("--set does not corrupt boolean values", () => {
  const result = buildPayload({ sets: ["flag=true"] });
  assert.equal(result.flag, true);
});

test("--set does not corrupt null values", () => {
  const result = buildPayload({ sets: ["avatar=null"] });
  assert.equal(result.avatar, null);
});

test("--set does not corrupt numeric values", () => {
  const result = buildPayload({ sets: ["count=42"] });
  assert.equal(result.count, 42);
});

test("--set does not corrupt JSON object values", () => {
  const result = buildPayload({ sets: ['meta={"key":"val"}'] });
  assert.deepEqual(result.meta, { key: "val" });
});

test("--set does not corrupt JSON array values", () => {
  const result = buildPayload({ sets: ["ids=[1,2,3]"] });
  assert.deepEqual(result.ids, [1, 2, 3]);
});

test("--set passes plain string without backslash unchanged", () => {
  const result = buildPayload({ sets: ["title=Hello World"] });
  assert.equal(result.title, "Hello World");
});

test("--set trailing backslash is preserved", () => {
  const result = buildPayload({ sets: ["val=end\\"] });
  assert.equal(result.val, "end\\");
});

test("--set unknown escape sequence preserves backslash", () => {
  const result = buildPayload({ sets: ["val=foo\\xbar"] });
  assert.equal(result.val, "foo\\xbar");
});

test("--set-file reads file content as field value", () => {
  const dir = mkdtempSync(join(tmpdir(), "mc-test-"));
  const filePath = join(dir, "desc.txt");
  writeFileSync(filePath, "Line 1\nLine 2\nLine 3");
  try {
    const result = buildPayload({ setFiles: [`description=${filePath}`] });
    assert.equal(result.description, "Line 1\nLine 2\nLine 3");
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test("--set-file can combine with --set", () => {
  const dir = mkdtempSync(join(tmpdir(), "mc-test-"));
  const filePath = join(dir, "notes.txt");
  writeFileSync(filePath, "file content");
  try {
    const result = buildPayload({
      sets: ["title=My Title"],
      setFiles: [`notes=${filePath}`],
    });
    assert.equal(result.title, "My Title");
    assert.equal(result.notes, "file content");
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test("--set-file overrides --set for same field", () => {
  const dir = mkdtempSync(join(tmpdir(), "mc-test-"));
  const filePath = join(dir, "desc.txt");
  writeFileSync(filePath, "from file");
  try {
    const result = buildPayload({
      sets: ["description=from set"],
      setFiles: [`description=${filePath}`],
    });
    assert.equal(result.description, "from file");
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test("--set-file throws CliUsageError for missing file", () => {
  assert.throws(
    () => buildPayload({ setFiles: ["desc=/nonexistent/path.txt"] }),
    (error: unknown) => {
      assert.ok(error instanceof CliUsageError);
      assert.match(error.message, /--set-file desc/);
      assert.match(error.message, /cannot read/);
      return true;
    },
  );
});

test("--set-file throws CliUsageError for empty path", () => {
  assert.throws(
    () => buildPayload({ setFiles: ["desc="] }),
    (error: unknown) => {
      assert.ok(error instanceof CliUsageError);
      assert.match(error.message, /file path cannot be empty/);
      return true;
    },
  );
});

test("missing payload error message mentions --set-file", () => {
  assert.throws(
    () => buildPayload({}),
    (error: unknown) => {
      assert.ok(error instanceof CliUsageError);
      assert.match(error.message, /--set-file/);
      return true;
    },
  );
});

// --- normalizeWorkItemPayload ---

test("normalizeWorkItemPayload maps epic_id to parent_id", () => {
  const payload: Record<string, unknown> = { title: "Story", epic_id: "e-1" };
  normalizeWorkItemPayload(payload);
  assert.equal(payload.parent_id, "e-1");
  assert.equal(Object.hasOwn(payload, "epic_id"), false);
});

test("normalizeWorkItemPayload maps story_id to parent_id", () => {
  const payload: Record<string, unknown> = { title: "Task", story_id: "s-1" };
  normalizeWorkItemPayload(payload);
  assert.equal(payload.parent_id, "s-1");
  assert.equal(Object.hasOwn(payload, "story_id"), false);
});

test("normalizeWorkItemPayload is a no-op when parent_id already set", () => {
  const payload = { title: "Task", parent_id: "p-1" };
  normalizeWorkItemPayload(payload);
  assert.equal(payload.parent_id, "p-1");
});

test("normalizeWorkItemPayload is a no-op when no legacy fields present", () => {
  const payload = { title: "Task", status: "TODO" };
  normalizeWorkItemPayload(payload);
  assert.deepEqual(payload, { title: "Task", status: "TODO" });
});

test("normalizeWorkItemPayload throws when epic_id conflicts with parent_id", () => {
  assert.throws(
    () => normalizeWorkItemPayload({ epic_id: "e-1", parent_id: "p-1" }),
    (error: unknown) => {
      assert.ok(error instanceof CliUsageError);
      assert.match(error.message, /epic_id.*parent_id/);
      return true;
    },
  );
});

test("normalizeWorkItemPayload throws when story_id conflicts with parent_id", () => {
  assert.throws(
    () => normalizeWorkItemPayload({ story_id: "s-1", parent_id: "p-1" }),
    (error: unknown) => {
      assert.ok(error instanceof CliUsageError);
      assert.match(error.message, /story_id.*parent_id/);
      return true;
    },
  );
});

test("normalizeWorkItemPayload throws when both epic_id and story_id present", () => {
  assert.throws(
    () => normalizeWorkItemPayload({ epic_id: "e-1", story_id: "s-1" }),
    (error: unknown) => {
      assert.ok(error instanceof CliUsageError);
      assert.match(error.message, /multiple legacy parent aliases/);
      return true;
    },
  );
});
