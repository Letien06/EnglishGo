/**
 * /vocab/:setId/flashcards — Flashcard game page.
 *
 * Server component loads session data, passes to client game component.
 * Port of VocabularyController GET /vocab/sets/{setId}/flashcards + flashcards.html.
 */
import { getCurrentUserForRead } from "@/lib/auth/session";
import * as vocab from "@/lib/services/vocab";
import FlashcardGame from "./FlashcardGame";

interface Props {
  params: Promise<{ setId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function FlashcardsPage({ params, searchParams }: Props) {
  const { setId } = await params;
  const sp = await searchParams;
  const id = Number(setId);
  const user = await getCurrentUserForRead();
  const uid = user?.uid ?? "";

  const mode = (sp.mode as string) ?? "flashcard";
  const mastery = (sp.mastery as string) ?? undefined;
  const order = (sp.order as string) ?? undefined;
  const amount = (sp.amount as string) ?? undefined;
  const partId = (sp.partId as string) ?? undefined;

  const sessionPromise = partId
    ? vocab.getFilteredSessionForPart(
        id,
        uid,
        partId,
        mastery ?? "all",
        order ?? "random",
        amount ?? "all",
        false,
      )
    : user || mastery || order || amount
      ? vocab.getFilteredSession(
          id,
          uid,
          mastery ?? "all",
          order ?? "original",
          amount ?? "all",
          false,
        )
      : vocab.getSession(id);
  const returnParams = new URLSearchParams({ mode });
  if (mastery) returnParams.set("mastery", mastery);
  if (order) returnParams.set("order", order);
  if (amount) returnParams.set("amount", amount);
  if (partId) returnParams.set("partId", partId);
  const returnPath = `/vocab/${id}/flashcards?${returnParams.toString()}`;

  const session = await sessionPromise;

  return (
    <FlashcardGame
      key={returnPath}
      session={session}
      initialMode={mode}
      practiceOptions={[]}
      loadExtrasInBackground
      reviewMode={false}
      isAuthenticated={Boolean(user)}
      loginHref={`/login?redirect=${encodeURIComponent(returnPath)}`}
      selectedMastery={mastery ?? "learning"}
      selectedOrder={order ?? "random"}
      selectedAmount={amount ?? "20"}
    />
  );
}
