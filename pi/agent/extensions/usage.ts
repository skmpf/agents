// /usage — show remaining z.ai (GLM) and OpenAI Codex quota
// with reset times in local time. Sources:
//   z.ai:    GET https://api.z.ai/api/monitor/usage/quota/limit  (Bearer zai.key)
//   Codex:   GET https://chatgpt.com/backend-api/wham/usage      (Bearer access token, refreshed via auth.openai.com)
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { readFileSync, writeFileSync, renameSync, statSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const ZAI_URL = "https://api.z.ai/api/monitor/usage/quota/limit";
const TOKEN_URL = "https://auth.openai.com/oauth/token";
const USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
const CODEX_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const TIMEOUT_MS = 10_000;
const REFRESH_MARGIN_MS = 60 * 60 * 1000;
const AUTH_DIR = process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");

interface QuotaWindow {
  label: string;
  usedPct?: number; // undefined if unknown
  note?: string; // e.g. "4607/20000 left"
  reset: string; // human-readable local-time reset
}

interface ProviderQuota {
  name: string;
  windows: QuotaWindow[];
  warning?: string;
}

function readAuth(): any {
  return JSON.parse(readFileSync(join(AUTH_DIR, "auth.json"), "utf-8"));
}

async function getJson(url: string, headers: Record<string, string>): Promise<any> {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${text.slice(0, 120)}`);
  }
  return res.json();
}

// ─── formatting ──────────────────────────────────────────────
function humanDuration(ms: number): string {
  if (ms <= 60_000) return "<1m";
  const m = Math.floor(ms / 60_000);
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), min = m % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${min}m`;
  return `${min}m`;
}

function fmtReset(epochMs: number): string {
  const d = new Date(epochMs);
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const day = d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  return `in ${humanDuration(epochMs - Date.now())} · ${day} ${time}`;
}

function bar(pct: number): string {
  const filled = Math.max(0, Math.min(20, Math.round(pct / 5)));
  return "█".repeat(filled) + "░".repeat(20 - filled);
}

// ─── z.ai ────────────────────────────────────────────────────
const ZAI_UNITS: Record<number, string> = { 3: "5h", 6: "Weekly" };

async function fetchZai(): Promise<ProviderQuota> {
  const key = readAuth()?.zai?.key;
  if (!key) throw new Error("no z.ai key in auth.json (/login zai)");
  const j = await getJson(ZAI_URL, { Authorization: `Bearer ${key}` });
  if (j.code !== 200 || !Array.isArray(j.data?.limits)) throw new Error(`bad response (code ${j.code})`);
  const windows: QuotaWindow[] = j.data.limits
    .filter((l: any) => ZAI_UNITS[l.unit])
    .map((l: any) => ({
      label: ZAI_UNITS[l.unit],
      usedPct: typeof l.percentage === "number" ? l.percentage : undefined,
      reset: l.nextResetTime ? fmtReset(l.nextResetTime) : "?",
    }));
  return { name: `z.ai GLM (${j.data?.level ?? "?"})`, windows };
}

// ─── Codex ───────────────────────────────────────────────────
function decodeJwtExpMs(token: string): number {
  try {
    return JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf-8")).exp * 1000;
  } catch {
    return 0;
  }
}

let codexRefresh: Promise<[string, string]> | null = null;
let codexWriteWarning: string | undefined;

/** Refresh the ChatGPT OAuth token and rotate the result back into auth.json. */
function refreshCodex(refreshToken: string): Promise<[string, string]> {
  codexRefresh ??= (async () => {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: CODEX_CLIENT_ID,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`token refresh failed: HTTP ${res.status}`);
    const j = await res.json();
    if (!j.access_token || !j.refresh_token) throw new Error("refresh response missing tokens");
    try {
      const path = join(AUTH_DIR, "auth.json");
      const data = readAuth();
      const exp = decodeJwtExpMs(j.access_token);
      data["openai-codex"] = {
        ...data["openai-codex"],
        type: "oauth",
        access: j.access_token,
        refresh: j.refresh_token,
        expires: exp > 0 ? exp : Date.now() + 28 * 24 * 3600 * 1000,
      };
      const tmp = path + ".tmp";
      writeFileSync(tmp, JSON.stringify(data, null, 2));
      // Keep auth.json's permissions (often 0600) — rename would otherwise install tmp's mode.
      chmodSync(tmp, statSync(path).mode & 0o777);
      renameSync(tmp, path);
    } catch (err: any) {
      // The rotated refresh token was NOT persisted; without it the next refresh needs re-login.
      codexWriteWarning = `token rotation write-back failed (${err?.message ?? err})`;
    }
    return [j.access_token, j.refresh_token] as [string, string];
  })().finally(() => {
    codexRefresh = null;
  });
  return codexRefresh;
}

async function fetchCodex(): Promise<ProviderQuota> {
  codexWriteWarning = undefined;
  const cred = readAuth()?.["openai-codex"];
  if (!cred?.access || !cred?.refresh) throw new Error("no openai-codex credential (/login openai-codex)");
  let access = cred.access;
  const exp = cred.expires > 0 ? cred.expires : decodeJwtExpMs(access);
  if (exp > 0 && Date.now() > exp - REFRESH_MARGIN_MS) {
    [access] = await refreshCodex(cred.refresh);
  }
  const j = await getJson(USAGE_URL, { Authorization: `Bearer ${access}`, Accept: "application/json" });
  const rl = j.rate_limit ?? {};
  // Classify by window length: OpenAI assigns primary/secondary differently per plan.
  const windows: QuotaWindow[] = [];
  for (const key of ["primary_window", "secondary_window"]) {
    const w = rl[key];
    if (!w || typeof w.used_percent !== "number") continue;
    const isFiveHour = (w.limit_window_seconds || 0) <= 6 * 3600;
    windows.push({
      label: isFiveHour ? "5h" : "Weekly",
      usedPct: w.used_percent,
      reset: w.reset_at ? fmtReset(w.reset_at * 1000) : "?",
    });
  }
  if (rl.limit_reached) windows.push({ label: "rate limited", usedPct: 100, reset: "—" });
  return { name: `Codex ChatGPT (${j.plan_type ?? "?"})`, windows, warning: codexWriteWarning };
}

// ─── command ─────────────────────────────────────────────────
async function quotaReport(): Promise<string> {
  const names = ["z.ai", "Codex"];
  const results = await Promise.allSettled([fetchZai(), fetchCodex()]);
  const lines: string[] = ["Quota"];
  results.forEach((r, i) => {
    if (r.status === "rejected") {
      lines.push("", `✗ ${names[i]}: ${String(r.reason?.message ?? r.reason).slice(0, 160)}`);
      return;
    }
    const q = r.value;
    lines.push("", q.name);
    for (const w of q.windows) {
      const usage = w.usedPct !== undefined ? `${bar(w.usedPct)} ${w.usedPct}% used` : "—";
      const note = w.note ? ` (${w.note})` : "";
      const reset = w.reset ? `  resets ${w.reset}` : "";
      lines.push(`  ${w.label.padEnd(17)} ${usage}${note}${reset}`);
    }
    if (q.warning) lines.push(`  ⚠ ${q.warning}`);
  });
  return lines.join("\n");
}

export default function (pi: ExtensionAPI) {
  const handler = async (_args: string, ctx: ExtensionCommandContext) => {
    ctx.ui.notify("fetching quotas…", "info");
    try {
      ctx.ui.notify(await quotaReport(), "info");
    } catch (err: any) {
      ctx.ui.notify(`quota: ${err.message}`, "error");
    }
  };
  pi.registerCommand("usage", { description: "Show z.ai / Codex usage and reset times", handler });
}
