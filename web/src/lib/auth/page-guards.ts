import { redirect } from "next/navigation";
import { getCurrentUser } from "./session";

/** Friendly page guard: API guards throw 401/403, pages redirect to the app. */
export async function requireAdminPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") redirect("/hub");
  return user;
}
