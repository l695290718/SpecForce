import { NextResponse } from "next/server";
import { getStore } from "@specforge/core";

export async function GET() {
  return NextResponse.json(getStore().proposals);
}
