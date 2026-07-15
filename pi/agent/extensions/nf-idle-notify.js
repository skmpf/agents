import os from "node:os";
import path from "node:path";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function(pi) {
  pi.on("agent_end", async (_event, ctx) => {
    // Only the main agent notifies; subagents (single/chain/parallel/async) are suppressed.
    if (process.env.PI_SUBAGENT_CHILD === "1") return;
    try {
      let idle = ctx.isIdle();
      if (!idle) {
        for (let i = 0; i < 10; i++) {
          await sleep(300);
          idle = ctx.isIdle();
          if (idle) break;
        }
      }

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

      const parts = [`host:${host}`, `repo:${repo}`];
      if (branchName) parts.push(`branch:${branchName}`);
      const message = `Pi idle · ${parts.join(" · ")}`;

      await pi.exec("nf", [message], {
        cwd: ctx.cwd,
        timeout: 15000,
      });
    } catch {
      // Best effort only, stay quiet if git/nf fails.
    }
  });
}
