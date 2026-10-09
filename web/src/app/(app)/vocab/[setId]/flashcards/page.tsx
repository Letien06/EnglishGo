/**
 * /vocab/:setId/flashcards — Flashcard game page.
 *
 * Server component loads session data, passes to client game component.
 * Port of VocabularyController GET /vocab/sets/{setId}/flashcards + flashcards.html.
 */
import { getCurrentUserForRead } from "@/lib/auth/session";
import * as vocab from "@/lib/services/vocab";
import FlashcardGame from "./FlashcardGameLoader";
import { isDriveContentEnabled } from "@/lib/services/dautoeic-drive";
import { redirect } from "next/navigation";

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

  const rawRoom = typeof sp.room === "string" ? sp.room.trim().toUpperCase() : Array.isArray(sp.room) ? sp.room[0]?.trim().toUpperCase() : undefined;
  const room = rawRoom && /^[A-Z0-9]{6}$/.test(rawRoom) ? rawRoom : undefined;

  const mode = room ? (sp.mode === "rain" ? "rain" : "blast") : ((sp.mode as string) ?? "flashcard");
  const tab = room ? "play" : (sp.tab === "view" || sp.tab === "learn" || sp.tab === "play" ? sp.tab : undefined);
  const mastery = (sp.mastery as string) ?? undefined;
  const order = (sp.order as string) ?? undefined;
  const amount = (sp.amount as string) ?? undefined;
  const partId = (sp.partId as string) ?? undefined;
  const intent = !room && (sp.intent === "continue" || sp.intent === "review") ? sp.intent : undefined;
  if (intent === "review" && !user) {
    const destination = `/vocab/${id}/flashcards?mode=menu&tab=learn&intent=review${partId ? `&partId=${encodeURIComponent(partId)}` : ""}`;
    redirect(`/login?redirect=${encodeURIComponent(destination)}`);
  }

  const sessionPromise = intent
    ? vocab.getStudyEntrySession(id, uid, intent, partId)
    : partId
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
  if (tab) returnParams.set("tab", tab);
  if (room) returnParams.set("room", room);
  if (mastery) returnParams.set("mastery", mastery);
  if (order) returnParams.set("order", order);
  if (amount) returnParams.set("amount", amount);
  if (partId) returnParams.set("partId", partId);
  if (intent) returnParams.set("intent", intent);
  const returnPath = `/vocab/${id}/flashcards?${returnParams.toString()}`;

  const session = await sessionPromise;

  return (
    <FlashcardGame
      key={returnPath}
      session={session}
      initialMode={mode}
      initialTab={tab}
      initialRoom={room}
      partsReady={isDriveContentEnabled()}
      practiceOptions={[]}
      loadExtrasInBackground
      reviewMode={intent === "review"}
      studyIntent={intent ?? (mastery === "mastered" || mastery === "due" ? "review" : "continue")}
      isAuthenticated={Boolean(user)}
      currentUserId={uid}
      loginHref={`/login?redirect=${encodeURIComponent(returnPath)}`}
      selectedMastery={intent === "review" ? "mastered" : intent === "continue" ? "all" : mastery ?? "learning"}
      selectedOrder={intent === "review" ? "oldest" : intent === "continue" ? "ordered" : order ?? "random"}
      selectedAmount={intent ? "all" : amount ?? "20"}
    />
  );
}
