import { getGrammarCatalog, getGrammarAnswerKeys } from "@/lib/services/dautoeic-grammar";
import { getReadIdentity } from "@/lib/auth/session";
import GrammarLibraryClient from "./GrammarLibraryClient";

export default async function GrammarPage() {
  const [catalog, user] = await Promise.all([getGrammarCatalog(), getReadIdentity()]);
  const answerKeys = catalog ? await getGrammarAnswerKeys(catalog) : {};
  return <GrammarLibraryClient key={user?.uid ?? "guest"} catalog={catalog} learnerId={user?.uid ?? "guest"} answerKeys={answerKeys} />;
}
