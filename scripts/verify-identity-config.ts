const mode = process.env.SPECFORGE_IDENTITY_MODE ?? "development";
const pepper = process.env.SPECFORGE_IDENTITY_SECRET_PEPPER ?? "";
const databaseUrl = process.env.DATABASE_URL ?? "";
const failures: string[] = [];
if (!databaseUrl.startsWith("postgresql://") && !databaseUrl.startsWith("postgres://")) failures.push("DATABASE_URL must be a PostgreSQL connection string");
if (mode === "local-account") {
  if (pepper.length < 32) failures.push("SPECFORGE_IDENTITY_SECRET_PEPPER must be at least 32 characters");
  if (process.env.SPECFORGE_MCP_BEARER_TOKEN) failures.push("SPECFORGE_MCP_BEARER_TOKEN is forbidden in local-account mode");
  if (!process.env.SPECFORGE_WEB_ORIGIN) failures.push("SPECFORGE_WEB_ORIGIN is required in local-account mode");
} else if (mode !== "development") failures.push(`Unsupported SPECFORGE_IDENTITY_MODE: ${mode}`);
if (failures.length) { console.error(JSON.stringify({ status: "INVALID", failures }, null, 2)); process.exitCode = 1; }
else console.log(JSON.stringify({ status: "VALID", mode, database: "postgresql", staticBearer: mode === "development" }, null, 2));
