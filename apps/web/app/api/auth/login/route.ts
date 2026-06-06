import { NextRequest } from "next/server";
import { handleLoginDelete, handleLoginPost } from "./handler";

export async function POST(request: NextRequest): Promise<Response> {
  return handleLoginPost(request);
}

export async function DELETE(): Promise<Response> {
  return handleLoginDelete();
}
