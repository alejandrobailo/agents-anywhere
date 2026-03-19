import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { validateAgainstSchema } from "../core/schema-loader.js";
import { success, error, heading, info } from "../utils/output.js";

/**
 * Returns the path to the bundled agents/ directory.
 */
function getAgentsDir(): string {
  const candidates = [
    path.resolve(__dirname, "../../agents"),
    path.resolve(__dirname, "../agents"),
    path.resolve(__dirname, "agents"),
  ];

  for (const candidate of candidates) {
    try {
      readdirSync(candidate);
      return candidate;
    } catch {
      // try next
    }
  }

  throw new Error(
    "Could not find agents/ directory. Ensure agent definition JSON files are bundled.",
  );
}

/**
 * `agentsync validate` — Load all agent definitions and report validation results.
 * Useful for contributors testing their agent JSON files.
 */
export async function validateCommand(): Promise<void> {
  heading("Validating agent definitions");

  const agentsDir = getAgentsDir();
  const files = readdirSync(agentsDir).filter((f) => f.endsWith(".json"));

  let totalErrors = 0;

  for (const file of files) {
    const filePath = path.join(agentsDir, file);
    try {
      const raw = readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(raw);
      const result = validateAgainstSchema(parsed);

      if (result.valid) {
        success(`${file} — valid`);
      } else {
        error(`${file} — ${result.errors.length} error(s)`);
        for (const err of result.errors) {
          console.log(`    ${err.path}: ${err.message}`);
        }
        totalErrors += result.errors.length;
      }
    } catch (err) {
      error(`${file} — failed to parse: ${(err as Error).message}`);
      totalErrors++;
    }
  }

  console.log();
  if (totalErrors === 0) {
    info(`All ${files.length} agent definitions are valid.`);
  } else {
    info(`${totalErrors} error(s) found across agent definitions.`);
    process.exitCode = 1;
  }
}
