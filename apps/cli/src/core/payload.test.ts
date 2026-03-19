import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { buildPayload } from "./payload";

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
