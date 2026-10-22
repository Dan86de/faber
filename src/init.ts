import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const templates = resolve(import.meta.dirname, "../templates");

// The project files init writes, in the order it reports them, each with its template.
// The template for `.gitignore` drops the dot because npm leaves `.gitignore` files out of a package.
const files = [
  { path: "spec/vision.md", template: "vision.md" },
  { path: "spec/glossary.md", template: "glossary.md" },
  { path: ".agents/coding-standards.md", template: "coding-standards.md" },
  { path: "AGENTS.md", template: "AGENTS.md" },
  { path: "CLAUDE.md", template: "CLAUDE.md" },
  { path: ".gitignore", template: "gitignore" },
];

// Writes every missing project file into `root` and returns one report line per path.
// It never overwrites: an existing file is kept as it is.
export function init(root: string): string[] {
  const lines = files.map(({ path, template }) => {
    const target = join(root, path);
    mkdirSync(dirname(target), { recursive: true });
    try {
      writeFileSync(target, readFileSync(join(templates, template)), { flag: "wx" });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      return `kept ${path}`;
    }
    return `created ${path}`;
  });
  return [...lines, "next: fill spec/vision.md and .agents/coding-standards.md, then commit"];
}
