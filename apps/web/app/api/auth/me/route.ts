import { NextRequest } from "next/server";
import { handleMeGet, handleMePost } from "./handler";

/**
 * Ruteo de Next.js para `/api/auth/me`.
 */

export async function GET(request: NextRequest): Promise<Response> {
  return handleMeGet(request);
}

export async function POST(request: NextRequest): Promise<Response> {
  return handleMePost(request);
}
