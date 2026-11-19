import AppTopbar from "@/components/AppTopbar";
import { requireAdminPage } from "@/lib/auth/page-guards";
import { getWritingAdminOverview, listAdminWritingPrompts } from "@/lib/services/writing";
import WritingAdminClient from "./WritingAdminClient";

export const dynamic = "force-dynamic";

export default async function WritingAdminPage() {
  const user = await requireAdminPage();
  const [initialItems, initialOverview] = await Promise.all([
    listAdminWritingPrompts().catch(() => undefined),
    getWritingAdminOverview().catch(() => undefined),
  ]);

  return (
    <>
      <AppTopbar
        pageTitle="Quản lý bài viết"
        pageSubtitle="Bộ đề tự biên soạn, trạng thái xuất bản và quy trình rà soát"
        userName={user.displayName}
        userEmail={user.email}
      />
      <main className="flex-1 overflow-y-auto px-4 py-6 lg:px-8">
        <WritingAdminClient
          initialItems={initialItems}
          initialOverview={initialOverview}
        />
      </main>
    </>
  );
}
