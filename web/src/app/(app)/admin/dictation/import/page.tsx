import AppTopbar from "@/components/AppTopbar";
import { requireAdminPage } from "@/lib/auth/page-guards";
import DictationBatchImportClient from "./DictationBatchImportClient";

export const dynamic = "force-dynamic";

export default async function DictationBatchImportPage() {
  const user = await requireAdminPage();
  return <><AppTopbar pageTitle="Nhập bài nghe-chép" pageSubtitle="Nhập bài học đã có lời thoại và quyền sử dụng" userName={user.displayName} userEmail={user.email} /><DictationBatchImportClient /></>;
}
