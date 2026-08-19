// Local LM Studio (MLX) provider for agentic coding.
// Serves OpenAI-compatible API on localhost:1234.
export default function (pi: any) {
  pi.registerProvider("lm-studio", {
    name: "LM Studio (local)",
    baseUrl: "http://localhost:1234/v1",
    apiKey: "lm-studio", // server ignores it; field required
    api: "openai-completions",
    models: [
      {
        id: "qwen3.8-27b-mlx",
        name: "Qwen3.8-27B MLX 4bit (local)",
        reasoning: true,
        input: ["text", "image"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 40960, // below LM Studio's ~42K auto-fit ceiling on 32 GB
        maxTokens: 16384,
        compat: {
          thinkingFormat: "qwen-chat-template",
          requiresToolResultName: true,
        },
      },
    ],
  });
}
