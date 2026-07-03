import AppTopbar from "@/components/AppTopbar";
import { requireUser } from "@/lib/auth/session";
import { activeSubscription, plans, recentTransactions } from "@/lib/services/billing";
import BillingCheckout from "./BillingCheckout";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const user = await requireUser();
  const [subscription, transactions] = await Promise.all([
    activeSubscription(user.uid),
    recentTransactions(user.uid),
  ]);
  const planEntries = Object.entries(plans());

  return (
    <>
      <AppTopbar pageTitle="Billing" pageSubtitle="Plans and transactions" userName={user.displayName} userEmail={user.email} />
      <main className="flex-1 overflow-y-auto px-4 py-6 lg:px-8 space-y-6">
        <section className="p-5 rounded-xl bg-surface border border-line">
          <h2 className="font-bold text-ink">Current plan</h2>
          <p className="text-sm text-muted mt-1">
            {subscription ? `${subscription.planId} active until ${subscription.endDate}` : "No active subscription"}
          </p>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {planEntries.map(([planId, price]) => (
            <article key={planId} className="p-5 rounded-xl bg-surface border border-line">
              <h3 className="font-bold text-ink">{planId}</h3>
              <p className="text-2xl font-bold text-primary mt-2">{formatMoney(price)}</p>
              <BillingCheckout planId={planId} />
            </article>
          ))}
        </section>

        <section className="rounded-xl bg-surface border border-line overflow-hidden">
          <h2 className="font-bold text-ink p-4">Transactions</h2>
          {transactions.map((transaction) => (
            <div key={transaction.id} className="flex items-center justify-between p-4 border-t border-line text-sm">
              <span className="text-ink">{transaction.provider} / {transaction.status}</span>
              <strong className="text-primary">{formatMoney(transaction.amount)}</strong>
            </div>
          ))}
          {transactions.length === 0 && <div className="p-8 text-center text-muted">No transactions yet.</div>}
        </section>
      </main>
    </>
  );
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(value);
}
