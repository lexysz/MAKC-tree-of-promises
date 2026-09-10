import type { GraphNode } from "../lib/layout";
import type { GeneralDef } from "../data/tree";

interface DetailPanelProps {
  node: GraphNode | null;
  parent: GraphNode | null;
  children: GraphNode[];
  valueNode: GraphNode | null;
  generalPromises?: GeneralDef[];  // НОВОЕ
  onClose: () => void;
  onNavigate: (id: string | null) => void;
}

export default function DetailPanel({
  node,
  parent,
  children,
  valueNode,
  generalPromises = [],  // НОВОЕ
  onClose,
  onNavigate,
}: DetailPanelProps) {
  if (!node) return null;

  const isCompanyCore = node.tier === "company";

  return (
    <div className="fixed right-0 top-0 z-30 h-full w-full max-w-md overflow-y-auto border-l border-ink-700/50 bg-ink-900/95 p-6 backdrop-blur-md">
      {/* Кнопка закрытия */}
      <button
        onClick={onClose}
        className="absolute right-4 top-4 text-mist-400 transition-colors hover:text-mist-200"
        aria-label="Закрыть"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>

      {/* Заголовок */}
      <div className="mb-4">
        <span
          className="mb-2 inline-block rounded-full px-3 py-1 text-xs font-semibold"
          style={{ backgroundColor: `${node.color}22`, color: node.color }}
        >
          {node.tier === "company" ? "Ядро компании" : 
           node.tier === "value" ? "Ценность" :
           node.tier === "root" ? "Корневое обещание" : "Поддерживающее"}
        </span>
        <h2 className="text-xl font-bold text-mist-100">{node.title}</h2>
      </div>

      {/* Описание */}
      <p className="mb-6 text-sm leading-relaxed text-mist-300">
        {node.description}
      </p>

      {/* НОВОЕ: Общие обещания (только для ядра компании) */}
      {isCompanyCore && generalPromises.length > 0 && (
        <div className="mb-6">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-mist-500">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2"></rect>
              <line x1="9" y1="3" x2="9" y2="21"></line>
            </svg>
            Общие обещания (инфраструктура)
          </h3>
          <div className="space-y-3">
            {generalPromises.map((promise) => (
              <div
                key={promise.id}
                className="rounded-lg border border-ink-700/50 bg-ink-800/50 p-4 transition-colors hover:bg-ink-800/80"
              >
                <div className="flex items-start justify-between">
                  <h4 className="font-semibold text-mist-100">{promise.title}</h4>
                </div>
                <p className="mt-1 text-xs text-mist-400">{promise.description}</p>
                
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  {promise.who && (
                    <span className="rounded-full bg-lagoon/20 px-2 py-1 text-lagoon">
                      👤 {promise.who}
                    </span>
                  )}
                  {promise.toWhom && (
                    <span className="rounded-full bg-gold/20 px-2 py-1 text-gold">
                      🎯 {promise.toWhom}
                    </span>
                  )}
                  {promise.metrics && (
                    <span className="rounded-full bg-mist-500/20 px-2 py-1 text-mist-400">
                      📊 {promise.metrics}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Родительский узел */}
      {parent && (
        <div className="mb-4">
          <h3 className="mb-2 text-sm font-bold uppercase tracking-wider text-mist-500">
            Родитель
          </h3>
          <button
            onClick={() => onNavigate(parent.id)}
            className="flex w-full items-center gap-2 rounded-lg border border-ink-700/50 bg-ink-800/50 p-3 text-left transition-colors hover:bg-ink-800"
          >
            <span className="h-2 w-2 rounded-full" style={{ background: parent.color }}></span>
            <span className="text-sm text-mist-200">{parent.title}</span>
          </button>
        </div>
      )}

      {/* Дочерние узлы */}
      {children.length > 0 && (
        <div className="mb-4">
          <h3 className="mb-2 text-sm font-bold uppercase tracking-wider text-mist-500">
            {isCompanyCore ? "Ценности компании" : `Дочерние узлы (${children.length})`}
          </h3>
          <div className="space-y-2">
            {children.map((child) => (
              <button
                key={child.id}
                onClick={() => onNavigate(child.id)}
                className="flex w-full items-center gap-2 rounded-lg border border-ink-700/50 bg-ink-800/50 p-3 text-left transition-colors hover:bg-ink-800"
              >
                <span className="h-2 w-2 rounded-full" style={{ background: child.color }}></span>
                <span className="text-sm text-mist-200">{child.title}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Подсказка для ядра компании */}
      {isCompanyCore && (
        <div className="mt-4 border-t border-ink-700/50 pt-4">
          <p className="text-xs text-mist-500">
            💡 Кликните на ценность, чтобы увидеть её корневые и поддерживающие обещания
          </p>
        </div>
      )}

      {/* Для не-ядра: показать родительскую ценность */}
      {!isCompanyCore && valueNode && (
        <div className="mt-4 border-t border-ink-700/50 pt-4">
          <h3 className="mb-2 text-sm font-bold uppercase tracking-wider text-mist-500">
            Ценность
          </h3>
          <button
            onClick={() => onNavigate(valueNode.id)}
            className="flex w-full items-center gap-2 rounded-lg border border-ink-700/50 bg-ink-800/50 p-3 text-left transition-colors hover:bg-ink-800"
          >
            <span className="h-2 w-2 rounded-full" style={{ background: valueNode.color }}></span>
            <span className="text-sm text-mist-200">{valueNode.title}</span>
          </button>
        </div>
      )}
    </div>
  );
}
