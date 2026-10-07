import { requireUserForRead } from "@/lib/auth/session";
import { getDashboardView } from "@/lib/services/dashboard";
import DashboardClient from "./DashboardClient";
import HubReadySignal from "./HubReadySignal";

export default async function HubPage() {
  const user = await requireUserForRead();
  const initial = await getDashboardView(user.uid, user.displayName || user.email);
  return <><HubReadySignal /><DashboardClient key={user.uid} initial={initial} /></>;
}
