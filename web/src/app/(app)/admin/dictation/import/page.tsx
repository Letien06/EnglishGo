import AppTopbar from "@/components/AppTopbar";
import { requireAdminPage } from "@/lib/auth/page-guards";
import DictationBatchImportClient from "./DictationBatchImportClient";

export const dynamic = "force-dynamic";

export default async function DictationBatchImportPage() {
  const user = await requireAdminPage();
  return <><AppTopbar pageTitle="Import nghe-chép" pageSubtitle="Nhập lesson đã có transcript và quyền sử dụng" userName={user.displayName} userEmail={user.email} /><DictationBatchImportClient /></>;
}
