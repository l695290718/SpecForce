import { NextResponse } from "next/server";
import { getContextPackWithDatabase } from "../../../../lib/assets";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return NextResponse.json(await getContextPackWithDatabase(id));
}
