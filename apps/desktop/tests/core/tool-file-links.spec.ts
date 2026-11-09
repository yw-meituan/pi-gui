import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import {
  createNamedThread,
  emitTestSessionEvents,
  getDesktopState,
  launchDesktop,
  makeUserDataDir,
  makeWorkspace,
  waitForTimelineLayout,
  waitForWorkspaceByPath,
} from "../helpers/electron-app";

test("tool file chips open the side panel without expanding the tool", async ({}, testInfo) => {
  const userDataDir = await makeUserDataDir();
  const workspacePath = await makeWorkspace("tool-file-links");
  await mkdir(join(workspacePath, "src"), { recursive: true });
  const paths = ["src/read.ts", "src/written.ts", "src/edited.ts", "Makefile", "src/my file.ts"];
  for (const path of paths) {
    await writeFile(join(workspacePath, path), `first\nsecond\nmarker for ${path}\n`);
  }
  const harness = await launchDesktop(userDataDir, {
    initialWorkspaces: [workspacePath],
    testMode: "background",
  });
  try {
    const window = await harness.firstWindow();
    await waitForWorkspaceByPath(window, workspacePath);
    await createNamedThread(window, "Clickable tool files");
    const state = await getDesktopState(window);
    if (!state.selectedWorkspaceId || !state.selectedSessionId) throw new Error("Missing session");
    const sessionRef = {
      workspaceId: state.selectedWorkspaceId,
      sessionId: state.selectedSessionId,
    };
    const timestamp = new Date().toISOString();
    // Events isolate rendering from model/provider behavior; files are real local fixtures.
    const tools = [
      { toolName: "read", input: { path: join(workspacePath, paths[0]!), offset: 3 } },
      { toolName: "write", input: { path: paths[1], content: "written" } },
      { toolName: "edit", input: { path: paths[2], oldText: "first", newText: "updated" } },
      {
        toolName: "edit",
        input: { text: "[Makefile]\n@APPEND\n+ok\n[src/my file.ts]\n@APPEND\n+ok" },
      },
      { toolName: "read", input: { path: "missing.ts" } },
      { toolName: "read", input: { path: "../outside.txt" } },
    ];
    for (const [index, tool] of tools.entries()) {
      await emitTestSessionEvents(harness, [
        { type: "toolStarted", sessionRef, timestamp, callId: `file-tool-${index}`, ...tool },
        {
          type: "toolFinished",
          sessionRef,
          timestamp,
          callId: `file-tool-${index}`,
          success: true,
          output: "done",
        },
      ]);
    }
    const rows = window.locator(".timeline-tool");
    await expect(rows).toHaveCount(tools.length);
    for (const [index, path] of paths.entries()) {
      await waitForTimelineLayout(window);
      const row = rows.nth(Math.min(index, 3));
      const link = row.getByTestId("timeline-tool-file-link").filter({ hasText: path });
      await expect(row.locator(".timeline-tool__body")).toHaveCount(0);
      await link.click();
      await expect(window.getByTestId("file-workbench-preview")).toContainText(
        `marker for ${path}`,
      );
      await expect(row.locator(".timeline-tool__body")).toHaveCount(0);
      if (index === 0) {
        await expect(window.locator('[data-testid="file-line-mark"][data-line="3"]')).toContainText(
          "marker for src/read.ts",
        );
      }
    }
    await waitForTimelineLayout(window);
    await rows.nth(4).getByTestId("timeline-tool-file-link").click();
    await expect(window.getByTestId("file-workbench-preview")).toContainText(
      "marker for src/my file.ts",
    );
    await expect(rows.nth(5).getByTestId("timeline-tool-file-link")).toHaveCount(0);
    await rows.first().locator(".timeline-tool__header").click();
    await expect(rows.first().locator(".timeline-tool__pre")).toContainText("src/read.ts");
    await expect(rows.nth(1).getByTestId("timeline-tool-view-in-diff")).toBeVisible();
    await waitForTimelineLayout(window);
    await window.screenshot({ path: testInfo.outputPath("tool-file-links.png") });
  } finally {
    await harness.close();
  }
});
