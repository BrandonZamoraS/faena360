import { NextRequest } from "next/server";
import { handleWhatsappIdentifyPost } from "./handler";

export async function POST(request: NextRequest): Promise<Response> {
  return handleWhatsappIdentifyPost(request);
}
