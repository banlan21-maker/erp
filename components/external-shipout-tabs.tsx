"use client";

/**
 * 외부출고관리 — 납품처 + 출고장 통합 페이지
 * 탭으로 분기:
 *   · 납품처 (DeliveryVendor - 공급처/납품처 마스터)
 *   · 출고장 (Shipment 이력 + 거래명세표 + 취소)
 *
 * URL 쿼리 ?tab=vendors | shipments 로 직접 진입 가능
 */

import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { PackageOpen, Building2, Truck } from "lucide-react";
import DeliveryVendorsMain, { type DeliveryVendor } from "@/components/delivery-vendors-main";
import ShipmentsListMain from "@/components/shipments-list-main";

type TabKey = "vendors" | "shipments";

export default function ExternalShipoutTabs({ initialVendors }: { initialVendors: DeliveryVendor[] }) {
  const sp = useSearchParams();
  const router = useRouter();

  const initialTab: TabKey =
    sp.get("tab") === "shipments" ? "shipments" : "vendors";

  const [tab, setTab] = useState<TabKey>(initialTab);

  // 탭 변경 시 URL 쿼리 동기화 (뒤로가기 호환)
  const switchTab = useCallback((t: TabKey) => {
    setTab(t);
    const params = new URLSearchParams(sp.toString());
    params.set("tab", t);
    router.replace(`/cutpart/external-shipout?${params.toString()}`, { scroll: false });
  }, [sp, router]);

  // URL 직접 변경 시 동기화
  useEffect(() => {
    const next = sp.get("tab") === "shipments" ? "shipments" : "vendors";
    if (next !== tab) setTab(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp]);

  return (
    <div className="space-y-4">
      {/* 공통 헤더 */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <PackageOpen size={24} className="text-purple-600" /> 외부출고관리
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          외부 납품처 출고 흐름 — 거래처 마스터(공급처/납품처) 와 출고장(거래명세표) 이력을 함께 관리합니다.
        </p>
      </div>

      {/* 탭 */}
      <div className="border-b-2 border-gray-200">
        <div className="flex gap-1">
          {([
            { key: "vendors",   label: "납품처",  icon: Building2, color: "blue" },
            { key: "shipments", label: "출고장",  icon: Truck,    color: "purple" },
          ] as const).map(({ key, label, icon: Icon, color }) => (
            <button
              key={key}
              onClick={() => switchTab(key)}
              className={`inline-flex items-center gap-1.5 px-5 py-3 text-sm font-bold border-b-4 -mb-0.5 transition-colors ${
                tab === key
                  ? color === "blue"
                    ? "border-blue-600 text-blue-700"
                    : "border-purple-600 text-purple-700"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
      </div>

      {/* 본문 */}
      {tab === "vendors" ? (
        <DeliveryVendorsMain initial={initialVendors} hideHeader />
      ) : (
        <ShipmentsListMain hideHeader />
      )}
    </div>
  );
}
