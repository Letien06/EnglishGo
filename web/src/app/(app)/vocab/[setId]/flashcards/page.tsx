/**
 * /vocab/:setId/flashcards — Flashcard game page.
 *
 * Server component loads session data, passes to client game component.
 * Port of VocabularyController GET /vocab/sets/{setId}/flashcards + flashcards.html.
 */
import { getCurrentUser } from "@/lib/auth/session";
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
  const user = await getCurrentUser();
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
      )
    : mastery || order || amount
      ? vocab.getFilteredSession(
          id,
          uid,
          mastery ?? "all",
          order ?? "original",
          amount ?? "all",
        )
      : vocab.getSession(id);
  const practiceOptionsPromise = user
    ? vocab.findPracticeSetOptions(uid)
    : Promise.resolve([]);

  const [session, practiceOptions] = await Promise.all([
    sessionPromise,
    practiceOptionsPromise,
  ]);

  return (
    <FlashcardGame
      session={session}
      initialMode={mode}
      practiceOptions={practiceOptions}
      reviewMode={false}
      selectedMastery={mastery ?? "learning"}
      selectedOrder={order ?? "random"}
      selectedAmount={amount ?? "20"}
    />
  );
}
