import AppTopbar from "@/components/AppTopbar";
import { requireUserForRead } from "@/lib/auth/session";
import ContributionForm from "./ContributionForm";

export const dynamic = "force-dynamic";

export default async function ContributePage() {
  const user = await requireUserForRead();
  return (
    <>
      <AppTopbar pageTitle="Đóng góp nội dung" pageSubtitle="Gửi nội dung học tập để xét duyệt" userName={user.displayName} userEmail={user.email} />
      <main className="flex-1 overflow-y-auto px-4 py-6 lg:px-8">
        <section className="max-w-2xl p-5 rounded-xl bg-surface border border-line">
          <ContributionForm />
        </section>
      </main>
    </>
  );
}
