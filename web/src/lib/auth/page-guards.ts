import { redirect } from "next/navigation";
import { getCurrentUser, getFreshStoredUser } from "./session";

/** Friendly page guard: API guards throw 401/403, pages redirect to the app. */
export async function requireAdminPage() {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) redirect("/login?from=%2Fadmin");
  const freshUser = await getFreshStoredUser(sessionUser.uid);
  if (!freshUser || freshUser.role !== "ADMIN") redirect("/hub");
  return freshUser;
}
