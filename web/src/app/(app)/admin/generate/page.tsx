import AppTopbar from "@/components/AppTopbar";
import { requireAdminPage } from "@/lib/auth/page-guards";
import AdminGenerateForm from "./AdminGenerateForm";

export const dynamic = "force-dynamic";

export default async function AdminGeneratePage() {
  const user = await requireAdminPage();
  return (
    <>
      <AppTopbar pageTitle="Tạo nội dung bằng AI" pageSubtitle="Tạo bản nháp nội dung TOEIC để duyệt" userName={user.displayName} userEmail={user.email} />
      <main className="flex-1 overflow-y-auto px-4 py-6 lg:px-8">
        <section className="max-w-xl p-5 rounded-xl bg-surface border border-line">
          <AdminGenerateForm />
        </section>
      </main>
    </>
  );
}
