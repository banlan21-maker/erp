export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { verifyToken } from "@/lib/partner-portal";
import PartnerPortalMain from "@/components/partner-portal-main";

/**
 * 협력 설계업체 공유 화면.
 *   /partner/{토큰}
 *
 * 토큰이 없거나 죽었으면 404 — 링크가 유효한지조차 알려주지 않는다.
 */
export default async function PartnerPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const portal = await verifyToken(token);
  if (!portal) notFound();

  return <PartnerPortalMain token={token} />;
}
