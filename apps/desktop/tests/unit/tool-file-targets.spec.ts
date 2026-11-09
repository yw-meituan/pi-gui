import { expect, test } from "@playwright/test";
import { toolFileTargets } from "../../src/features/conversation/tool-file-targets";

const root = "/repo";

test("file tools resolve paths and read offsets, including extensionless and spaced names", () => {
  expect(toolFileTargets("read", { path: "/repo/docs/my file.md", offset: 47 }, root)).toEqual([
    { path: "docs/my file.md", line: 47, endLine: 47 },
  ]);
  expect(toolFileTargets("write", { file_path: "Makefile", content: "[fake.ts]" }, root)).toEqual([
    { path: "Makefile", line: 1, endLine: 1 },
  ]);
  expect(
    toolFileTargets("edit", { path: ".gitignore", oldText: "before", newText: "after" }, root),
  ).toEqual([{ path: ".gitignore", line: 1, endLine: 1 }]);
  expect(toolFileTargets("read", { path: "src/app.ts", offset: -1 }, root)[0]?.line).toBe(1);
});

test("multi-file edits expose unique file headers without treating inserted content as targets", () => {
  const text = "[src/a.ts]\n@REPLACE\n-old\n+new\n+[fake.ts]\n[src/b.ts]\n@APPEND\n+ok\n[src/a.ts]";
  expect(toolFileTargets("edit", { text }, root).map((file) => file.path)).toEqual([
    "src/a.ts",
    "src/b.ts",
  ]);
  expect(
    toolFileTargets(
      "apply_patch",
      {
        patch:
          "*** Begin Patch\n*** Update File: src/a.ts\n*** Move to: src/b.ts\n*** Add File: README.md\n*** End Patch",
      },
      root,
    ).map((file) => file.path),
  ).toEqual(["src/a.ts", "src/b.ts", "README.md"]);
});

test("file targets stay inside the current workspace and ignore shell scripts", () => {
  for (const path of [
    "../secret",
    "/elsewhere/file.ts",
    "/repo-other/file.ts",
    "https://example.com/a.ts",
    "file:///repo/a.ts",
  ]) {
    expect(toolFileTargets("read", { path }, root)).toEqual([]);
  }
  expect(toolFileTargets("bash", { text: "[src/app.ts]", path: "src/app.ts" }, root)).toEqual([]);
});

test("Windows tool paths normalize within their drive and workspace", () => {
  for (const path of ["C:\\repo\\src\\app.ts", "c:/repo/src/app.ts", "src\\app.ts"]) {
    expect(toolFileTargets("read", { path, offset: 4 }, "C:\\repo")).toEqual([
      { path: "src/app.ts", line: 4, endLine: 4 },
    ]);
  }
  for (const path of [
    "D:\\repo\\app.ts",
    "C:\\repo-other\\app.ts",
    "..\\secret",
    "\\\\server\\share\\app.ts",
  ]) {
    expect(toolFileTargets("read", { path }, "C:\\repo")).toEqual([]);
  }
  expect(toolFileTargets("read", { path: "/etc/config" }, "/")).toEqual([
    { path: "etc/config", line: 1, endLine: 1 },
  ]);
});
