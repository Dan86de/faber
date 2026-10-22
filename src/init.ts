import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const templates = resolve(import.meta.dirname, "../templates");

type ProjectFile = {
  path: string;
  template: string;
  // What init does when the file already exists; it returns the report line.
  onExisting?: (target: string, template: string) => string;
};

// The project files init writes, in the order it reports them, each with its template.
// The template for `.gitignore` drops the dot because npm leaves `.gitignore` files out of a package.
const files: ProjectFile[] = [
  { path: "spec/vision.md", template: "vision.md" },
  { path: "spec/glossary.md", template: "glossary.md" },
  { path: ".agents/coding-standards.md", template: "coding-standards.md" },
  { path: "AGENTS.md", template: "AGENTS.md" },
  { path: "CLAUDE.md", template: "CLAUDE.md" },
  { path: ".gitignore", template: "gitignore", onExisting: ignoreScratch },
];

// Writes every missing project file into `root` and returns one report line per path.
// It never overwrites: an existing file is kept as it is, except that `.gitignore` gets `.scratch/` appended.
export function init(root: string): string[] {
  const lines = files.map(({ path, template, onExisting }) => {
    const target = join(root, path);
    mkdirSync(dirname(target), { recursive: true });
    try {
      writeFileSync(target, readFileSync(join(templates, template)), { flag: "wx" });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      return onExisting ? onExisting(target, template) : `kept ${path}`;
    }
    return `created ${path}`;
  });
  return [...lines, "next: fill spec/vision.md and .agents/coding-standards.md, then commit"];
}

// Spellings of a line that already ignores the root `.scratch/` folder, so init adds no second one.
const scratchEntries = new Set(
  [".scratch", ".scratch/", ".scratch/*", ".scratch/**"].flatMap((entry) => [entry, `/${entry}`]),
);

// Appends the template's lines to an existing `.gitignore` unless it already ignores `.scratch/`.
function ignoreScratch(gitignore: string, template: string): string {
  const text = readFileSync(gitignore, "utf8");
  if (text.split(/\r?\n/).some((line) => scratchEntries.has(line.trim()))) return "kept .gitignore";
  const separator = text === "" || text.endsWith("\n") ? "" : "\n";
  appendFileSync(gitignore, separator + readFileSync(join(templates, template), "utf8"));
  return "appended .scratch/ to .gitignore";
}
