import { NextRequest } from "next/server";

import { handleValidationConfigGet } from "./handler";

export async function GET(request: NextRequest): Promise<Response> {
  return handleValidationConfigGet(request);
}
