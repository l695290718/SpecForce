import { NextResponse } from "next/server";
import { runGovernanceChecks } from "@specforge/core";
import { getGovernanceTargetsWithDatabase } from "../../../../lib/assets";

export async function GET(request: Request) {
  const targets = await getGovernanceTargetsWithDatabase(new URL(request.url).searchParams.get("scope") ?? "");
  return NextResponse.json((await Promise.all(targets.map((target) => runGovernanceChecks(target.type, target.id)))).flat());
}
