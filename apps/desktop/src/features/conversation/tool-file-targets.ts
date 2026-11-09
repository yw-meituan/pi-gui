import { parseWorkspaceFileReference, type WorkspaceFileLine } from "./workspace-file-line";

/** Only declared file arguments and edit headers, never arbitrary tool output/code. */
export function toolFileTargets(
  toolName: string,
  input: unknown,
  workspacePath: string | null,
): readonly WorkspaceFileLine[] {
  if (!/read|write|edit|patch|apply/i.test(toolName)) return [];
  const targets = new Map<string, WorkspaceFileLine>();
  const add = (path: unknown, line?: unknown) => {
    if (typeof path !== "string" || targets.size >= 100) return;
    const target = parseWorkspaceFileReference(path, workspacePath);
    if (!target) return;
    const start =
      typeof line === "number" && Number.isInteger(line) && line > 0 && line <= 9_999_999
        ? line
        : target.line;
    if (!targets.has(target.path)) {
      targets.set(target.path, {
        ...target,
        line: start,
        endLine: Math.max(start, target.endLine),
      });
    }
  };
  const record =
    typeof input === "object" && input !== null ? (input as Record<string, unknown>) : undefined;
  if (record) {
    add(
      record.file_path ?? record.filePath ?? record.path ?? record.filename,
      /read/i.test(toolName) ? (record.offset ?? record.start_line ?? record.startLine) : undefined,
    );
  }
  if (/edit|patch|apply/i.test(toolName)) {
    const script =
      typeof input === "string"
        ? input
        : (record?.text ?? record?.patch ?? record?.patchText ?? record?.input);
    if (typeof script === "string") {
      for (const row of script.split(/\r?\n/)) {
        const match =
          /^(?:\[([^\]]+)\]|\*\*\* (?:Add File|Update File|Delete File|Move to): (.+))$/.exec(row);
        if (match) add(match[1] ?? match[2]);
      }
    }
  }
  return [...targets.values()];
}
