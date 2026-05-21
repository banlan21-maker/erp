export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import FieldFacility from "@/components/field-facility";

export const metadata: Metadata = { title: "현장 시설관리" };

export default function FieldFacilityPage() {
  return <FieldFacility />;
}
