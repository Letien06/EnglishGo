import AppTopbar from "@/components/AppTopbar";
import { requireUser } from "@/lib/auth/session";
import { getPetDashboard, getPetLeaderboard } from "@/lib/services/pet";
import PetDashboardClient from "./PetDashboardClient";

export const dynamic = "force-dynamic";

export default async function PetPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const [user, query] = await Promise.all([requireUser(), searchParams]);
  const [dashboard, weeklyLeaders] = await Promise.all([
    getPetDashboard(user.uid),
    getPetLeaderboard("weekly"),
  ]);
  const initialTab = query.tab === "shop" || query.tab === "inventory" || query.tab === "leaderboard"
    ? query.tab
    : "home";

  return (
    <>
      <AppTopbar
        pageTitle="Mèo cưng"
        pageSubtitle="Học chăm chỉ để Mực lớn lên từng ngày"
        userName={user.displayName}
        userEmail={user.email}
      />
      <PetDashboardClient
        initialDashboard={dashboard}
        initialLeaders={weeklyLeaders}
        initialTab={initialTab}
        currentUid={user.uid}
      />
    </>
  );
}
