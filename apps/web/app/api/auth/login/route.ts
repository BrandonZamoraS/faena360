import { NextRequest } from "next/server";
import { handleLoginDelete, handleLoginPost } from "./handler";

/**
 * Entrega de Next.js: delega a handlers testeables.
 */

export async function POST(request: NextRequest): Promise<Response> {
  return handleLoginPost(request);
}

/**
 * DELETE limpia la cookie local firmada para cerrar sesión de app.
 */
export async function DELETE(): Promise<Response> {
  return handleLoginDelete();
}
