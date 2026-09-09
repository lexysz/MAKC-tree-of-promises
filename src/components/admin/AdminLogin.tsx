import { useState } from "react";

const ADMIN_USER = "admin";
const ADMIN_PASS = "promises";

interface Props {
  onSuccess: () => void;
  onBack: () => void;
}

export default function AdminLogin({ onSuccess, onBack }: Props) {
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (user.trim() === ADMIN_USER && pass === ADMIN_PASS) {
      sessionStorage.setItem("pt-admin", "1");
      onSuccess();
    } else {
      setError(true);
      setShake(true);
      setTimeout(() => setShake(false), 500);
    }
  };

  return (
    <div className="relative z-10 flex h-full w-full items-center justify-center p-6">
      <form
        onSubmit={submit}
        className={`w-full max-w-[380px] rounded-2xl border border-ink-700/60 bg-ink-900/90 p-7 shadow-2xl shadow-black/50 backdrop-blur-md ${shake ? "shake" : ""}`}
      >
        <button
          type="button"
          onClick={onBack}
          className="mb-5 inline-flex items-center gap-2 text-[12px] font-medium text-mist-400 transition hover:text-lagoon"
        >
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <path d="M8.5 2.5L4 7l4.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          к дереву
        </button>

        <div className="mb-6 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl border border-gold/40 bg-gold/10 text-gold">
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
              <rect x="3" y="7" width="10" height="7" rx="1.6" stroke="currentColor" strokeWidth="1.4" />
              <path d="M5.2 7V5.4a2.8 2.8 0 115.6 0V7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </span>
          <div>
            <h1 className="font-display text-[17px] font-bold text-mist-100">Админ-панель</h1>
            <p className="text-[11.5px] text-mist-500">Вход для редакторов дерева обещаний</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="field-label">Логин</label>
            <input
              className="field"
              value={user}
              onChange={(e) => { setUser(e.target.value); setError(false); }}
              placeholder="admin"
              autoComplete="username"
              autoFocus
            />
          </div>
          <div>
            <label className="field-label">Пароль</label>
            <input
              className="field"
              type="password"
              value={pass}
              onChange={(e) => { setPass(e.target.value); setError(false); }}
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>
        </div>

        {error && (
          <p className="mt-3 text-[12px] font-medium text-ember">Неверный логин или пароль</p>
        )}

        <button
          type="submit"
          className="font-display mt-6 w-full rounded-lg bg-gold py-2.5 text-[13px] font-bold text-ink-950 transition-all hover:-translate-y-0.5 hover:brightness-110 hover:shadow-lg hover:shadow-gold/25 active:translate-y-0"
        >
          Войти
        </button>

        <div className="mt-5 rounded-lg border border-ink-700/60 bg-ink-850/70 px-3.5 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-mist-500">Демо-доступ</p>
          <div className="mt-1.5 flex items-center gap-2 text-[12px] text-mist-300">
            <code className="rounded bg-ink-800 px-1.5 py-0.5 text-[11px] text-gold/90">admin</code>
            <span className="text-mist-500">/</span>
            <code className="rounded bg-ink-800 px-1.5 py-0.5 text-[11px] text-gold/90">promises</code>
            <button
              type="button"
              onClick={() => { setUser(ADMIN_USER); setPass(ADMIN_PASS); setError(false); }}
              className="ml-auto text-[11px] font-semibold text-lagoon transition hover:text-lagoon/80"
            >
              подставить
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
