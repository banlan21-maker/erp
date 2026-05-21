export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import FieldPayment from "@/components/field-payment";

export const metadata: Metadata = { title: "현장 결제관리" };

export default function FieldPaymentPage() {
  return <FieldPayment />;
}
