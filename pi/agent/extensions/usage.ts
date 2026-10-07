// /usage — show remaining z.ai (GLM), OpenAI Codex, and Claude Code quota
// with reset times in local time. Sources:
//   z.ai:    GET https://api.z.ai/api/monitor/usage/quota/limit  (Bearer zai.key)
//   Codex:   GET https://chatgpt.com/backend-api/wham/usage      (Bearer access token, refreshed via auth.openai.com)
//   Claude:  GET https://api.anthropic.com/api/oauth/usage       (Bearer Claude Code OAuth token; the same
//            subscription quota pi-claude-bridge consumes by spawning Claude Code)
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { readFileSync, writeFileSync, renameSync, statSync, chmodSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

const ZAI_URL = "https://api.z.ai/api/monitor/usage/quota/limit";
const TOKEN_URL = "https://auth.openai.com/oauth/token";
const USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
const CLAUDE_USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
const CLAUDE_OAUTH_BETA = "oauth-2025-04-20";
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

/** readAuth, or undefined when auth.json is missing/unreadable (treated as logged out). */
function readAuthOrNull(): any {
  try {
    return readAuth();
  } catch {
    return undefined;
  }
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
  if (!Number.isFinite(epochMs)) return "?";
  const d = new Date(epochMs);
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
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
  const key = readAuthOrNull()?.zai?.key;
  if (!key) throw new Error("not logged in — run /login zai");
  const j = await getJson(ZAI_URL, { Authorization: `Bearer ${key}` });
  if (j.code !== 200 || !Array.isArray(j.data?.limits)) throw new Error(`bad response (code ${j.code})`);
  const windows: QuotaWindow[] = j.data.limits
    .filter((l: any) => ZAI_UNITS[l.unit])
    .map((l: any) => ({
      label: ZAI_UNITS[l.unit],
      usedPct: Number.isFinite(l.percentage) ? l.percentage : undefined,
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
  const cred = readAuthOrNull()?.["openai-codex"];
  if (!cred?.access || !cred?.refresh) throw new Error("not logged in — run /login openai-codex");
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
    if (!w || !Number.isFinite(w.used_percent)) continue;
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

// ─── Claude Code (quota shared with pi-claude-bridge) ───────
/** Claude Code's OAuth token: macOS keeps it in the login keychain, other
 *  platforms in ~/.claude/.credentials.json. Claude Code refreshes and rotates
 *  it itself (the bridge spawns Claude Code, so it stays fresh) — we only read. */
function readClaudeOauth(): { accessToken: string; tier?: string } {
  let raw: string;
  try {
    raw = process.platform === "darwin"
      ? execFileSync("security", ["find-generic-password", "-s", "Claude Code-credentials", "-w"],
          { encoding: "utf-8", timeout: TIMEOUT_MS, stdio: ["ignore", "pipe", "ignore"] })
      : readFileSync(join(homedir(), ".claude", ".credentials.json"), "utf-8");
  } catch {
    throw new Error("not logged in — run `claude` and log in");
  }
  let oauth: any;
  try {
    oauth = JSON.parse(raw)?.claudeAiOauth;
  } catch {
    throw new Error("stored credentials unreadable — run `claude` and log in again");
  }
  if (!oauth?.accessToken) throw new Error("not logged in — run `claude` and log in");
  return { accessToken: oauth.accessToken, tier: oauth.rateLimitTier ?? oauth.subscriptionType };
}

/** Rate-limit windows report utilization as a 0–1 fraction; extra_usage already as percent.
 *  Normalizes either to a whole percent for display. */
function claudePct(v: number): number {
  return Math.round(v <= 1 ? v * 100 : v);
}

async function fetchClaude(): Promise<ProviderQuota> {
  const { accessToken, tier } = readClaudeOauth();
  const j = await getJson(CLAUDE_USAGE_URL, {
    Authorization: `Bearer ${accessToken}`,
    "anthropic-beta": CLAUDE_OAUTH_BETA, // endpoint 401s without it
  });
  const windows: QuotaWindow[] = [];
  // Plans without a given window report it as null (e.g. credits-based tiers).
  for (const [key, label] of [["five_hour", "5h"], ["seven_day", "Weekly"]] as const) {
    const w = j[key];
    if (!w || !Number.isFinite(w.utilization)) continue;
    windows.push({ label, usedPct: claudePct(w.utilization), reset: w.resets_at ? fmtReset(Date.parse(w.resets_at)) : "?" });
  }
  const eu = j.extra_usage;
  if (eu?.is_enabled && Number.isFinite(eu.utilization)) {
    const dp = eu.decimal_places ?? 2;
    const sym = eu.currency === "USD" ? "$" : eu.currency ? `${eu.currency} ` : "";
    const fmt = (v: number) => `${sym}${(v / 10 ** dp).toFixed(dp)}`;
    const monthly = (j.limits ?? []).find((l: any) => l?.is_active && Date.parse(l.resets_at));
    windows.push({
      label: "Extra credits",
      usedPct: claudePct(eu.utilization),
      note: `${fmt(eu.used_credits)} of ${fmt(eu.monthly_limit)}`,
      reset: monthly ? fmtReset(Date.parse(monthly.resets_at)) : "",
    });
    if (eu.spend_limit_reached) windows.push({ label: "credit limit", usedPct: 100, reset: "—" });
  }
  return { name: `Claude Code (${tier ?? "?"})`, windows };
}

// ─── command ─────────────────────────────────────────────────
async function quotaReport(): Promise<string> {
  // name/loginHint/fetch travel together so the error hints can never misroute.
  const providers = [
    { name: "z.ai", loginHint: "run /login zai", fetch: fetchZai },
    { name: "Codex", loginHint: "run /login openai-codex", fetch: fetchCodex },
    { name: "Claude", loginHint: "run `claude` and log in", fetch: fetchClaude },
  ];
  const results = await Promise.allSettled(providers.map((p) => p.fetch()));
  const lines: string[] = ["Quota"];
  results.forEach((r, i) => {
    const p = providers[i];
    if (r.status === "rejected") {
      let msg = String(r.reason?.message ?? r.reason);
      if (/HTTP 40[013]/.test(msg)) msg = `not logged in or session expired — ${p.loginHint}`;
      else if (msg === "fetch failed" && r.reason?.cause?.message) msg = String(r.reason.cause.message);
      lines.push("", `✗ ${p.name}: ${msg.slice(0, 160)}`);
      return;
    }
    const q = r.value;
    lines.push("", q.name);
    if (q.windows.length === 0) lines.push("  no quota windows reported");
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
  pi.registerCommand("usage", { description: "Show z.ai / Codex / Claude Code usage and reset times", handler });
}
