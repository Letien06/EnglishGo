import { redirect } from "next/navigation";
import Link from "next/link";
import { getReadIdentity } from "@/lib/auth/session";
import { getMistakeSession } from "@/lib/services/mistake-review";
import ReadPracticeClient from "../../read/practice/ReadPracticeClient";
import ListenPracticeClient from "../../listen/practice/ListenPracticeClient";

export default async function MistakePracticePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const user = await getReadIdentity();
  if (!user) redirect("/login?redirect=%2Fvocab%2Freview");
  const skill = params.skill === "listening" ? "listening" : "reading";
  const part = Math.max(skill === "reading" ? 5 : 1, Math.min(skill === "reading" ? 7 : 4, Number(params.part) || (skill === "reading" ? 5 : 1)));
  const level = Math.max(1, Math.min(4, Number(params.level) || 1));
  const session = await getMistakeSession(user.uid, skill, part, level, params.testId);
  if (!session?.items.length) return <main className="p-6"><h1 className="text-xl font-bold">Không còn câu sai trong bài này</h1><Link href="/vocab/review">Quay lại Ôn hôm nay</Link></main>;
  const reviewRun = /^[a-zA-Z0-9-]{1,64}$/.test(params.run ?? "") ? params.run! : "review";
  const props = { session, partId: `part${part}`, partNum: part, level, mode: params.mode === "bilingual" ? "bilingual" : "normal", userLoggedIn: true, userUid: user.uid, initialIndex: Math.max(0, Math.min(session.items.length - 1, Number(params.q) || 0)), reviewRun };
  return <><div className="px-4 py-2 text-sm text-ink2"><Link href="/vocab/review">← Ôn hôm nay</Link> · Làm lại câu sai; xem giải thích sau khi trả lời.</div>{skill === "reading" ? <ReadPracticeClient {...props} /> : <ListenPracticeClient {...props} assist={30} />}</>;
}
