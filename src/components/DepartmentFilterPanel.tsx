// ─── Types ───────────────────────────────────────────────────────

export interface DepartmentInfo {
  name: string;
  count: number;
}

export interface FilteredNode {
  id: string;
  title: string;
  tier: string;
  color: string;
  who?: string;
  toWhom?: string;
  metrics?: string;
  valueTitle: string;
}

interface Props {
  departments: DepartmentInfo[];
  selectedDepartment: string | null;
  filteredNodes: FilteredNode[];
  onSelectDepartment: (name: string | null) => void;
  onNavigateToNode: (id: string) => void;
  onClose: () => void;
}

// ─── Icons ───────────────────────────────────────────────────────

function CloseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M1.5 1.5l9 9m0-9l-9 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="shrink-0 text-mist-500 transition group-hover:translate-x-0.5 group-hover:text-mist-300">
      <path d="M3.5 2l3 3-3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Sub-Components ──────────────────────────────────────────────

function DepartmentChip({
  name,
  count,
  isActive,
  onClick,
}: {
  name: string;
  count: number;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-[12px] font-semibold transition-all ${
        isActive
          ? "border-lagoon/60 bg-lagoon/15 text-lagoon shadow-sm"
          : "border-ink-700/60 bg-ink-850/60 text-mist-400 hover:border-mist-500/50 hover:text-mist-200"
      }`}
    >
      <span>{name}</span>
      <span
        className={`rounded-full px-1.5 py-px text-[10px] font-bold ${
          isActive ? "bg-lagoon/20 text-lagoon" : "bg-ink-700/60 text-mist-500"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

function FilteredNodeCard({
  node,
  onNavigate,
}: {
  node: FilteredNode;
  onNavigate: (id: string) => void;
}) {
  return (
    <button
      onClick={() => onNavigate(node.id)}
      className="group flex w-full flex-col gap-2 rounded-xl border border-ink-700/60 bg-ink-850/60 p-4 text-left transition-all hover:border-lagoon/50 hover:bg-ink-800/80"
    >
      {/* Заголовок */}
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 flex-1 text-[13.5px] font-semibold leading-snug text-mist-100">
          {node.title}
        </span>
        <ArrowRightIcon />
      </div>

      {/* Тип и ценность */}
      <div className="flex items-center gap-2 text-[11px] text-mist-500">
        <span
          className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-semibold uppercase tracking-[0.1em]"
          style={{
            borderColor: `${node.color}55`,
            color: node.color,
            background: `${node.color}12`,
          }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: node.color }} />
          {node.tier === "root" ? "Корневое" : "Поддерживающее"}
        </span>
        <span className="truncate">· {node.valueTitle}</span>
      </div>

      {/* Уточнения */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-ink-700/50 pt-2 text-[11.5px]">
        {node.who && (
          <span className="flex items-center gap-1.5">
            <span className="font-bold uppercase tracking-[0.1em] text-mist-500">Кто:</span>
            <span className="text-mist-300">{node.who}</span>
          </span>
        )}
        {node.toWhom && (
          <span className="flex items-center gap-1.5">
            <span className="font-bold uppercase tracking-[0.1em] text-mist-500">Кому:</span>
            <span className="text-mist-300">{node.toWhom}</span>
          </span>
        )}
        {node.metrics && (
          <span className="flex items-center gap-1.5">
            <span className="font-bold uppercase tracking-[0.1em] text-mist-500">Метрика:</span>
            <span className="text-mist-300">{node.metrics}</span>
          </span>
        )}
      </div>
    </button>
  );
}

// ─── Main Component ──────────────────────────────────────────────

export default function DepartmentFilterPanel({
  departments,
  selectedDepartment,
  filteredNodes,
  onSelectDepartment,
  onNavigateToNode,
  onClose,
}: Props) {
  const totalFiltered = filteredNodes.length;

  return (
       <aside className="pointer-events-auto absolute inset-x-0 bottom-0 z-30 flex max-h-[70vh] flex-col rounded-t-2xl border-t border-ink-700/60 bg-ink-900/95 shadow-2xl shadow-black/50 backdrop-blur-md md:inset-y-0 md:left-0 md:right-auto md:w-1/2 md:max-h-none md:rounded-none md:border-l-0 md:border-r">
      {/* Цветная полоска сверху */}
      <div className="h-1 w-full shrink-0 bg-gradient-to-r from-lagoon via-lagoon/50 to-transparent" />

      {/* Контент */}
      <div className="panel-scroll min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {/* Заголовок */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-[16px] font-bold text-mist-100">
              Обещания подразделения
            </h2>
            <p className="mt-0.5 text-[11.5px] text-mist-500">
              {selectedDepartment
                ? `Показано ${totalFiltered} обещаний, которые даёт «${selectedDepartment}»`
                : "Выберите подразделение — покажем все его обещания"}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Закрыть панель фильтров"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-ink-700/70 text-mist-400 transition hover:border-mist-500 hover:text-mist-100"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Список подразделений */}
        <div className="mt-4">
          <div className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.16em] text-mist-500">
            Подразделения
          </div>
          {departments.length === 0 ? (
            <p className="rounded-xl border border-ink-700/60 bg-ink-850/40 p-4 text-center text-[12.5px] text-mist-500">
              Подразделения не найдены. Убедитесь, что в данных есть поля «Кто» и «Кому».
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {departments.map((dept) => (
                <DepartmentChip
                  key={dept.name}
                  name={dept.name}
                  count={dept.count}
                  isActive={selectedDepartment === dept.name}
                  onClick={() =>
                    onSelectDepartment(selectedDepartment === dept.name ? null : dept.name)
                  }
                />
              ))}
            </div>
          )}
        </div>

        {/* Список отфильтрованных обещаний */}
        {selectedDepartment && (
          <div className="mt-5">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-mist-500">
                Отфильтрованные обещания
              </span>
              <span className="text-[11px] text-mist-500">{totalFiltered}</span>
            </div>

            {totalFiltered === 0 ? (
              <div className="rounded-xl border border-ink-700/60 bg-ink-850/40 p-4 text-center text-[12.5px] text-mist-500">
                Обещания для «{selectedDepartment}» не найдены
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {filteredNodes.map((node) => (
                  <FilteredNodeCard key={node.id} node={node} onNavigate={onNavigateToNode} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
