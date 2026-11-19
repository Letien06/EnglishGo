import { redirect } from "next/navigation";
import { getCurrentUserForRead } from "@/lib/auth/session";
import { getDashboardView } from "@/lib/services/dashboard";
import DashboardClient from "./DashboardClient";
import HubReadySignal from "./HubReadySignal";

export default async function HubPage() {
  const user = await getCurrentUserForRead();
  if (!user) redirect("/login?from=%2Fhub");
  const initial = await getDashboardView(user.uid, user.displayName || user.email);
  return <><HubReadySignal /><DashboardClient key={user.uid} uid={user.uid} initial={initial} /></>;
}
