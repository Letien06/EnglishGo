import { notFound } from "next/navigation";
import { getGrammarCatalog, getGrammarTopic } from "@/lib/services/dautoeic-grammar";
import { getReadIdentity } from "@/lib/auth/session";
import GrammarPracticeClient from "../GrammarPracticeClient";

export default async function GrammarTopicPage({ params, searchParams }: { params: Promise<{ topicId: string }>; searchParams: Promise<{ mode?: string }> }) {
  const { topicId } = await params;
  const [{ mode }, catalog, topic, user] = await Promise.all([searchParams, getGrammarCatalog(), getGrammarTopic(topicId), getReadIdentity()]);
  const metadata = catalog?.topics.find((entry) => entry.id === topic?.topicId);
  if (!topic || !metadata) notFound();
  return <GrammarPracticeClient key={`${topic.topicId}:${user?.uid ?? "guest"}:${mode ?? "learn"}`} topic={topic} metadata={metadata} learnerId={user?.uid ?? "guest"} reviewMode={mode === "wrong"} />;
}
