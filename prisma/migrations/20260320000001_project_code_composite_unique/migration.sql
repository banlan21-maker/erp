-- projectCode 단독 유니크 제거 → (projectCode, projectName) 복합 유니크로 변경
-- 같은 호선코드에 여러 블록(프로젝트명) 등록 허용

-- 기존 단독 유니크 인덱스 삭제
DROP INDEX IF EXISTS "Project_projectCode_key";

-- 복합 유니크 인덱스 생성
CREATE UNIQUE INDEX "Project_projectCode_projectName_key" ON "Project"("projectCode", "projectName");
