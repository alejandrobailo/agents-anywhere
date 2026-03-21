import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { validateAgainstSchema, getAgentsDir } from "../core/schema-loader.js";
import { success, error, heading, info } from "../utils/output.js";

/**
 * `agents-anywhere validate` — Load all agent definitions and report validation results.
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
