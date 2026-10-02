import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  // Subagent suppression: pi-subagents foreground children never load the
  // parent's ambient extensions and background runners spawn with --no-extensions,
  // so this factory only runs in the main session. PI_SUBAGENT_PARENT_SESSION
  // marks detached runner processes; guard anyway in case this file is ever
  // loaded there explicitly.
  if (process.env.PI_SUBAGENT_PARENT_SESSION) return;

  async function sendNf(ctx: ExtensionContext, prefix: string) {
    try {
      // Branch + repo root in one git call. Falls back gracefully outside a repo.
      const git = await pi.exec(
        "git",
        ["rev-parse", "--abbrev-ref", "HEAD", "--show-toplevel"],
        { cwd: ctx.cwd, timeout: 15000 },
      );
      const lines = (git.stdout || "").split("\n");
      const branchName = (lines[0] || "").trim();
      const toplevel = (lines[1] || "").trim();

      const host = os.hostname() || "unknown";
      const repo = toplevel ? path.basename(toplevel) : path.basename(ctx.cwd);

      const parts = [prefix, `host: ${host}`, `repo: ${repo}`];
      if (branchName) parts.push(`branch: ${branchName}`);
      await pi.exec("nf", [parts.join("\n")], { cwd: ctx.cwd, timeout: 15000 });
    } catch {
      // Best effort only, stay quiet if git/nf fails.
    }
  }

  const stateFile = new URL("./.notify-state", import.meta.url);
  let enabled = true;
  try {
    enabled = fs.readFileSync(stateFile, "utf8").trim() !== "false";
  } catch {
    // No state file yet: default on.
  }

  pi.registerCommand("notify", {
    description: "Enable/disable nf idle notifications (on|off, or toggle)",
    handler: async (args, ctx) => {
      const arg = (args || "").trim().toLowerCase();
      if (arg === "on") enabled = true;
      else if (arg === "off") enabled = false;
      else if (arg === "") enabled = !enabled;
      else {
        ctx.ui.notify("Usage: /notify on|off (no argument toggles)", "warning");
        return;
      }
      fs.writeFileSync(stateFile, String(enabled));
      ctx.ui.notify(
        `Idle notifications ${enabled ? "enabled" : "disabled"}`,
        "info",
      );
    },
  });

  // agent_settled fires only when no automatic retry, compaction recovery, or
  // queued continuation remains — the true "main agent idle" moment. No polling.
  pi.on("agent_settled", async (_event, ctx) => {
    if (!enabled) return;
    if (ctx.mode !== "tui") return; // headless rpc/json/print runs don't ping the desktop
    if (!ctx.isIdle()) return; // belt-and-braces alongside agent_settled
    await sendNf(ctx, "Pi idle");
  });
}
