import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import prompts from "prompts";
import { logger } from "../utils/logger";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Initialize a new mod project
 */
export async function initCommand(
  projectName?: string,
  options?: {
    template?: string;
    author?: string;
    license?: string;
    interactive?: boolean;
  },
) {
  try {
    let name = projectName;
    let displayName = projectName;
    let description = "";
    let author = options?.author || "";
    let license = options?.license || "MIT";

    // Interactive mode
    if (options?.interactive || !projectName) {
      const response = await prompts([
        {
          type: projectName ? null : "text",
          name: "name",
          message: "Project name (kebab-case):",
          initial: projectName || "my-mod",
          validate: (value: string) =>
            /^[a-z0-9-]+$/.test(value) || "Must be kebab-case",
        },
        {
          type: "text",
          name: "displayName",
          message: "Display name:",
          initial: (prev: string) =>
            (prev || projectName || "my-mod")
              .split("-")
              .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
              .join(" "),
        },
        {
          type: "text",
          name: "description",
          message: "Description:",
          initial: "A Deadlock mod",
        },
        {
          type: options?.author ? null : "text",
          name: "author",
          message: "Author:",
          initial: options?.author || "",
        },
        {
          type: options?.license ? null : "text",
          name: "license",
          message: "License:",
          initial: options?.license || "MIT",
        },
      ]);

      if (!response.name && !projectName) {
        logger.info("Initialization cancelled");
        return;
      }

      name = response.name || projectName;
      displayName = response.displayName || displayName;
      description = response.description || description;
      author = response.author || author;
      license = response.license || license;
    }

    if (!name) {
      throw new Error("Project name is required");
    }

    // Create project directory
    const projectDir = join(process.cwd(), name);
    if (existsSync(projectDir)) {
      throw new Error(`Directory ${name} already exists`);
    }

    logger.info(`Creating project: ${name}`);

    mkdirSync(projectDir, { recursive: true });
    mkdirSync(join(projectDir, "content", "base"), { recursive: true });
    mkdirSync(join(projectDir, "previews"), { recursive: true });

    // Load templates
    const templateDir = join(__dirname, "..", "..", "templates", "basic");
    const configTemplate = readFileSync(
      join(templateDir, "mod.config.json"),
      "utf8",
    );
    const readmeTemplate = readFileSync(join(templateDir, "README.md"), "utf8");

    // Replace template variables
    const configContent = configTemplate
      .replace(/\{\{name\}\}/g, name)
      .replace(/\{\{display_name\}\}/g, displayName)
      .replace(/\{\{description\}\}/g, description)
      .replace(/\{\{author\}\}/g, author)
      .replace(/\{\{license\}\}/g, license);

    const readmeContent = readmeTemplate
      .replace(/\{\{display_name\}\}/g, displayName)
      .replace(/\{\{description\}\}/g, description)
      .replace(/\{\{author\}\}/g, author)
      .replace(/\{\{license\}\}/g, license);

    // Write files
    writeFileSync(join(projectDir, "mod.config.json"), configContent);
    writeFileSync(join(projectDir, "README.md"), readmeContent);

    logger.info(`Project created successfully at ${projectDir}`);
    logger.info("Next steps:");
    logger.info(`  cd ${name}`);
    logger.info("  Add your mod files to content/base/");
    logger.info("  dmodpkg pack");
  } catch (error) {
    logger.withError(error as Error).error("Failed to initialize project");
    throw error;
  }
}
