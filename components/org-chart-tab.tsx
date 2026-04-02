"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type Connection,
  type NodeChange,
  type EdgeChange,
  Panel,
  Handle,
  Position,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Save, Download, Printer, Plus, Eye, EyeOff, X } from "lucide-react";

// ── 타입 ─────────────────────────────────────────────────────

export interface Worker {
  id: string;
  name: string;
  role: string | null;
  position: string | null;
  phone: string | null;
  nationality: string | null;
}

interface OrgChartNodeData {
  workerId: string;
  name: string;
  role: string | null;
  position: string | null;
  phone: string | null;
  visible: boolean;
  isRetired?: boolean; // 미사용 (퇴직 처리 시 흐리게)
}

// ── 커스텀 노드 ───────────────────────────────────────────────

function WorkerNode({ data, selected }: { data: OrgChartNodeData; selected: boolean }) {
  return (
    <div
      className={`bg-white border-2 rounded-xl shadow-sm px-4 py-3 min-w-[120px] text-center transition-all ${
        selected ? "border-blue-500 shadow-blue-200 shadow-md" : "border-gray-200"
      } ${data.isRetired ? "opacity-40" : ""}`}
    >
      <Handle type="target" position={Position.Top} className="!bg-blue-400 !w-3 !h-3" />
      <p className="font-bold text-gray-900 text-sm">{data.name}</p>
      {data.position && <p className="text-xs text-blue-600 font-medium mt-0.5">{data.position}</p>}
      {data.role && <p className="text-xs text-gray-500 mt-0.5">{data.role}</p>}
      <Handle type="source" position={Position.Bottom} className="!bg-blue-400 !w-3 !h-3" />
    </div>
  );
}

const nodeTypes = { workerNode: WorkerNode };

// ── 내부 Flow 컴포넌트 ────────────────────────────────────────

interface FlowInnerProps {
  workers: Worker[];
  initialNodes: Node[];
  initialEdges: Edge[];
  onSaved: () => void;
}

function FlowInner({ workers, initialNodes, initialEdges, onSaved }: FlowInnerProps) {
  const { screenToFlowPosition, toObject } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  // 배치된 workerId 집합
  const placedWorkerIds = new Set(nodes.map(n => n.data.workerId as string));
  const unplacedWorkers = workers.filter(w => !placedWorkerIds.has(w.id));

  // 연결 생성 → parentId 설정 (source=상위, target=하위)
  const onConnect = useCallback(
    (params: Connection) => setEdges(eds => addEdge({ ...params, type: "smoothstep", animated: false }, eds)),
    [setEdges]
  );

  // 미배치 인원 캔버스에 추가
  function addWorkerToCanvas(worker: Worker) {
    const id = worker.id;
    const newNode: Node = {
      id,
      type: "workerNode",
      position: { x: 100 + Math.random() * 300, y: 100 + Math.random() * 200 },
      data: {
        workerId: worker.id,
        name: worker.name,
        role: worker.role,
        position: worker.position,
        phone: worker.phone,
        visible: true,
      },
    };
    setNodes(nds => [...nds, newNode]);
  }

  // 노드 캔버스에서 제거
  function removeNodeFromCanvas(workerId: string) {
    setNodes(nds => nds.filter(n => n.id !== workerId));
    setEdges(eds => eds.filter(e => e.source !== workerId && e.target !== workerId));
  }

  // 저장
  async function handleSave() {
    setSaving(true);
    setSaveMsg("");
    try {
      const flowObj = toObject();
      const nodesToSave = flowObj.nodes.map(n => ({
        workerId: n.id,
        x: n.position.x,
        y: n.position.y,
        parentId: flowObj.edges.find(e => e.target === n.id)?.source ?? null,
        visible: true,
      }));
      const res = await fetch("/api/org-chart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodes: nodesToSave }),
      });
      const data = await res.json();
      if (data.success) {
        setSaveMsg("저장됨");
        onSaved();
        setTimeout(() => setSaveMsg(""), 2000);
      }
    } finally {
      setSaving(false);
    }
  }

  // PNG 저장 (React Flow 내장 toSvg 방식)
  async function handleDownload() {
    try {
      // @ts-expect-error dynamic import for optional feature
      const mod = await import("html-to-image").catch(() => null);
      if (mod) {
        const el = document.querySelector(".react-flow") as HTMLElement;
        if (!el) return;
        const dataUrl = await (mod as { toPng: (el: HTMLElement, opts: { backgroundColor: string }) => Promise<string> }).toPng(el, { backgroundColor: "#ffffff" });
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = "조직도.png";
        a.click();
      } else {
        alert("png 저장을 원하시면 npm install html-to-image 를 실행하세요.");
      }
    } catch {
      alert("PNG 저장 오류");
    }
  }

  // 인쇄
  function handlePrint() {
    window.print();
  }

  return (
    <div className="flex gap-4" style={{ height: "680px" }}>
      {/* 미배치 인원 사이드바 */}
      <div className="w-44 flex-shrink-0 bg-gray-50 border border-gray-200 rounded-xl overflow-y-auto p-3 space-y-1.5">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">미배치 인원</p>
        {unplacedWorkers.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">모두 배치됨</p>
        ) : (
          unplacedWorkers.map(w => (
            <button
              key={w.id}
              onClick={() => addWorkerToCanvas(w)}
              className="w-full text-left bg-white border border-gray-200 rounded-lg px-3 py-2 hover:border-blue-400 hover:bg-blue-50 transition-colors group"
            >
              <p className="text-xs font-semibold text-gray-800 group-hover:text-blue-700">{w.name}</p>
              {w.position && <p className="text-xs text-gray-400">{w.position}</p>}
            </button>
          ))
        )}
      </div>

      {/* React Flow 캔버스 */}
      <div className="flex-1 border border-gray-200 rounded-xl overflow-hidden print:border-0">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          fitView
          defaultEdgeOptions={{ type: "smoothstep", style: { stroke: "#94a3b8", strokeWidth: 2 } }}
        >
          <Background color="#e2e8f0" gap={20} />
          <Controls />
          <MiniMap nodeStrokeWidth={3} zoomable pannable />

          {/* 툴바 */}
          <Panel position="top-right" className="flex gap-2 print:hidden">
            {saveMsg && <span className="text-xs text-green-600 bg-green-50 px-3 py-1.5 rounded-lg font-medium self-center">{saveMsg}</span>}
            <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50">
              <Save size={13} />{saving ? "저장 중..." : "저장"}
            </button>
            <button onClick={handleDownload} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 text-gray-700 text-xs font-semibold rounded-lg hover:bg-gray-50">
              <Download size={13} />PNG
            </button>
            <button onClick={handlePrint} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 text-gray-700 text-xs font-semibold rounded-lg hover:bg-gray-50">
              <Printer size={13} />인쇄
            </button>
          </Panel>

          {/* 배치된 노드 제거 버튼 목록 */}
          <Panel position="top-left" className="flex flex-col gap-1 max-h-64 overflow-y-auto print:hidden">
            {nodes.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-2 shadow-sm space-y-1">
                <p className="text-xs font-semibold text-gray-500 mb-1">배치됨 ({nodes.length}명)</p>
                {nodes.map(n => (
                  <div key={n.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-gray-700">{(n.data as unknown as OrgChartNodeData).name}</span>
                    <button onClick={() => removeNodeFromCanvas(n.id)} className="text-gray-400 hover:text-red-500">
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </ReactFlow>
      </div>
    </div>
  );
}

// ── 메인 (데이터 로딩 + Provider 래핑) ───────────────────────

export default function OrgChartTab({ workers }: { workers: Worker[] }) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/org-chart")
      .then(r => r.json())
      .then(data => {
        if (!data.success) return;
        const savedNodes: Array<{ workerId: string; x: number; y: number; parentId: string | null; visible: boolean }> = data.data;

        // 저장된 노드를 React Flow 노드로 변환
        const workerMap = new Map(workers.map(w => [w.id, w]));
        const flowNodes: Node[] = savedNodes
          .filter(n => workerMap.has(n.workerId))
          .map(n => {
            const w = workerMap.get(n.workerId)!;
            return {
              id: n.workerId,
              type: "workerNode",
              position: { x: n.x, y: n.y },
              data: {
                workerId: n.workerId,
                name: w.name,
                role: w.role,
                position: w.position,
                phone: w.phone,
                visible: n.visible,
              },
            };
          });

        // 저장된 parentId → Edge 변환
        const flowEdges: Edge[] = savedNodes
          .filter(n => n.parentId)
          .map(n => ({
            id: `e-${n.parentId}-${n.workerId}`,
            source: n.parentId!,
            target: n.workerId,
            type: "smoothstep",
            style: { stroke: "#94a3b8", strokeWidth: 2 },
          }));

        setNodes(flowNodes);
        setEdges(flowEdges);
      })
      .finally(() => setLoading(false));
  }, [workers]);

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-gray-400 text-sm">조직도 불러오는 중...</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">노드를 드래그해 위치를 조정하고, 노드 아래 핸들에서 드래그해 상하관계를 연결하세요.</p>
          <p className="text-xs text-gray-400 mt-0.5">좌측 미배치 인원을 클릭해 캔버스에 추가 · 우상단 저장 버튼으로 레이아웃 저장</p>
        </div>
      </div>

      <ReactFlowProvider>
        <FlowInner
          workers={workers}
          initialNodes={nodes}
          initialEdges={edges}
          onSaved={() => {}}
        />
      </ReactFlowProvider>

      {/* 인쇄 CSS */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          .react-flow, .react-flow * { visibility: visible !important; }
          .react-flow { position: fixed !important; top: 0; left: 0; width: 100vw !important; height: 100vh !important; }
        }
      `}</style>
    </div>
  );
}
