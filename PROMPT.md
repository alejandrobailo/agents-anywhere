@plan.md @activity.md @PRD.md

We are building agentsync — a CLI tool for managing AI coding agent configs across devices and tools, with MCP normalization as the killer feature.

First read activity.md to see what was recently accomplished.

Then open plan.md and find the single highest priority task (lowest priority number) where passes is false.

Before implementing, read all files referenced in the task steps. Read PRD.md for full technical context on agent definitions, MCP schemas, and architecture decisions. Understand the existing code before making changes.

Work on exactly ONE task: implement all steps listed for that task.

Code style:
- TypeScript strict mode
- Use async/await, not callbacks
- Prefer named exports
- Use descriptive variable names
- Keep functions small and focused
- No classes unless necessary — prefer plain functions and types
- Use path.join for file paths, handle ~ expansion via a utility function

After implementing:
1. Run `npx tsc --noEmit` to check for TypeScript errors
2. For tasks that add/modify tests, run `npx vitest run` and ensure all tests pass
3. Fix any errors before proceeding

When the task is confirmed working:
1. Update that task's `passes` in plan.md from `false` to `true`
2. Append a dated progress entry to activity.md with: task ID, category, description of changes, and files modified
3. Update the Current Status section in activity.md (increment tasks completed, update current task)
4. Make one git commit for that task only with message format:
   - Setup: `chore(scope): description`
   - Features: `feat(scope): description`
   - Tests: `test(scope): description`

Do not run git init (already done), do not change git remotes, do not push.

ONLY WORK ON A SINGLE TASK.

When ALL tasks have passes true:
1. Make a final commit: `chore: ready for v0.1.0 release`
2. Output <promise>COMPLETE</promise>
