"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshCw, Activity, PlayCircle, CheckCircle2 } from "lucide-react";

type EquipmentProgress = {
  equipment: {
    id: string;
    name: string;
    type: string;
    status: string;
  };
  recentLog: {
    id: string;
    status: string;
    operator: string;
    project: {
      projectCode: string;
      projectName: string;
    } | null;
  } | null;
};

export function DashboardEquipmentProgress() {
  const [data, setData] = useState<EquipmentProgress[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/dashboard/equipment");
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setData(json.data);
        }
      }
    } catch (error) {
      console.error("Failed to load equipment progress:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <Card className="border-blue-100 shadow-sm">
      <CardHeader className="pb-3 flex flex-row items-center justify-between border-b border-gray-50 bg-gray-50/50">
        <CardTitle className="text-sm font-bold text-gray-800 flex items-center gap-2">
          <Activity size={18} className="text-blue-600" />
          장비별 실시간 진행 현황 (금일 최신작업)
        </CardTitle>
        <button
          onClick={fetchData}
          disabled={loading}
          className="text-gray-500 hover:text-blue-600 transition-colors p-1 rounded-md hover:bg-gray-100 disabled:opacity-50"
          title="새로고침"
        >
          <RefreshCw size={16} className={loading ? "animate-spin text-blue-500" : ""} />
        </button>
      </CardHeader>
      <CardContent className="pt-4">
        {loading && data.length === 0 ? (
          <div className="flex justify-center py-6 text-sm text-gray-400">
            데이터를 불러오는 중입니다...
          </div>
        ) : data.length === 0 ? (
          <div className="flex justify-center py-6 text-sm text-gray-400">
            등록된 장비가 없습니다. 장비를 먼저 등록해주세요.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {data.map((item) => (
              <div 
                key={item.equipment.id} 
                className="flex flex-col border border-gray-200 bg-white rounded-xl overflow-hidden shadow-sm"
              >
                {/* 헤더: 장비 이름 */}
                <div className="bg-gray-50 px-3 py-2 flex justify-between items-center border-b">
                  <span className="font-bold text-gray-800 text-sm">{item.equipment.name}</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                    {item.equipment.type}
                  </span>
                </div>
                
                {/* 바디: 최근 작업 내역 */}
                <div className="p-3 flex-1 flex flex-col justify-center">
                  {item.recentLog ? (
                    <div className="space-y-2">
                      <div>
                        <p className="text-[11px] text-gray-500 font-medium mb-0.5">현재 / 최근 프로젝트</p>
                        <p className="text-xs font-bold text-gray-900 truncate" title={item.recentLog.project?.projectName}>
                          {item.recentLog.project ? `[${item.recentLog.project.projectCode}] ${item.recentLog.project.projectName}` : '프로젝트 미지정'}
                        </p>
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                        <span className="text-[11px] text-gray-500 font-medium bg-gray-100 px-1.5 py-0.5 rounded">
                          작업자: {item.recentLog.operator}
                        </span>
                        
                        {item.recentLog.status === 'STARTED' ? (
                          <span className="text-xs text-blue-600 flex items-center gap-1 font-bold animate-pulse">
                            <PlayCircle size={14}/> 진행중
                          </span>
                        ) : (
                          <span className="text-xs text-green-600 flex items-center gap-1 font-bold">
                            <CheckCircle2 size={14}/> 완료됨
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center py-3">
                      <p className="text-xs text-gray-400 font-medium">금일 진행된 작업 내역이 없습니다.</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
