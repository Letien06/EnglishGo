import WritingPracticeClient from "./WritingPracticeClient";

export const dynamic = "force-dynamic";

export default async function WritingPracticePage({ params }: { params: Promise<{ promptId: string }> }) {
  const { promptId } = await params;
  return <WritingPracticeClient promptId={promptId} />;
}
