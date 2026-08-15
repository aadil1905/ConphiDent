import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { searchWorkspace } from "@/lib/workspace-search";

export const dynamic = "force-dynamic";

/** Feeds the command palette. Same answers as the Find anything page. */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ hits: [] }, { status: 401 });

  const query = new URL(request.url).searchParams.get("q") ?? "";
  const hits = await searchWorkspace({ clinicId: user.clinicId, role: user.role }, query);
  return NextResponse.json({ hits });
}
