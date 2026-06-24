import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { APP_SESSION_COOKIE_NAME } from "../../../lib/auth/session";

export async function logoutAction() {
  "use server";
  const cookieStore = await cookies();
  cookieStore.delete(APP_SESSION_COOKIE_NAME);
  redirect("/");
}
