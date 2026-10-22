import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const templates = resolve(import.meta.dirname, "../templates");

type ProjectFile = {
  path: string;
  template: string;
  // Files the skills read in place of `path`, in the skills repo's contract order; one present means init skips `path`.
  fallbacks?: string[];
  // What init does when the file already exists; it returns the report lines.
  onExisting?: (target: string, template: string) => string[];
};

// The project files init writes, in the order it reports them, each with its template.
// The template for `.gitignore` drops the dot because npm leaves `.gitignore` files out of a package.
const files: ProjectFile[] = [
  { path: "spec/vision.md", template: "vision.md" },
  { path: "spec/glossary.md", template: "glossary.md", fallbacks: ["GLOSSARY.md", "CONTEXT.md"] },
  { path: ".agents/coding-standards.md", template: "coding-standards.md", fallbacks: ["CODING_STANDARDS.md"] },
  { path: "AGENTS.md", template: "AGENTS.md" },
  { path: "CLAUDE.md", template: "CLAUDE.md", onExisting: checkAgentsImport },
  { path: ".gitignore", template: "gitignore", onExisting: ignoreScratch },
];

// Writes every missing project file into `root` and returns the report lines, one or two per path.
// It never overwrites: an existing file is kept as it is, except that `.gitignore` gets `.scratch/` appended.
export function init(root: string): string[] {
  const lines = files.flatMap((file) => place(root, file));
  return [...lines, "next: fill spec/vision.md and .agents/coding-standards.md, then commit"];
}

function place(root: string, { path, template, fallbacks = [], onExisting }: ProjectFile): string[] {
  const target = join(root, path);
  const fallback = fallbacks.find((name) => existsSync(join(root, name)));
  // The skills read the home path first, so a new empty one would hide the filled fallback.
  if (fallback && !existsSync(target)) return [`kept ${fallback} (fallback)`];
  mkdirSync(dirname(target), { recursive: true });
  try {
    writeFileSync(target, readFileSync(join(templates, template)), { flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    return onExisting ? onExisting(target, template) : [`kept ${path}`];
  }
  return [`created ${path}`];
}

// Claude Code reads only CLAUDE.md, so one that neither imports AGENTS.md nor links to it misses the shared instructions.
function checkAgentsImport(claude: string): string[] {
  const agents = join(dirname(claude), "AGENTS.md");
  // Both sit in one folder, so their real paths match only when CLAUDE.md links to AGENTS.md; a dangling link reads as neither.
  if (existsSync(claude)) {
    const linked = existsSync(agents) && realpathSync(claude) === realpathSync(agents);
    if (linked || /(^|\s)@(\.\/)?AGENTS\.md(\s|$)/m.test(readFileSync(claude, "utf8"))) return ["kept CLAUDE.md"];
  }
  return ["kept CLAUDE.md", "warn CLAUDE.md does not import @AGENTS.md"];
}

// Spellings of a line that already ignores the root `.scratch/` folder, so init adds no second one.
const scratchEntries = new Set(
  [".scratch", ".scratch/", ".scratch/*", ".scratch/**"].flatMap((entry) => [entry, `/${entry}`]),
);

// Appends the template's lines to an existing `.gitignore` unless it already ignores `.scratch/`.
function ignoreScratch(gitignore: string, template: string): string[] {
  const text = readFileSync(gitignore, "utf8");
  if (text.split(/\r?\n/).some((line) => scratchEntries.has(line.trim()))) return ["kept .gitignore"];
  const separator = text === "" || text.endsWith("\n") ? "" : "\n";
  appendFileSync(gitignore, separator + readFileSync(join(templates, template), "utf8"));
  return ["appended .scratch/ to .gitignore"];
}
