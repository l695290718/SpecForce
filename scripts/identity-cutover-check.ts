import { Buffer } from "node:buffer";

const mode = process.env.SPECFORGE_IDENTITY_MODE ?? "development";
const webAuthMode = (process.env.SPECFORGE_WEB_AUTH_MODE ?? "").toLowerCase();
const failures: string[] = [];
const checks: Record<string, string> = {};

if (mode !== "local-account") failures.push("SPECFORGE_IDENTITY_MODE must be local-account");
else checks.identityMode = "local-account";

if (webAuthMode !== "local-account") failures.push("SPECFORGE_WEB_AUTH_MODE must be local-account");
else checks.webAuthMode = "local-account";

const pepper = process.env.SPECFORGE_IDENTITY_SECRET_PEPPER ?? "";
if (pepper.length < 32 || pepper.toLowerCase().includes("replace-with")) failures.push("identity pepper is missing, too short, or still a placeholder");
else checks.identityPepper = "configured";

if (process.env.SPECFORGE_MCP_BEARER_TOKEN) failures.push("shared SPECFORGE_MCP_BEARER_TOKEN must be removed");
else checks.sharedBearer = "absent";

if (process.env.SPECFORGE_MCP_SEED === "1") failures.push("SPECFORGE_MCP_SEED=1 is forbidden at cutover");
else checks.seedIdentity = "disabled";

const claims = process.env.SPECFORGE_WEB_PRINCIPAL_CLAIMS?.trim();
if (claims) failures.push("SPECFORGE_WEB_PRINCIPAL_CLAIMS must be removed at cutover");
else checks.staticWebPrincipal = "absent";

const origin = process.env.SPECFORGE_WEB_ORIGIN ?? "";
if (!origin.startsWith("https://")) failures.push("SPECFORGE_WEB_ORIGIN must use https:// at cutover");
else checks.webOrigin = "https";

if (!process.env.SPECFORGE_TLS_TERMINATION) failures.push("SPECFORGE_TLS_TERMINATION must identify the external or managed TLS boundary");
else checks.tlsTermination = "configured";

const cursorKeys = readCursorKeys();
if (!cursorKeys) failures.push("SPECFORGE_3A_CURSOR_KEYS must be a non-default JSON keyring with an active key");
else checks.cursorKeyring = "configured";

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl && !databaseUrl.startsWith("postgresql://") && !databaseUrl.startsWith("postgres://")) failures.push("DATABASE_URL must be PostgreSQL when supplied");
if (databaseUrl) checks.database = "postgresql";
else checks.database = "compose-injected";

const result = { status: failures.length ? "BLOCKED" : "READY", checks, failures, notes: [
  "This check is read-only and does not revoke sessions or apply migration grants.",
  "Run it during a maintenance window after the reviewed migration report has been applied.",
  "The bundled Compose database URL is injected inside the web container; this host check reports it as compose-injected when DATABASE_URL is absent."
] };
console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exitCode = 1;

function readCursorKeys(): boolean {
  const raw = process.env.SPECFORGE_3A_CURSOR_KEYS?.trim();
  const activeKeyId = process.env.SPECFORGE_3A_CURSOR_ACTIVE_KEY_ID?.trim();
  if (!raw || !activeKeyId) return false;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const active = parsed[activeKeyId];
    if (typeof active !== "string" || !active) return false;
    const decoded = Buffer.from(active, "base64");
    if (decoded.length < 32) return false;
    if (decoded.toString("utf8") === "specforge-local-development-cursor-key" || decoded.toString("utf8") === "specforge-local-deployment-cursor-key") return false;
    return true;
  } catch {
    return false;
  }
}
