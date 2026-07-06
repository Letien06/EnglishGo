import { withErrorHandling } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";
import { getCurrentUser } from "@/lib/auth/session";
import * as dautoeicVocab from "@/lib/services/dautoeic-vocab";

export const GET = withErrorHandling(async () => {
  const user = await getCurrentUser();
  const catalog = await dautoeicVocab.getVocabularyCatalogView(user?.uid);
  return ok(catalog);
});
