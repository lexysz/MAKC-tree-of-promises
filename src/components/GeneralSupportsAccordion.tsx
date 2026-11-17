import { useState } from "react";
import type { SupportDef } from "../data/tree";

interface RowProps {
  support: SupportDef;
  depth: number;
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      className={`shrink-0 text-mist-500 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
    >
      <path d="M4 2.5L8 6l-4 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SupportRow({ support, depth }: RowProps) {
  const [open, setOpen] = useState(false);
  const children = support.supports ?? [];
  const hasChildren = children.length > 0;
  const hasBody = Boolean(support.description || support.who || support.toWhom || support.metrics);

  return (
    <div className={depth > 0 ? "ml-3 border-l border-ink-700/50 pl-3" : ""}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`group flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-all ${
          open ? "border-lagoon/40 bg-lagoon/[0.06]" : "border-ink-700/60 bg-ink-900/50 hover:border-mist-500/50 hover:bg-ink-850/70"
        }`}
      >
        <Chevron open={open} />
        <span className="h-2 w-2 shrink-0 rounded-[3px] border-2 border-sky2" />
        <span className={`min-w-0 flex-1 truncate text-[12.5px] leading-snug ${open ? "font-semibold text-mist-100" : "text-mist-300 group-hover:text-mist-100"}`}>
          {support.title}
        </span>
        {hasChildren && (
          <span className="shrink-0 rounded-full border border-ink-700/70 px-1.5 py-px text-[10px] font-semibold text-mist-500">
            {children.length}
          </span>
        )}
      </button>

      {open && (
        <div className="mt-2 space-y-3 rounded-lg border border-ink-700/50 bg-ink-950/40 px-3.5 py-3">
          {support.description && (
            <p className="text-[12px] leading-relaxed text-mist-300">{support.description}</p>
          )}
          {(support.who || support.toWhom) && (
            <div className="grid gap-3 sm:grid-cols-2">
              {support.who && (
                <div>
                  <div className="field-label">Кто даёт</div>
                  <div className="text-[12px] text-mist-100">{support.who}</div>
                </div>
              )}
              {support.toWhom && (
                <div>
                  <div className="field-label">Кому</div>
                  <div className="text-[12px] text-mist-100">{support.toWhom}</div>
                </div>
              )}
            </div>
          )}
          {support.metrics && (
            <div>
              <div className="field-label">Метрики</div>
              <ul className="space-y-1">
                {support.metrics.split("\n").map((m, i) => (
                  <li key={i} className="flex items-start gap-2 text-[12px] leading-relaxed text-mist-300">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-lagoon" />
                    {m}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!hasBody && !hasChildren && (
            <p className="text-[11.5px] text-mist-500">Дополнительных деталей нет.</p>
          )}
          {hasChildren && (
            <div className="space-y-2 border-t border-ink-700/50 pt-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-mist-500">
                Вложенные поддерживающие
              </div>
              <GeneralSupportsAccordion supports={children} depth={depth + 1} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface Props {
  supports: SupportDef[];
  depth?: number;
}

/**
 * Аккордеон поддерживающих обещаний общего обещания.
 * Рекурсивный: раскрывает вложенные цепочки на любом уровне.
 * Используется в карточке общего (DetailPanel) и read-only в админке.
 */
export default function GeneralSupportsAccordion({ supports, depth = 0 }: Props) {
  if (!supports || supports.length === 0) {
    return <p className="text-[11.5px] text-mist-500">Поддерживающих обещаний пока нет.</p>;
  }
  return (
    <div className="space-y-2">
      {supports.map((s) => (
        <SupportRow key={s.id} support={s} depth={depth} />
      ))}
    </div>
  );
}
