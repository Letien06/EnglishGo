import AppTopbar from "@/components/AppTopbar";
import { requireAdminPage } from "@/lib/auth/page-guards";
import { listAdminLessons } from "@/lib/services/dictation";
import DictationAdminClient from "./DictationAdminClient";

export const dynamic = "force-dynamic";

export default async function DictationAdminPage() {
  const user = await requireAdminPage();
  const lessons = await listAdminLessons();
  return <><AppTopbar pageTitle="Nghe-chép" pageSubtitle="Quản lý video, lời thoại và quyền sử dụng" userName={user.displayName} userEmail={user.email} /><main className="flex-1 overflow-y-auto px-4 py-6 lg:px-8"><DictationAdminClient initialLessons={lessons} /></main></>;
}
