import { NextResponse } from "next/server";
import { prisma } from "../../lib/db";

export async function GET() {
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json({ status: "unavailable" }, { status: 503 });
  }
}
