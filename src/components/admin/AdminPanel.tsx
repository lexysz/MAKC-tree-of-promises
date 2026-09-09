import { useEffect, useMemo, useRef, useState } from "react";
import type { CompanyDef, TreeData, ValueDef } from "../../data/tree";
import { TIER_LABEL } from "../../data/tree";
import type { NodePatch } from "../../state/useTreeData";
import type { ImportResult } from "../../lib/excel";
import { TEMPLATE_HEADERS, downloadTemplate, parseWorkbook } from "../../lib/excel";
import { uploadLogo } from "../../lib/supabase";

const CORE_COLOR = "#8fb6c0";

type Tier = "company" | "value" | "root" | "support";

interface AnyDef {
  tier: Tier;
  id: string;
  title: string;
  short?: string;
  description: string;
  who?: string;
  toWhom?: string;
  metrics?: string;
  color: string;
  logo?: string;
}

function findAny(data: TreeData, id: string): AnyDef | null {
  if (data.company.id === id) {
    const c = data.company;
    return { tier: "company", id: c.id, title: c.title, short: c.short, description: c.description, color: CORE_COLOR, logo: c.logo };
  }
  for (const v of data.values) {
    if (v.id === id) return { tier: "value", id: v.id, title: v.title, short: v.short, description: v.description, color: v.color };
    for (const r of v.promises) {
      if (r.id === id) return { tier: "root", id: r.id, title: r.title, short: r.short, description: r.description, who: r.who, toWhom: r.toWhom, metrics: r.metrics, color: v.color };
      for (const s of r.supports) {
        if (s.id === id) return { tier: "support", id: s.id, title: s.title, description: s.description, who: s.who, toWhom: s.toWhom, metrics: s.metrics, color: v.color };
      }
    }
  }
  return null;
}

interface Props {
  data: TreeData;
  modified: boolean;
  onBack: () => void;
  onLogout: () => void;
  onSave: (id: string, patch: NodePatch) => void;
  onUpdateCompany: (patch: Partial<CompanyDef>) => void;
  onApplyImport: (result: ImportResult) => void;
  onReset: () => void;
  onResetAllPositions: () => void;
}

type Tab = "editor" | "import";

export default function AdminPanel({ data, modified, onBack, onLogout, onSave, onUpdateCompany, onApplyImport, onReset, onResetAllPositions }: Props) {
  const [tab, setTab] = useState<Tab>("editor");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [tierFilter, setTierFilter] = useState<Tier | "all">("all");
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const resetTimer = useRef<number | null>(null);
  const [confirmResetPositions, setConfirmResetPositions] = useState(false);
  const resetPositionsTimer = useRef<number | null>(null);

  const notify = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  };

  const selected = selectedId ? findAny(data, selectedId) : null;

  useEffect(() => {
    if (selectedId && !findAny(data, selectedId)) setSelectedId(null);
  }, [data, selectedId]);

  const counts = useMemo(() => {
    let roots = 0, supports = 0;
    data.values.forEach((v) => { roots += v.promises.length; v.promises.forEach((r) => (supports += r.supports.length)); });
    return { values: data.values.length, roots, supports };
  }, [data]);

  const handleReset = () => {
    if (!confirmReset) {
      setConfirmReset(true);
      if (resetTimer.current) window.clearTimeout(resetTimer.current);
      resetTimer.current = window.setTimeout(() => setConfirmReset(false), 3200);
      return;
    }
    setConfirmReset(false);
    onReset();
    setSelectedId(null);
    notify("Данные сброшены");
  };

  const handleResetPositions = () => {
    if (!confirmResetPositions) {
      setConfirmResetPositions(true);
      if (resetPositionsTimer.current) window.clearTimeout(resetPositionsTimer.current);
      resetPositionsTimer.current = window.setTimeout(() => setConfirmResetPositions(false), 3200);
      return;
    }
    setConfirmResetPositions(false);
    onResetAllPositions();
    notify("Позиции сброшены");
  };

  return (
    <div className="relative z-10 flex h-full w-full flex-col">
      <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-ink-700/60 bg-ink-900/85 px-4 py-3 backdrop-blur-md md:px-6">
        <button onClick={onBack} className="group inline-flex items-center gap-2 text-[12px] font-medium text-mist-400 transition hover:text-lagoon">
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none" className="transition-transform group-hover:-translate-x-0.5">
            <path d="M8.5 2.5L4 7l4.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          к дереву
        </button>

        <span className="hidden h-5 w-px bg-ink-700/70 sm:block" />

        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg border border-gold/40 bg-gold/10 text-gold">
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <rect x="3" y="7" width="10" height="7" rx="1.6" stroke="currentColor" strokeWidth="1.4" />
              <path d="M5.2 7V5.4a2.8 2.8 0 115.6 0V7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </span>
          <div>
            <div className="font-display text-[14px] leading-tight font-bold text-mist-100">Админ-панель</div>
            <div className="text-[10.5px] text-mist-500">
              {counts.values} ценностей · {counts.roots} корневых · {counts.supports} поддерживающих
              {modified && <span className="ml-1.5 font-semibold text-gold">· изменено</span>}
            </div>
          </div>
        </div>

        <nav className="ml-auto flex items-center gap-1 rounded-lg border border-ink-700/60 bg-ink-850 p-1">
          {([{ k: "editor" as Tab, label: "Редактор" }, { k: "import" as Tab, label: "Импорт Excel" }]).map((t) => (
            <button
              key={t.k}
              onClick={() => setTab(t.k)}
              className={`rounded-md px-3.5 py-1.5 text-[12px] font-semibold transition-all ${
                tab === t.k ? "bg-gold text-ink-950 shadow-sm" : "text-mist-400 hover:text-mist-100"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <button
            onClick={handleResetPositions}
            className={`rounded-lg border px-3 py-1.5 text-[11.5px] font-semibold transition-all ${
              confirmResetPositions ? "border-ember/70 bg-ember/15 text-ember" : "border-ink-700/70 text-mist-500 hover:border-mist-500/60 hover:text-mist-300"
            }`}
          >
            {confirmResetPositions ? "Точно?" : "Сбросить позиции"}
          </button>
          <button
            onClick={handleReset}
            className={`rounded-lg border px-3 py-1.5 text-[11.5px] font-semibold transition-all ${
              confirmReset ? "border-ember/70 bg-ember/15 text-ember" : "border-ink-700/70 text-mist-500 hover:border-mist-500/60 hover:text-mist-300"
            }`}
          >
            {confirmReset ? "Точно сбросить?" : "Сбросить данные"}
          </button>
          <button onClick={onLogout} className="rounded-lg border border-ink-700/70 px-3 py-1.5 text-[11.5px] font-semibold text-mist-500 transition hover:border-mist-500/60 hover:text-mist-300">
            Выйти
          </button>
        </div>
      </header>

      {tab === "editor" ? (
        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[330px_1fr]">
          <aside className="flex min-h-0 flex-col border-r border-ink-700/60 bg-ink-900/60 max-md:hidden">
            <div className="shrink-0 space-y-2.5 border-b border-ink-700/50 p-3.5">
              <input className="field" placeholder="Поиск…" value={query} onChange={(e) => setQuery(e.target.value)} />
              <div className="flex gap-1.5">
                {([{ k: "all" as const, label: "Все" }, { k: "company" as Tier, label: "Ядро" }, { k: "value" as Tier, label: "Ценности" }, { k: "root" as Tier, label: "Корневые" }, { k: "support" as Tier, label: "Поддерж." }]).map((f) => (
                  <button
                    key={f.k}
                    onClick={() => setTierFilter(f.k)}
                    className={`flex-1 rounded-md border px-1 py-1 text-[10.5px] font-semibold transition ${
                      tierFilter === f.k ? "border-lagoon/50 bg-lagoon/10 text-lagoon" : "border-ink-700/60 text-mist-500 hover:text-mist-300"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="panel-scroll min-h-0 flex-1 overflow-y-auto p-2.5">
              <NodeListItem
                tier="company" id={data.company.id} title={data.company.title} color={CORE_COLOR}
                active={selectedId === data.company.id} onSelect={setSelectedId}
                visible={tierFilter === "all" || tierFilter === "company"}
              />
              {data.values.map((v) => (
                <ValueGroup key={v.id} value={v} selectedId={selectedId} onSelect={setSelectedId} query={query.trim().toLowerCase()} tierFilter={tierFilter} />
              ))}
            </div>
          </aside>

          <section className="panel-scroll min-h-0 overflow-y-auto">
            {selected ? (
              <NodeEditor key={selected.id} node={selected} onSave={(patch) => { onSave(selected.id, patch); notify("Сохранено"); }} onUpdateCompany={onUpdateCompany} />
            ) : (
              <EmptyEditor />
            )}
          </section>
        </div>
      ) : (
        <ImportSection onApplied={(r) => { onApplyImport(r); setTab("editor"); setSelectedId(null); notify(`Импорт: ${r.stats.roots} корневых · ${r.stats.supports} поддерживающих`); }} />
      )}

      <div className={`pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 transition-all duration-300 ${toast ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"}`}>
        <div className="flex items-center gap-2.5 rounded-full border border-lagoon/40 bg-ink-900/95 px-5 py-2.5 shadow-xl shadow-black/50 backdrop-blur-md">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-lagoon">
            <circle cx="7" cy="7" r="5.6" stroke="currentColor" strokeWidth="1.3" />
            <path d="M4.4 7.2l1.8 1.8 3.4-3.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-[12.5px] font-medium text-mist-100">{toast}</span>
        </div>
      </div>
    </div>
  );
}

function NodeListItem({ tier, id, title, color, active, onSelect, visible, indent = 0, count }: { tier: Tier; id: string; title: string; color: string; active: boolean; onSelect: (id: string) => void; visible: boolean; indent?: number; count?: number }) {
  if (!visible) return null;
  return (
    <button onClick={() => onSelect(id)} style={{ paddingLeft: 10 + indent }} className={`group mb-1 flex w-full items-center gap-2.5 rounded-lg border py-2 pr-3 text-left transition-all ${active ? "border-gold/50 bg-gold/[0.08]" : "border-transparent hover:border-ink-700/70 hover:bg-ink-850/70"}`}>
      <span className={`h-2.5 w-2.5 shrink-0 ${tier === "support" ? "rounded-[3px]" : "rounded-full"}`} style={tier === "support" ? { border: `2px solid ${color}` } : { background: tier === "value" ? color : `${color}33`, boxShadow: `0 0 7px ${color}55` }} />
      <span className={`min-w-0 flex-1 truncate text-[12.5px] leading-snug ${active ? "font-semibold text-mist-100" : "text-mist-300 group-hover:text-mist-100"}`}>{title}</span>
      {count !== undefined && <span className="shrink-0 rounded-full border border-ink-700/70 px-1.5 py-px text-[10px] font-semibold text-mist-500">{count}</span>}
    </button>
  );
}

function ValueGroup({ value, selectedId, onSelect, query, tierFilter }: { value: ValueDef; selectedId: string | null; onSelect: (id: string) => void; query: string; tierFilter: Tier | "all" }) {
  const matches = (text: string) => !query || text.toLowerCase().includes(query);
  const anyRootVisible = value.promises.some((r) => matches(r.title) || r.supports.some((s) => matches(s.title)));
  const showGroup = query ? matches(value.title) || anyRootVisible : tierFilter === "all" || anyRootVisible || matches(value.title);
  if (!showGroup) return null;

  return (
    <div className="mb-1">
      <NodeListItem tier="value" id={value.id} title={value.title} color={value.color} active={selectedId === value.id} onSelect={onSelect} visible={!query || matches(value.title) || anyRootVisible} count={value.promises.length} />
      {value.promises.map((r) => {
        const rVisible = (tierFilter === "all" || tierFilter === "root") && (query ? matches(r.title) : true);
        const anySup = r.supports.some((s) => (tierFilter === "all" || tierFilter === "support") && (query ? matches(s.title) : true));
        if (!rVisible && !anySup && query) return null;
        return (
          <div key={r.id}>
            <NodeListItem tier="root" id={r.id} title={r.title} color={value.color} active={selectedId === r.id} onSelect={onSelect} visible={rVisible || (query === "" && tierFilter !== "support")} indent={26} count={r.supports.length} />
            {r.supports.map((s) => (
              <NodeListItem key={s.id} tier="support" id={s.id} title={s.title} color={value.color} active={selectedId === s.id} onSelect={onSelect} visible={(tierFilter === "all" || tierFilter === "support") && (query ? matches(s.title) : true)} indent={52} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function EmptyEditor() {
  return (
    <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-4 p-10 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl border border-ink-700/70 bg-ink-850 text-mist-500">
        <svg width="22" height="22" viewBox="0 0 20 20" fill="none">
          <path d="M3 13.5l8.8-8.8a1.6 1.6 0 012.3 0l1.2 1.2a1.6 1.6 0 010 2.3L6.5 17H3v-3.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
          <path d="M11 6.5l2.5 2.5" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      </span>
      <div>
        <p className="font-display text-[15px] font-bold text-mist-300">Выберите узел слева</p>
        <p className="mx-auto mt-1.5 max-w-[300px] text-[12.5px] leading-relaxed text-mist-500">Редактируйте обещания — изменения сразу попадают на дерево.</p>
      </div>
    </div>
  );
}

function NodeEditor({ node, onSave, onUpdateCompany }: { node: AnyDef; onSave: (patch: NodePatch) => void; onUpdateCompany: (patch: Partial<CompanyDef>) => void }) {
  const [title, setTitle] = useState(node.title);
  const [short, setShort] = useState(node.short ?? "");
  const [description, setDescription] = useState(node.description);
  const [who, setWho] = useState(node.who ?? "");
  const [toWhom, setToWhom] = useState(node.toWhom ?? "");
  const [metrics, setMetrics] = useState(node.metrics ?? "");
  const [logo, setLogo] = useState<string | undefined>(node.logo);
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef<number | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const isPromise = node.tier === "root" || node.tier === "support";
  const hasShort = node.tier === "company" || node.tier === "value" || node.tier === "root";
  const isCompany = node.tier === "company";

  const [uploading, setUploading] = useState(false);
  
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setUploading(true);
    try {
      // Загружаем в Supabase Storage
      const publicUrl = await uploadLogo(file);
      if (publicUrl) {
        setLogo(publicUrl);
      } else {
        alert("Не удалось загрузить логотип");
      }
    } finally {
      setUploading(false);
    }
  };

  const dirty = title.trim() !== node.title || (hasShort && short.trim() !== (node.short ?? "")) || description.trim() !== node.description || who.trim() !== (node.who ?? "") || toWhom.trim() !== (node.toWhom ?? "") || metrics.trim() !== (node.metrics ?? "") || (isCompany && logo !== node.logo);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dirty) return;
    if (isCompany) {
      onUpdateCompany({ title: title.trim() || node.title, short: short.trim() || node.short || title.trim(), description: description.trim(), logo });
    } else {
      onSave({
        title: title.trim() || node.title,
        ...(hasShort ? { short: short.trim() || node.short || title.trim() } : {}),
        description: description.trim(),
        ...(isPromise ? { who: who.trim(), toWhom: toWhom.trim(), metrics: metrics.trim() } : {}),
      });
    }
    setSaved(true);
    if (savedTimer.current) window.clearTimeout(savedTimer.current);
    savedTimer.current = window.setTimeout(() => setSaved(false), 1900);
  };

  return (
    <form onSubmit={submit} className="mx-auto w-full max-w-[640px] p-5 md:p-8">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em]" style={{ borderColor: `${node.color}55`, color: node.color, background: `${node.color}12` }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: node.color }} />
          {TIER_LABEL[node.tier]}
        </span>
        <code className="rounded bg-ink-800 px-1.5 py-0.5 text-[10px] text-mist-500">{node.id}</code>
        {saved && (
          <span className="ml-auto inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-lagoon">
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M2.5 7.5l3 3 6-6.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            сохранено
          </span>
        )}
      </div>

      <h2 className="font-display mt-4 text-[19px] leading-snug font-bold text-mist-100">{title.trim() || "Без названия"}</h2>

      <div className="mt-6 space-y-5">
        {isCompany && (
          <div>
            <label className="field-label">Логотип компании (PNG)</label>
            <div className="flex items-center gap-3">
              <input ref={logoInputRef} type="file" accept="image/png" onChange={handleLogoUpload} className="hidden" disabled={uploading} />
              <button type="button" onClick={() => logoInputRef.current?.click()} disabled={uploading} className="rounded-lg border border-ink-700/60 bg-ink-850 px-4 py-2 text-[12px] font-semibold text-mist-300 transition hover:border-lagoon/50 hover:text-lagoon disabled:opacity-50 disabled:cursor-not-allowed">
                {uploading ? "Загрузка..." : logo ? "Изменить логотип" : "Загрузить логотип"}
              </button>
              {logo && (
                <div className="flex items-center gap-2">
                  <img src={logo} alt="Логотип" className="h-10 w-10 rounded-lg border border-ink-700/60 object-contain bg-ink-850" />
                  <button type="button" onClick={() => setLogo(undefined)} className="text-[11px] text-ember transition hover:text-ember/80">Удалить</button>
                </div>
              )}
            </div>
          </div>
        )}

        <div>
          <label className="field-label">{isCompany ? "Название компании" : "Формулировка"}</label>
          <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={isCompany ? "Например: Acme Corp" : "Текст обещания"} />
        </div>

        {hasShort && (
          <div>
            <label className="field-label">{isCompany ? "Надпись под кружком" : "Короткая подпись"} <span className="normal-case tracking-normal opacity-60">— {isCompany ? "под центральным кружком" : "на кружке дерева"}</span></label>
            <input className="field" value={short} onChange={(e) => setShort(e.target.value)} placeholder={isCompany ? "Например: КОМПАНИЯ" : "Кратко, 20–25 символов"} />
          </div>
        )}

        <div>
          <label className="field-label">Описание</label>
          <textarea className="field min-h-[96px] resize-y leading-relaxed" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={isCompany ? "Опишите компанию и её миссию" : "Раскройте смысл обещания"} />
        </div>

        {isPromise && (
          <div className="border-t border-ink-700/50 pt-5">
            <div className="mb-4 text-[10.5px] font-bold uppercase tracking-[0.18em] text-mist-500">Паспорт обещания</div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label className="field-label">Кто даёт (команда)</label>
                <input className="field" value={who} onChange={(e) => setWho(e.target.value)} placeholder="Команда продукта" />
              </div>
              <div>
                <label className="field-label">Кому (клиент, команда, роль)</label>
                <input className="field" value={toWhom} onChange={(e) => setToWhom(e.target.value)} placeholder="Клиенты B2B" />
              </div>
            </div>
            <div className="mt-5">
              <label className="field-label">Метрики</label>
              <input className="field" value={metrics} onChange={(e) => setMetrics(e.target.value)} placeholder="Аптайм ≥ 99,9% · NPS ≥ 60" />
            </div>
          </div>
        )}
      </div>

      <div className="mt-7 flex items-center gap-3">
        <button type="submit" disabled={!dirty} className={`font-display rounded-lg px-6 py-2.5 text-[13px] font-bold tracking-wide transition-all duration-200 ${dirty ? "bg-gold text-ink-950 hover:-translate-y-0.5 hover:brightness-110 hover:shadow-lg hover:shadow-gold/25 active:translate-y-0" : "cursor-not-allowed bg-ink-800 text-mist-500"}`}>
          Сохранить
        </button>
        <span className={`text-[11.5px] transition-opacity ${dirty ? "text-gold opacity-100" : "text-mist-500 opacity-60"}`}>{dirty ? "есть несохранённые изменения" : "изменений нет"}</span>
      </div>
    </form>
  );
}

function ImportSection({ onApplied }: { onApplied: (r: ImportResult) => void }) {
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File | undefined | null) => {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    setResult(null);
    setFileName(file.name);
    try {
      const r = await parseWorkbook(file);
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось разобрать файл.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel-scroll min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-[760px] p-5 md:p-8">
        <h2 className="font-display text-[19px] font-bold text-mist-100">Импорт обещаний из Excel</h2>
        <p className="mt-1.5 max-w-[560px] text-[13px] leading-relaxed text-mist-400">Загрузите файл с обещаниями — колонки распознаются по названиям, дерево пересоберётся автоматически.</p>

        <div onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files?.[0]); }} onClick={() => inputRef.current?.click()} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }} className={`mt-6 flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-all duration-200 ${drag ? "border-gold bg-gold/[0.07] scale-[1.01]" : "border-ink-700/80 bg-ink-900/50 hover:border-mist-500/50 hover:bg-ink-850/70"}`}>
          <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ""; }} />
          {busy ? (
            <>
              <span className="spinner h-8 w-8 rounded-full border-2 border-ink-700 border-t-gold" />
              <p className="text-[13px] font-medium text-mist-300">Читаем «{fileName}»…</p>
            </>
          ) : (
            <>
              <span className={`grid h-12 w-12 place-items-center rounded-xl border transition-colors ${drag ? "border-gold/60 bg-gold/10 text-gold" : "border-ink-700 bg-ink-850 text-mist-400"}`}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 13V3.5m0 0L6.5 7M10 3.5L13.5 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /><path d="M3.5 12.5v2.6c0 .8.6 1.4 1.4 1.4h10.2c.8 0 1.4-.6 1.4-1.4v-2.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
              </span>
              <div>
                <p className="text-[14px] font-semibold text-mist-100">Перетащите файл сюда <span className="font-normal text-mist-500">или кликните для выбора</span></p>
                <p className="mt-1 text-[11.5px] text-mist-500">.xlsx · .xls · .csv</p>
              </div>
            </>
          )}
        </div>

        {error && (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-ember/40 bg-ember/[0.08] px-4 py-3.5">
            <svg className="mt-0.5 shrink-0 text-ember" width="15" height="15" viewBox="0 0 14 14" fill="none"><path d="M7 1.8L13 12H1L7 1.8z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /><path d="M7 5.6v2.8M7 10.2v.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
            <div>
              <p className="text-[12.5px] font-semibold text-ember">Файл не подошёл{fileName ? `: ${fileName}` : ""}</p>
              <p className="mt-0.5 text-[12px] leading-relaxed text-mist-300">{error}</p>
            </div>
          </div>
        )}

        {result && (
          <div className="mt-5 overflow-hidden rounded-2xl border border-lagoon/35 bg-ink-900/70">
            <div className="flex items-center gap-2.5 border-b border-ink-700/60 bg-lagoon/[0.06] px-5 py-3.5">
              <svg className="text-lagoon" width="15" height="15" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.6" stroke="currentColor" strokeWidth="1.3" /><path d="M4.4 7.2l1.8 1.8 3.4-3.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
              <p className="text-[13px] font-semibold text-mist-100">Файл «{fileName}» разобран</p>
            </div>
            <div className="flex flex-wrap items-center gap-x-7 gap-y-2 px-5 py-4">
              {[{ n: result.stats.rows, label: "строк", c: "#93abb2" }, { n: result.stats.values, label: "ценностей", c: "#f2b45a" }, { n: result.stats.roots, label: "корневых", c: "#43d6b5" }, { n: result.stats.supports, label: "поддерживающих", c: "#6fb4f2" }].map((s) => (
                <span key={s.label} className="flex items-baseline gap-1.5">
                  <span className="font-display text-[20px] font-bold" style={{ color: s.c }}>{s.n}</span>
                  <span className="text-[11px] text-mist-500">{s.label}</span>
                </span>
              ))}
            </div>
            {result.warnings.length > 0 && (
              <div className="mx-5 mb-4 max-h-36 overflow-y-auto rounded-lg border border-gold/30 bg-gold/[0.06] px-4 py-3 panel-scroll">
                <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.16em] text-gold">Предупреждения · {result.warnings.length}</p>
                <ul className="space-y-1">{result.warnings.map((w: string, i: number) => <li key={i} className="text-[11.5px] leading-relaxed text-mist-300">• {w}</li>)}</ul>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-3 border-t border-ink-700/60 bg-ink-950/40 px-5 py-4">
              <button onClick={() => onApplied(result)} className="font-display rounded-lg bg-lagoon px-6 py-2.5 text-[13px] font-bold text-ink-950 transition-all hover:-translate-y-0.5 hover:brightness-110 hover:shadow-lg hover:shadow-lagoon/25 active:translate-y-0">Применить импорт</button>
              <button onClick={() => setResult(null)} className="rounded-lg border border-ink-700/70 px-4 py-2.5 text-[12.5px] font-semibold text-mist-400 transition hover:text-mist-100">Отмена</button>
            </div>
          </div>
        )}

        <div className="mt-7 rounded-2xl border border-ink-700/60 bg-ink-900/50 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-mist-500">Ожидаемые колонки</p>
            <button onClick={downloadTemplate} className="inline-flex items-center gap-2 rounded-lg border border-lagoon/40 px-3.5 py-1.5 text-[11.5px] font-semibold text-lagoon transition hover:bg-lagoon/10">
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M7 2v7.5m0 0L4 6.7M7 9.5l3-2.8M2.5 12h9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
              Скачать шаблон .xlsx
            </button>
          </div>
          <div className="mt-3.5 flex flex-wrap gap-1.5">
            {TEMPLATE_HEADERS.map((h: string, i: number) => <code key={i} className="rounded-md border border-ink-700/60 bg-ink-850 px-2 py-1 text-[10.5px] text-mist-300">{h}</code>)}
          </div>
        </div>
      </div>
    </div>
  );
}
