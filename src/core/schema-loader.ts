import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type { AgentDefinition } from "../schemas/agent-schema.js";
import { agentDefinitionSchema } from "../schemas/agent-definition-schema-data.js";
import { debug } from "../utils/output.js";

/** A single validation error with a JSON path and message */
export interface ValidationError {
  path: string;
  message: string;
}

/** Result of validating an agent definition */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

// JSON Schema type helpers (subset of draft-07 that we support)
interface SchemaNode {
  type?: string;
  required?: string[];
  properties?: Record<string, SchemaNode>;
  additionalProperties?: boolean;
  items?: SchemaNode;
  enum?: string[];
  $ref?: string;
  definitions?: Record<string, SchemaNode>;
  [key: string]: unknown;
}

/**
 * Returns the path to the bundled agents/ directory.
 * In development, this is at the project root.
 * When published, agents/ is copied to dist/agents/.
 */
export function getAgentsDir(): string {
  // Walk up from this file to find the agents/ directory.
  // In dev: src/core/schema-loader.ts -> ../../agents
  // In dist: dist/core/schema-loader.js -> ../../agents (if copied to root)
  //          dist/agents/ (if copied alongside dist)
  const candidates = [
    path.resolve(__dirname, "../../agents"),
    path.resolve(__dirname, "../agents"),
    path.resolve(__dirname, "agents"),
  ];

  for (const candidate of candidates) {
    try {
      readdirSync(candidate);
      return candidate;
    } catch (err) {
      debug(`Agents dir candidate ${candidate} not accessible: ${(err as Error).message}`);
    }
  }

  throw new Error(
    "Could not find agents/ directory. Ensure agent definition JSON files are bundled.",
  );
}

/**
 * Resolve a $ref pointer within the schema (supports #/definitions/Name).
 */
function resolveRef(ref: string, root: SchemaNode): SchemaNode {
  const parts = ref.replace(/^#\//, "").split("/");
  let current: unknown = root;
  for (const part of parts) {
    if (current && typeof current === "object" && part in current) {
      current = (current as Record<string, unknown>)[part];
    } else {
      throw new Error(`Cannot resolve $ref: ${ref}`);
    }
  }
  return current as SchemaNode;
}

/**
 * Validate a value against a JSON Schema node.
 * Returns an array of validation errors (empty = valid).
 *
 * Supports: type checking (string, object, array), required fields,
 * enum values, nested properties, $ref resolution, and array items.
 */
function validateNode(
  value: unknown,
  schema: SchemaNode,
  root: SchemaNode,
  currentPath: string,
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Resolve $ref
  let resolved = schema;
  if (schema.$ref) {
    resolved = { ...resolveRef(schema.$ref as string, root) };
    // Merge any sibling properties (e.g. description) — $ref takes precedence for validation
  }

  // Type check
  if (resolved.type) {
    const actualType = getJsonType(value);
    if (actualType !== resolved.type) {
      errors.push({
        path: currentPath,
        message: `Expected type "${resolved.type}", got "${actualType}"`,
      });
      return errors; // No point checking further if type is wrong
    }
  }

  // Enum check
  if (resolved.enum && typeof value === "string") {
    if (!resolved.enum.includes(value)) {
      errors.push({
        path: currentPath,
        message: `Invalid value "${value}". Must be one of: ${resolved.enum.join(", ")}`,
      });
    }
  }

  // Object validation
  if (resolved.type === "object" && typeof value === "object" && value !== null) {
    const obj = value as Record<string, unknown>;

    // Required fields
    if (resolved.required) {
      for (const field of resolved.required) {
        if (obj[field] === undefined || obj[field] === null) {
          errors.push({
            path: currentPath ? `${currentPath}.${field}` : field,
            message: `Missing required field "${field}"`,
          });
        }
      }
    }

    // Validate properties
    if (resolved.properties) {
      for (const [key, propSchema] of Object.entries(resolved.properties)) {
        if (obj[key] !== undefined && obj[key] !== null) {
          const propPath = currentPath ? `${currentPath}.${key}` : key;
          errors.push(...validateNode(obj[key], propSchema, root, propPath));
        }
      }
    }

    // additionalProperties enforcement
    if (resolved.additionalProperties === false && resolved.properties) {
      const allowedKeys = new Set(Object.keys(resolved.properties));
      for (const key of Object.keys(obj)) {
        if (!allowedKeys.has(key)) {
          errors.push({
            path: currentPath ? `${currentPath}.${key}` : key,
            message: `Unknown property "${key}" is not allowed`,
          });
        }
      }
    }
  }

  // Array validation
  if (resolved.type === "array" && Array.isArray(value)) {
    if (resolved.items) {
      for (let i = 0; i < value.length; i++) {
        errors.push(
          ...validateNode(value[i], resolved.items, root, `${currentPath}[${i}]`),
        );
      }
    }
  }

  return errors;
}

/**
 * Get the JSON type name for a value.
 */
function getJsonType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

/**
 * Validate an agent definition against the JSON Schema.
 * Returns a ValidationResult with a list of errors (empty = valid).
 */
export function validateAgainstSchema(data: unknown): ValidationResult {
  const schema = agentDefinitionSchema as unknown as SchemaNode;
  const errors = validateNode(data, schema, schema, "");
  return { valid: errors.length === 0, errors };
}

/**
 * Load a single agent definition from a JSON file.
 */
export function loadAgentDefinition(filePath: string): AgentDefinition {
  const raw = readFileSync(filePath, "utf-8");
  const parsed = JSON.parse(raw);
  const result = validateAgainstSchema(parsed);
  if (!result.valid) {
    const messages = result.errors.map((e) => `  ${e.path}: ${e.message}`).join("\n");
    throw new Error(
      `Agent definition ${filePath} failed validation:\n${messages}`,
    );
  }
  return parsed as AgentDefinition;
}

/**
 * Load all agent definitions from the bundled agents/ directory.
 * Results are cached after first load.
 */
let _cache: AgentDefinition[] | null = null;

export function loadAllAgentDefinitions(): AgentDefinition[] {
  if (_cache) return _cache;
  const agentsDir = getAgentsDir();
  const files = readdirSync(agentsDir).filter((f) => f.endsWith(".json"));
  _cache = files.map((file) => loadAgentDefinition(path.join(agentsDir, file)));
  return _cache;
}

/**
 * Load a specific agent definition by ID.
 */
export function loadAgentById(id: string): AgentDefinition | undefined {
  const all = loadAllAgentDefinitions();
  return all.find((agent) => agent.id === id);
}
