import { execSync } from "node:child_process";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Resolve work's address from ssh config so the IP never lands in dotfiles.
// If the ssh host isn't configured, ssh -G echoes the literal name back — skip.
export default async function (pi: ExtensionAPI) {
  const line = execSync("ssh -G work", { stdio: ["ignore", "pipe", "ignore"] }).toString().split("\n").find((l) => l.startsWith("hostname "));
  const ip = line?.split(" ")[1]?.trim();
  if (!ip || ip === "work") return;

  // Honest context window: LM Studio JIT auto-fits to ~42K on 32 GB, far below
  // the 262K the model advertises. Query what's actually loaded so pi's
  // overflow detection matches reality; falls back to the observed auto-fit.
  let contextWindow = 42496;
  try {
    const res = await fetch(`http://${ip}:1234/api/v0/models`);
    const models = (await res.json()) as Array<{ id: string; loaded_context_length?: number; state: string }>;
    const loaded = models.find((m) => m.id === "qwen3.8-27b-mlx" && m.state === "loaded");
    if (loaded?.loaded_context_length) contextWindow = loaded.loaded_context_length;
  } catch {}

  pi.registerProvider("lmstudio", {
    name: "LM Studio (work)",
    baseUrl: `http://${ip}:1234/v1`,
    api: "openai-completions",
    apiKey: "lm-studio",
    models: [
      {
        id: "qwen3.8-27b-mlx",
        name: "Qwen3.8 27B (work)",
        reasoning: true,
        input: ["text", "image"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow,
        maxTokens: 16384,
        // Thinking is always on server-side and LM Studio has no reasoning
        // fields to map an effort onto — sending one just spams its logs.
        compat: { supportsReasoningEffort: false },
      },
    ],
  });
}
