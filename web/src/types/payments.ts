export interface MembershipStatus {
  tier: "FREE" | "PREMIUM";
  activatedAt: string | null;
}

export interface PaymentOrder {
  id: string;
  status: "PENDING" | "PAID" | "EXPIRED";
  amount: number;
  transferContent: string;
  qrUrl: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  createdAt: string;
  expiresAt: string;
  paidAt: string | null;
}

export interface MembershipCheckout {
  membership: MembershipStatus;
  order: PaymentOrder | null;
  available: boolean;
  amount: number;
}
