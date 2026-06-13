import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// 통합 페이지로 리다이렉트 — 북마크 호환
export default function ShipmentsListLegacy() {
  redirect("/cutpart/external-shipout?tab=shipments");
}
