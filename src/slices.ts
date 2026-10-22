// Reads a committed slices file for what the coordinator needs: each slice's id and the slices it waits for.

export type Slice = { id: string; blockedBy: string[] };

// A slice id, also the name of its session's transcript and an argument in its prompt.
const idPattern = /^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$/;

// The slices `text` lists, in file order, or why it is not a slices file faber can build from.
export function parseSlices(text: string): { slices: Slice[] } | { problem: string } {
  let file: unknown;
  try {
    file = JSON.parse(text);
  } catch {
    return { problem: "is not JSON" };
  }
  const list = isRecord(file) ? file.slices : undefined;
  if (!Array.isArray(list) || list.length === 0) return { problem: "lists no slices" };
  const slices: Slice[] = [];
  for (const [i, entry] of list.entries()) {
    if (!isRecord(entry) || typeof entry.id !== "string" || entry.id === "") {
      return { problem: `has a slice with no id, at index ${i}` };
    }
    if (!idPattern.test(entry.id)) {
      return { problem: `has a slice id that is not letters, digits and dashes: ${entry.id}` };
    }
    const blockedBy = entry.blocked_by ?? [];
    if (!Array.isArray(blockedBy) || !blockedBy.every((id) => typeof id === "string")) {
      return { problem: `has a blocked_by in ${entry.id} that is not a list of ids` };
    }
    if (slices.some((slice) => slice.id === entry.id)) return { problem: `lists ${entry.id} twice` };
    slices.push({ id: entry.id, blockedBy });
  }
  return { slices };
}

// The lowest id with no `Slice:` or `Slice-Pending:` trailer whose every blocker is done, as implement-slice picks.
export function nextReady(slices: Slice[], done: Set<string>, pending: Set<string>): string | undefined {
  const ready = slices
    .filter(({ id, blockedBy }) => !done.has(id) && !pending.has(id) && blockedBy.every((b) => done.has(b)))
    .map(({ id }) => id);
  return ready.sort((a, b) => a.localeCompare(b, "en", { numeric: true }))[0];
}

// Every slice with no `Slice:` trailer, whether a `Slice-Pending:` trailer holds it, and its blockers not yet done.
export function waiting(
  slices: Slice[],
  done: Set<string>,
  pending: Set<string>,
): { id: string; pending: boolean; openBlockers: string[] }[] {
  return slices
    .filter(({ id }) => !done.has(id))
    .map(({ id, blockedBy }) => ({
      id,
      pending: pending.has(id),
      openBlockers: blockedBy.filter((blocker) => !done.has(blocker)),
    }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
