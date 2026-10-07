import { notFound } from "next/navigation";
import { getGrammarCatalog, getGrammarTopic } from "@/lib/services/dautoeic-grammar";
import { getReadIdentity } from "@/lib/auth/session";
import GrammarPracticeClient from "../GrammarPracticeClient";

export default async function GrammarTopicPage({ params }: { params: Promise<{ topicId: string }> }) {
  const { topicId } = await params;
  const [catalog, topic, user] = await Promise.all([getGrammarCatalog(), getGrammarTopic(topicId), getReadIdentity()]);
  const metadata = catalog?.topics.find((entry) => entry.id === topic?.topicId);
  if (!topic || !metadata) notFound();
  return <GrammarPracticeClient key={`${topic.topicId}:${user?.uid ?? "guest"}`} topic={topic} metadata={metadata} learnerId={user?.uid ?? "guest"} />;
}
