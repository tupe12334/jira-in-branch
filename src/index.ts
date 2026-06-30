#!/usr/bin/env node
import { execSync } from "node:child_process";
import { read, respond, block, approve } from "@polyhook/sdk";

const JIRA_TICKET = /[A-Z][A-Z0-9]+-\d+/;

/**
 * True when the command opens a PR via `gh pr create` / `gh pr new`.
 * @param command - The bash command being intercepted.
 * @returns Whether the command is a `gh pr create`/`new` invocation.
 */
function isGhPrCreate(command: string): boolean {
  return /\bgh\s+pr\s+(create|new)\b/.test(command);
}

/**
 * True when the command opens a PR via the REST API
 * (`gh api .../pulls` with a creating method).
 *
 * `gh api` defaults to GET but auto-switches to POST when any field flag
 * (`-f`/`-F`/`--field`/`--raw-field`/`--input`) is present, so PR creation
 * shows up as a POST to the `/pulls` *collection* endpoint. Listing PRs (GET,
 * or `--method GET`) and updating a specific PR (`/pulls/{n}`) must NOT be
 * blocked.
 * @param command - The bash command being intercepted.
 * @returns Whether the command creates a PR through `gh api .../pulls`.
 */
function isGhApiPrCreate(command: string): boolean {
  if (!/\bgh\s+api\b/.test(command)) return false;
  if (!/\/pulls\b/.test(command)) return false;
  if (/\/pulls\/\d+/.test(command)) return false; // specific PR: get/update

  const methodGet = /(^|\s)(-X|--method)[\s=]+GET\b/i.test(command);
  if (methodGet) return false;

  const methodPost = /(^|\s)(-X|--method)[\s=]+POST\b/i.test(command);
  const hasFields = /(^|\s)(-f|--field|-F|--raw-field|--input)\b/.test(command);
  return methodPost || hasFields;
}

const event = await read();

if (event.event === "tool:before" && event.tool === "bash") {
  const rawCommand = event.input?.command;
  const command = typeof rawCommand === "string" ? rawCommand : "";

  if (isGhPrCreate(command) || isGhApiPrCreate(command)) {
    let branch: string;
    try {
      branch = execSync("git branch --show-current", { encoding: "utf8" }).trim();
    } catch {
      await respond(block("jira-in-branch: could not read current branch name"));
      process.exit(0);
    }

    if (!JIRA_TICKET.test(branch)) {
      await respond(
        block(
          `jira-in-branch: branch "${branch}" has no Jira ticket.\n` +
            `Rename to include a ticket (e.g. feat/PROJ-123-my-feature) before opening a PR.`
        )
      );
      process.exit(0);
    }
  }
}

await respond(approve());
