import type { Metadata, Viewport } from "next";

/**
 * 협력 설계업체 공유 화면 — ERP 본체와 완전히 분리된 계층.
 *
 * 사이드바·메뉴·다른 파트로 가는 링크가 하나도 없다. 여기서 ERP 안으로 들어갈 길이 없다.
 * 로그인이 없으므로(사용자 결정) 검색엔진 수집도 막는다 — 링크가 색인되면 유출과 다름없다.
 */
export const metadata: Metadata = {
  title: { template: "%s | 여유원재 공유", default: "여유원재 공유" },
  description: "협력 설계업체 여유원재 현황",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function PartnerLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-gray-50">{children}</div>;
}
