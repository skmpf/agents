import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  // Subagent suppression: pi-subagents foreground children never load the
  // parent's ambient extensions and background runners spawn with --no-extensions,
  // so this factory only runs in the main session. PI_SUBAGENT_PARENT_SESSION
  // marks detached runner processes; guard anyway in case this file is ever
  // loaded there explicitly.
  if (process.env.PI_SUBAGENT_PARENT_SESSION) return;

  async function sendNf(cwd: string, message: string) {
    try {
      // Branch + repo root in one git call. Falls back gracefully outside a repo.
      const git = await pi.exec(
        "git",
        ["rev-parse", "--abbrev-ref", "HEAD", "--show-toplevel"],
        { cwd, timeout: 15000 },
      );
      const lines = (git.stdout || "").split("\n");
      const branchName = (lines[0] || "").trim();
      const toplevel = (lines[1] || "").trim();

      const host = (os.hostname() || "unknown").split(".")[0] || "unknown";
      const repo = toplevel ? path.basename(toplevel) : path.basename(cwd);

      // Two lines: what happened, then where. Emoji anchor a phone glance;
      // branch drops out outside a repo.
      const context = [`📦 ${repo}`];
      if (branchName) context.push(`🌿 ${branchName}`);
      context.push(`💻 ${host}`);
      await pi.exec("nf", [[message, context.join(" · ")].join("\n")], {
        cwd,
        timeout: 15000,
      });
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

  // Session cwd/mode for event handlers that receive no ctx. session_start
  // captures both before the first run (including resumed sessions whose
  // cwd differs from the launch dir); agent_settled keeps cwd fresh after
  // mid-session changes. process.cwd()/"tui" are belt-and-braces defaults
  // for a handler firing before session_start, which shouldn't happen.
  let lastCwd = process.cwd();
  let lastMode: string = "tui";
  pi.on("session_start", (_event, ctx) => {
    lastCwd = ctx.cwd;
    lastMode = ctx.mode;
  });

  // @juicesharp/rpiv-ask-user-question emits rpiv:ask-user:prompt when its
  // questionnaire blocks the run on user input. Ping right away — the
  // agent_settled idle ping cannot fire while a question is open. The ask
  // ping may run long (question text on its own line); the idle one stays 2 lines.
  pi.events.on("rpiv:ask-user:prompt", (payload) => {
    if (!enabled) return;
    if (lastMode !== "tui") return; // headless rpc/json/print runs don't ping the desktop
    const first = (payload as any)?.questions?.[0];
    const question = typeof first?.question === "string" ? first.question.trim() : "";
    const body = question.length > 200 ? `${question.slice(0, 200)}…` : question;
    void sendNf(lastCwd, body ? `❓ Pi asks\n${body}` : "❓ Pi asks a question");
  });

  // pi-subagents exposes an in-process event-bus RPC. Track readiness so we
  // never stall (or wait on a timeout) when pi-subagents is not installed.
  let subagentsReady = false;
  pi.events.on("subagents:rpc:v1:ready", () => {
    subagentsReady = true;
  });

  // Active children (foreground + async jobs/steps) for the current session,
  // 0 when unknown. Fails open: an error or a stalled reply means 0, so the
  // idle ping still fires rather than going silent.
  async function activeSubagentCount(): Promise<number> {
    if (!subagentsReady) return 0;
    const requestId = randomUUID();
    return new Promise((resolve) => {
      const unsubscribe = pi.events.on(
        `subagents:rpc:v1:reply:${requestId}`,
        (reply) => {
          cleanup();
          // Failure or missing fields both fall through to 0 (fail open).
          const total = (reply as any)?.data?.fleet?.totalActive;
          resolve(typeof total === "number" ? total : 0);
        },
      );
      const timer = setTimeout(() => {
        cleanup();
        resolve(0);
      }, 2000);
      function cleanup() {
        clearTimeout(timer);
        unsubscribe();
      }
      pi.events.emit("subagents:rpc:v1:request", {
        version: 1,
        requestId,
        method: "status",
        params: {},
      });
    });
  }

  // agent_settled fires only when no automatic retry, compaction recovery, or
  // queued continuation remains — the true "main agent idle" moment. No polling.
  pi.on("agent_settled", async (_event, ctx) => {
    lastCwd = ctx.cwd;
    if (!enabled) return;
    if (ctx.mode !== "tui") return; // headless rpc/json/print runs don't ping the desktop
    if (!ctx.isIdle()) return; // belt-and-braces alongside agent_settled
    // Async subagent runs outlive the main run; their completion wakes the
    // session and settles it again. Hold the ping until then.
    if ((await activeSubagentCount()) > 0) return;
    await sendNf(ctx.cwd, "💤 Pi idle");
  });
}
