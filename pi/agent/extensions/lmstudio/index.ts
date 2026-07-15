/**
 * LM Studio provider for pi
 *
 * Auto-discovers whatever model is currently loaded/served by the LM Studio
 * local server and registers it as a pi provider. Re-run discovery by typing
 * /reload after loading a different model in LM Studio.
 *
 * Setup in LM Studio (Developer tab):
 *   1. Load a model (e.g. an MLX build of qwen3.6).
 *   2. Start the local server (default port 1234).
 *
 * Then start pi (or /reload if pi is already running) and pick the model via
 * /model -> lmstudio/<model-id>.
 *
 * The base URL and port can be overridden with the LMSTUDIO_BASE_URL env var
 * (default: http://localhost:1234/v1).
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const BASE_URL =
	process.env.LMSTUDIO_BASE_URL ?? "http://localhost:1234/v1";

interface LMStudioModel {
	id: string;
	name?: string;
	context_window?: number;
	context_length?: number;
	max_tokens?: number;
	max_completion_tokens?: number;
	loaded_context_length?: number;
}

interface LMStudioModelsResponse {
	data: LMStudioModel[];
}

/** LM Studio runs on llama.cpp; most "OpenAI-compatible" extras should be disabled. */
const COMPAT = {
	supportsDeveloperRole: false, // send "system" instead of "developer"
	supportsReasoningEffort: false, // no reasoning_effort param
	maxTokensField: "max_tokens" as const, // not max_completion_tokens
};

function isThinkingModel(id: string): boolean {
	const lower = id.toLowerCase();
	return (
		lower.includes("thinking") ||
		lower.includes("reason") ||
		/qwen[-.]?3/.test(lower) ||
		lower.includes("deepseek-r") ||
		lower.includes("gpt-oss")
	);
}

function isQwenModel(id: string): boolean {
	return /qwen/i.test(id);
}

export default async function (pi: ExtensionAPI) {
	let models: ReturnType<typeof mapModel>[] = [];
	let reachable = false;

	try {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 3000);
		const response = await fetch(`${BASE_URL}/models`, {
			signal: controller.signal,
		});
		clearTimeout(timeout);

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}`);
		}

		const payload = (await response.json()) as LMStudioModelsResponse;
		reachable = true;
		models = (payload.data ?? []).map(mapModel);
	} catch (error) {
		reachable = false;
		// Non-fatal: user may start LM Studio later, then /reload.
		console.error(
			`[lmstudio] could not reach ${BASE_URL}: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
	}

	pi.registerProvider("lmstudio", {
		name: "LM Studio (Local)",
		baseUrl: BASE_URL,
		// LM Studio ignores the key; pi just needs *some* auth value present
		// so the models are selectable in /model.
		apiKey: "lm-studio",
		api: "openai-completions",
		compat: COMPAT,
		models,
	});

	// Surface status so it's obvious whether discovery succeeded.
	pi.on("session_start", (_event, ctx) => {
		if (reachable && models.length > 0) {
			ctx.ui.notify(
				`LM Studio: ${models.length} model(s) available -> /model`,
				"info",
			);
		} else {
			ctx.ui.notify(
				`LM Studio not reachable at ${BASE_URL}. Start its server, then /reload.`,
				"info",
			);
		}
	});

	function mapModel(model: LMStudioModel) {
		const thinking = isThinkingModel(model.id);
		const contextWindow =
			model.context_window ??
			model.context_length ??
			model.loaded_context_length ??
			32768;
		const maxTokens =
			model.max_tokens ?? model.max_completion_tokens ?? 8192;

		return {
			id: model.id,
			name: model.name ?? model.id,
			reasoning: thinking,
			// LM Studio will accept images for VLM builds (e.g. qwen3.x). Safe to
			// advertise image input; if a text-only model is loaded, just don't
			// attach images.
			input: ["text", "image"] as const,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			contextWindow,
			maxTokens,
			...(thinking && isQwenModel(model.id)
				? {
						compat: {
							...COMPAT,
							// Local Qwen servers read chat_template_kwargs.enable_thinking
							thinkingFormat: "qwen-chat-template" as const,
						},
					}
				: {}),
		};
	}
}
