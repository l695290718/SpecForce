import { NextResponse } from "next/server";
import { getProposalsWithDatabase } from "../../../lib/assets";

export async function GET(request: Request) {
  return NextResponse.json(await getProposalsWithDatabase(new URL(request.url).searchParams.get("scope") ?? ""));
}
