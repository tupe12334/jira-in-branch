#!/usr/bin/env node
import { read, respond, block, approve } from "@polyhook/sdk";
import { execSync } from "node:child_process";

const JIRA_TICKET = /[A-Z][A-Z0-9]+-\d+/;

const event = await read();

if (event.event === "tool:before" && event.tool === "bash") {
  const command = (event.input?.command as string) ?? "";

  if (/\bgh\s+pr\s+(create|new)\b/.test(command)) {
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
