import { NextResponse } from "next/server";

/** Legacy URL compatibility only. This endpoint no longer accepts requests. */
export async function POST() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
