function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function(pi) {
  pi.on("agent_end", async (_event, ctx) => {
    try {
      let idle = ctx.isIdle();
      if (!idle) {
        for (let i = 0; i < 10; i++) {
          await sleep(300);
          idle = ctx.isIdle();
          if (idle) break;
        }
      }

      const branch = await pi.exec("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
        cwd: ctx.cwd,
        timeout: 15000,
      });

      const name = (branch.stdout || "").trim() || "unknown";
      const message = `Pi finished [${name}]`;

      await pi.exec("nf", [message], {
        cwd: ctx.cwd,
        timeout: 15000,
      });
    } catch {
      // Best effort only, stay quiet if git/nf fails.
    }
  });
}
