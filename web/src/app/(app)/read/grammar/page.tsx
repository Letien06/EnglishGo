import { getGrammarCatalog, getGrammarAnswerKeys } from "@/lib/services/dautoeic-grammar";
import { loadUserGrammarProgress } from "@/lib/services/grammar-progress";
import { getReadIdentity } from "@/lib/auth/session";
import GrammarLibraryClient from "./GrammarLibraryClient";

export default async function GrammarPage() {
  const [catalog, user] = await Promise.all([getGrammarCatalog(), getReadIdentity()]);
  const [answerKeys, cloudAnswersByTopic] = await Promise.all([
    catalog ? getGrammarAnswerKeys(catalog) : Promise.resolve({}),
    loadUserGrammarProgress(user?.uid),
  ]);
  return (
    <GrammarLibraryClient
      key={user?.uid ?? "guest"}
      catalog={catalog}
      learnerId={user?.uid ?? "guest"}
      answerKeys={answerKeys}
      cloudAnswersByTopic={cloudAnswersByTopic}
    />
  );
}
