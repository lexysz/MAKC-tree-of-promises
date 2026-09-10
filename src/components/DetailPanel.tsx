import type { GraphNode } from "../lib/layout";
import { TIER_LABEL } from "../data/tree";

interface Props {
  node: GraphNode | null;
  parent: GraphNode | null;
  children: GraphNode[];
  valueNode: GraphNode | null;
  onClose: () => void;
  onNavigate: (id: string) => void;
}

export default function DetailPanel({ node, parent, children, valueNode, onClose, onNavigate }: Props) {
  const open = node !== null;

  return (
    <aside
      aria-hidden={!open}
      className={[
        "pointer-events-auto absolute z-30 flex flex-col border-ink-700/60 bg-ink-900/95 backdrop-blur-md",
        "transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
        "md:top-0 md:right-0 md:bottom-0 md:w-1/2 md:rounded-none md:border-l md:shadow-2xl md:shadow-black/50",
        open ? "md:translate-x-0 md:opacity-100" : "md:translate-x-full md:opacity-0",
        "max-md:inset-x-0 max-md:bottom-0 max-md:max-h-[62vh] max-md:rounded-t-2xl max-md:border-t",
        open ? "max-md:translate-y-0" : "max-md:translate-y-full",
      ].join(" ")}
    >
      {node && (
        <>
          <div className="h-1 w-full shrink-0" style={{ background: `linear-gradient(90deg, ${node.color}, ${node.color}33 70%, transparent)` }} />

          <div className="panel-scroll min-h-0 flex-1 overflow-y-auto px-6 py-5">
            <div className="flex items-start justify-between gap-3">
              <div
                className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10.5px] font-semibold uppercase tracking-[0.14em]"
                style={{ borderColor: `${node.color}55`, color: node.color, background: `${node.color}12` }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: node.color }} />
                {TIER_LABEL[node.tier]}
              </div>
              <button
                onClick={onClose}
                aria-label="Закрыть карточку"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-ink-700/70 text-mist-400 transition hover:border-mist-500 hover:text-mist-100"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M1.5 1.5l9 9m0-9l-9 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <h2 className="font-display mt-4 text-[21px] leading-snug font-medium text-mist-100">
              {node.title}
            </h2>

            <p className="mt-4 text-[14px] leading-relaxed text-mist-300">{node.description}</p>

            {(node.who || node.toWhom || node.metrics) && (
              <dl className="mt-5 space-y-3 border-t border-ink-700/60 pt-5">
                {node.who && <MetaRow label="Кто даёт" value={node.who} color={node.color} />}
                {node.toWhom && <MetaRow label="Кому" value={node.toWhom} color={node.color} />}
                {node.metrics && <MetaRow label="Метрики" value={node.metrics} color={node.color} />}
              </dl>
            )}

            <div className="mt-6 border-t border-ink-700/60 pt-5">
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-mist-500">
                Связи дерева
              </div>

              {parent && (
                <button
                  onClick={() => onNavigate(parent.id)}
                  className="group mt-3 flex w-full items-center gap-3 rounded-lg border border-ink-700/60 bg-ink-850/60 px-3.5 py-2.5 text-left transition hover:border-mist-500/60 hover:bg-ink-800"
                >
                  <svg className="shrink-0 text-mist-500 transition group-hover:-translate-y-0.5 group-hover:text-mist-100" width="13" height="13" viewBox="0 0 14 14" fill="none">
                    <path d="M7 12V2m0 0L2.5 6.5M7 2l4.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span className="min-w-0">
                    <span className="block text-[10px] font-medium uppercase tracking-[0.14em] text-mist-500">
                      уровень выше
                    </span>
                    <span className="block truncate text-[13.5px] font-medium text-mist-100">{parent.title}</span>
                  </span>
                </button>
              )}

              {children.length > 0 && (
                <div className="mt-4">
                  <div className="mb-2 flex items-baseline justify-between">
                    <span className="text-[11px] font-medium text-mist-400">
                      {node.tier === "company" ? "Ценности" : node.tier === "value" ? "Корневые обещания" : "Поддерживающие обещания"}
                    </span>
                    <span className="text-[11px] text-mist-500">{children.length}</span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {children.map((ch) => (
                      <button
                        key={ch.id}
                        onClick={() => onNavigate(ch.id)}
                        className="group flex items-center gap-3 rounded-lg border border-transparent px-3 py-2 text-left transition hover:border-ink-700/70 hover:bg-ink-850/80"
                      >
                        <span
                          className={`h-2.5 w-2.5 shrink-0 rounded-full transition group-hover:scale-125 ${
                            ch.tier === "support" ? "ring-2 ring-inset" : ""
                          }`}
                          style={{
                            background: ch.tier === "support" ? "transparent" : ch.color,
                            ["--tw-ring-color" as string]: ch.color,
                            borderColor: ch.color,
                          }}
                        />
                        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-mist-200 transition group-hover:text-mist-100">
                          {ch.title}
                        </span>
                        <svg className="shrink-0 text-mist-500 transition group-hover:translate-x-0.5 group-hover:text-mist-300" width="10" height="10" viewBox="0 0 10 10" fill="none">
                          <path d="M3.5 2l3 3-3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-ink-700/60 px-6 py-3.5">
            {valueNode && node.tier !== "company" ? (
              <button
                onClick={() => onNavigate(valueNode.id)}
                className="group flex min-w-0 items-center gap-2 text-left"
              >
                <span className="h-2 w-2 shrink-0 rounded-full transition group-hover:scale-125" style={{ background: valueNode.color }} />
                <span className="truncate text-[11.5px] text-mist-500 transition group-hover:text-mist-300">
                  ветка: <span className="font-medium text-mist-400">{valueNode.title}</span>
                </span>
              </button>
            ) : (
              <span className="text-[11.5px] text-mist-500">ядро дерева обещаний</span>
            )}
            <span className="shrink-0 text-[10.5px] uppercase tracking-[0.16em] text-mist-500/70">Esc — закрыть</span>
          </div>
        </>
      )}
    </aside>
  );
}

function MetaRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color, boxShadow: `0 0 6px ${color}77` }} />
      <div className="min-w-0">
        <dt className="text-[9.5px] font-bold uppercase tracking-[0.16em] text-mist-500">{label}</dt>
        <dd className="mt-0.5 text-[13px] leading-snug font-medium text-mist-100">{value}</dd>
      </div>
    </div>
  );
}
