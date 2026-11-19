import { redirect } from "next/navigation";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function CommunityLeaderboardRedirectPage({ searchParams }: Props) {
  const sp = await searchParams;
  const period = typeof sp.period === "string" && sp.period.toLowerCase() === "weekly" ? "weekly" : null;
  redirect(period === "weekly" ? "/leaderboard?tab=weekly" : "/leaderboard");
}
