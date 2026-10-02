"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { BookOpen, X } from "lucide-react";
import { FIELD_LANGS, GLOSSARY, trMessage, trOf, type FieldLang } from "@/lib/i18n/field-dict";

/**
 * 현장 작업일보 다국어 — 표시 부품 (2026-10-02)
 *
 * 한국어는 항상 그대로 두고, 고른 언어의 번역을 그 아래 작은 글씨로 붙인다.
 * 언어는 각자 휴대폰에 기억한다(localStorage). 사전은 lib/i18n/field-dict.ts.
 *   <T k="작업자" />          한국어 + 아래 번역
 *   <Tr k="..." />           번역 한 줄만(한국어가 이미 옆에 복잡한 모양으로 있을 때)
 *   <Msg text={error} />      안내문(서버 문장 포함) — 줄마다 사전·패턴으로 번역
 *   inline("…")              "한국어 (번역)" — select option·placeholder·title 처럼 한 줄 글자만 되는 곳
 *   dialog(["…","…"])        alert/confirm 용 — 한국어 줄들 아래에 번역 줄들
 */

const KEY = "field-lang";
type Ctx = { lang: FieldLang; setLang: (l: FieldLang) => void };
const LangCtx = createContext<Ctx>({ lang: "ko", setLang: () => {} });

export function FieldLangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<FieldLang>("ko");
  useEffect(() => {
    try {
      const v = localStorage.getItem(KEY) as FieldLang | null;
      if (v && FIELD_LANGS.some(l => l.code === v)) setLangState(v);
    } catch { /* 사생활 모드 등 — 한국어로 */ }
  }, []);
  const setLang = useCallback((l: FieldLang) => {
    setLangState(l);
    try { localStorage.setItem(KEY, l); } catch { /* 무시 */ }
  }, []);
  return <LangCtx.Provider value={{ lang, setLang }}>{children}</LangCtx.Provider>;
}

type Vars = Record<string, string | number>;

export function useFieldLang() {
  const { lang, setLang } = useContext(LangCtx);
  return useMemo(() => ({
    lang, setLang,
    /** "한국어 (번역)" — 한 줄 글자만 되는 자리 */
    inline: (ko: string, vars?: Vars) => {
      const base = vars ? ko.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m)) : ko;
      const t = trOf(ko, lang, vars);
      return t ? `${base} (${t})` : base;
    },
    /** alert/confirm 용 — 한국어 줄들 + 빈 줄 + 번역 줄들 */
    dialog: (lines: (string | [string, Vars])[]) => {
      const ko = lines.map(l => {
        if (typeof l === "string") return l;
        const [k, v] = l;
        return k.replace(/\{(\w+)\}/g, (m, kk) => (v[kk] !== undefined ? String(v[kk]) : m));
      });
      if (lang === "ko") return ko.join("\n");
      const tr = lines.map(l => (typeof l === "string" ? trOf(l, lang) : trOf(l[0], lang, l[1])) ?? "").filter(Boolean);
      return tr.length ? `${ko.join("\n")}\n\n${tr.join("\n")}` : ko.join("\n");
    },
    /** 안내문 문자열을 alert 용으로 */
    message: (text: string) => {
      const t = trMessage(text, lang);
      return t ? `${text}\n\n${t}` : text;
    },
  }), [lang, setLang]);
}

const SUB = "block text-[0.72em] leading-snug font-normal opacity-75 mt-0.5";

/** 한국어 + 아래 작은 번역 */
export function T({ k, v, className }: { k: string; v?: Vars; className?: string }) {
  const { lang } = useContext(LangCtx);
  const base = v ? k.replace(/\{(\w+)\}/g, (m, kk) => (v[kk] !== undefined ? String(v[kk]) : m)) : k;
  const t = trOf(k, lang, v);
  if (!t) return <>{base}</>;   // 한국어만일 때는 예전 모양 그대로
  // 한국어 + 번역을 세로 한 묶음으로 — 아이콘이 붙은 버튼(flex 가로줄) 안에서도 번역이 옆이 아니라 아래로 간다.
  // 정렬은 부모의 text-align 을 따른다(버튼은 가운데, 라벨은 왼쪽).
  return (
    <span className="inline-flex flex-col">
      <span>{base}</span>
      <span className={className ?? SUB}>{t}</span>
    </span>
  );
}

/** 번역 한 줄만 */
export function Tr({ k, v, className }: { k: string; v?: Vars; className?: string }) {
  const { lang } = useContext(LangCtx);
  const t = trOf(k, lang, v);
  return t ? <span className={className ?? SUB}>{t}</span> : null;
}

/** 안내문 — 한국어 원문(줄바꿈 유지) + 아래 번역 */
export function Msg({ text }: { text: string }) {
  const { lang } = useContext(LangCtx);
  const t = trMessage(text, lang);
  return (
    <>
      <span className="whitespace-pre-line">{text}</span>
      {t && <span className={`${SUB} whitespace-pre-line`}>{t}</span>}
    </>
  );
}

/** 머리말 오른쪽 — 언어 버튼 + 용어집 */
export function FieldLangBar() {
  const { lang, setLang } = useContext(LangCtx);
  const [open, setOpen] = useState(false);
  return (
    <div className="flex items-center gap-1">
      <select
        value={lang}
        onChange={e => setLang(e.target.value as FieldLang)}
        aria-label="언어"
        className="bg-gray-800 border border-gray-700 rounded-lg px-1.5 py-1 text-xs text-white"
      >
        {FIELD_LANGS.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
      </select>
      <button onClick={() => setOpen(true)}
        className="flex items-center gap-1 px-2 py-1 rounded-lg border border-gray-700 bg-gray-800 text-xs text-gray-200 active:bg-gray-700">
        <BookOpen size={12} /> <T k="용어집" className="hidden" />
      </button>
      {open && <GlossaryModal onClose={() => setOpen(false)} />}
    </div>
  );
}

/** 용어집 — 한국어 · 발음 · 뜻. 언어를 안 골랐으면 세 언어를 모두 보여 준다 */
function GlossaryModal({ onClose }: { onClose: () => void }) {
  const { lang } = useContext(LangCtx);
  const langs = (lang === "ko" ? ["vi", "th", "my"] : [lang]) as Exclude<FieldLang, "ko">[];
  const name: Record<string, string> = { vi: "Tiếng Việt", th: "ไทย", my: "မြန်မာ" };
  return (
    <div className="fixed inset-0 z-[70] bg-black/80 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-t-3xl sm:rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3 border-b border-gray-800 flex items-center gap-2">
          <BookOpen size={16} className="text-amber-400" />
          <h3 className="text-base font-bold text-white"><T k="용어집" /></h3>
          <span className="ml-2 text-[10px] text-amber-400/80"><T k="번역 검수 전" /></span>
          <button onClick={onClose} className="ml-auto p-1 text-gray-400"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto divide-y divide-gray-800">
          {GLOSSARY.map(item => (
            <div key={item.ko} className="px-5 py-3">
              <p className="text-base font-bold text-white">{item.ko}</p>
              {langs.map(l => (
                <div key={l} className="mt-1">
                  {lang === "ko" && <p className="text-[10px] text-gray-500">{name[l]}</p>}
                  <p className="text-sm text-amber-300">{item.pron[l]}</p>
                  <p className="text-xs text-gray-400">{item.mean[l]}</p>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
