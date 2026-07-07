#!/usr/bin/env node
import { execSync } from "node:child_process";
import { read, respond, block, approve } from "@polyhook/sdk";

const JIRA_TICKET = /[A-Z][A-Z0-9]+-\d+/;

/**
 * Branch names that are allowed to open a PR without a Jira ticket. These are
 * long-lived integration branches (e.g. release PRs from `develop` into
 * `main`) that legitimately never carry a ticket in their name.
 */
const ALLOWED_BRANCHES = new Set(["develop"]);

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

/**
 * Drops a fork `owner:` prefix from a head ref, leaving the branch name.
 * @param ref - A PR head ref, possibly `owner:branch`.
 * @returns The branch portion of the ref.
 */
function stripOwner(ref: string): string {
  const colon = ref.indexOf(":");
  return colon === -1 ? ref : ref.slice(colon + 1);
}

/**
 * Extracts the PR's explicit *head* branch from the command, when present.
 *
 * The hook runs in the agent's own working directory, which is frequently NOT
 * the directory (or even the repository) the PR targets — e.g. a git worktree
 * whose checked-out branch is named after the worktree, or a submodule the
 * `gh` call `cd`s into. There `git branch --show-current` reads the wrong
 * branch. When the command states the head branch explicitly, that is the
 * branch the PR is actually for, so validate it directly.
 *
 * Handles both surfaces and the common shell-quoting shapes:
 * - `gh pr create --head <b>` / `--head=<b>` / `-H <b>`
 * - `gh api .../pulls -f head=<b>` (and `-F`/`--field`/`--raw-field`, quoted or not)
 * A fork head of the form `owner:branch` is reduced to `branch`.
 * @param command - The bash command being intercepted.
 * @returns The explicit head branch, or `undefined` when none is stated.
 */
function parseHeadBranch(command: string): string | undefined {
  // `gh pr create` head flag: --head / --head= / -H. The lookbehind keeps `-H`
  // from matching inside a longer token, and `[\s=]+` rejects `--header`.
  const prHead = /(?:--head|(?<![\w-])-H)[\s=]+(['"]?)([^\s'"]+)\1/.exec(command);
  // `gh api` field `head=...`; the `\bhead=` anchor matches whether the quote
  // sits before `head=` (`-f "head=x"`) or after `=` (`-f head="x"`).
  const apiHead = /\bhead=(['"]?)([^\s'"]+)\1/.exec(command);

  let raw: string | undefined;
  if (prHead !== null) {
    raw = prHead[2];
  } else if (apiHead !== null) {
    raw = apiHead[2];
  }

  if (raw === undefined) return undefined;
  return stripOwner(raw);
}

const event = await read();

if (event.event === "tool:before" && event.tool === "bash") {
  const rawCommand = event.input?.command;
  const command = typeof rawCommand === "string" ? rawCommand : "";

  if (isGhPrCreate(command) || isGhApiPrCreate(command)) {
    // Prefer the head branch stated in the command; only read git when the
    // command leaves it implicit. This keeps the check correct when the hook's
    // cwd (e.g. an agent worktree) differs from the branch the PR targets.
    let currentBranch = "";
    try {
      currentBranch = execSync("git branch --show-current", {
        encoding: "utf8",
      }).trim();
    } catch {
      // No git context here; rely on whatever the command states.
    }

    const headBranch = parseHeadBranch(command);
    let branch: string;
    if (headBranch !== undefined) {
      branch = headBranch;
    } else {
      branch = currentBranch;
    }

    if (branch === "") {
      await respond(
        block("jira-in-branch: could not determine the PR branch name"),
      );
      process.exit(0);
    }

    if (!ALLOWED_BRANCHES.has(branch) && !JIRA_TICKET.test(branch)) {
      await respond(
        block(
          `jira-in-branch: branch "${branch}" has no Jira ticket.\n` +
            `Rename to include a ticket (e.g. feat/PROJ-123-my-feature) before opening a PR.`,
        ),
      );
      process.exit(0);
    }
  }
}

await respond(approve());
