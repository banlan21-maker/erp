import ProjectForm from "@/components/project-form";

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;

  return (
    <div className="max-w-xl space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">
          {code ? `호선 [${code}] 블록 추가` : "호선 등록"}
        </h2>
        <p className="text-sm text-gray-500 mt-0.5">
          {code ? `${code} 호선에 새 블록을 추가합니다.` : "새 호선 및 블록을 등록합니다."}
        </p>
      </div>
      <ProjectForm defaultCode={code} />
    </div>
  );
}
