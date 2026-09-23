import { useState, type FormEvent } from "react";
import { supabase } from "../../lib/supabase";

interface Props {
  onSuccess: () => void;
  onBack: () => void;
}

const SHAKE_DURATION_MS = 500;

const ERROR_MESSAGES: Record<string, string> = {
  "Invalid login credentials": "Неверный email или пароль",
  "Email not confirmed": "Email не подтверждён. Проверьте почту",
  "Too many requests": "Слишком много попыток. Подождите минуту",
};

// ─── Icons ───────────────────────────────────────────────────────

function BackIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
      <path
        d="M8.5 2.5L4 7l4.5 4.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
      <rect x="3" y="7" width="10" height="7" rx="1.6" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5.2 7V5.4a2.8 2.8 0 115.6 0V7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────

function localizeAuthError(error: Error): string {
  return ERROR_MESSAGES[error.message] || error.message;
}

// ─── Component ───────────────────────────────────────────────────

export default function AdminLogin({ onSuccess, onBack }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError) {
        setError(localizeAuthError(authError));
        triggerShake();
      } else if (data.session) {
        onSuccess();
      }
    } catch {
      setError("Ошибка подключения к серверу");
    } finally {
      setLoading(false);
    }
  };

  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), SHAKE_DURATION_MS);
  };

  const clearError = () => setError(null);

  return (
    <div className="relative z-10 flex h-full w-full items-center justify-center p-6">
      <form
        onSubmit={handleSubmit}
        className={`w-full max-w-[380px] rounded-2xl border border-ink-700/60 bg-ink-900/90 p-7 shadow-2xl shadow-black/50 backdrop-blur-md ${
          shake ? "shake" : ""
        }`}
        role="form"
        aria-label="Форма входа в админ-панель"
      >
        <button
          type="button"
          onClick={onBack}
          className="mb-5 inline-flex items-center gap-2 text-[12px] font-medium text-mist-400 transition hover:text-lagoon"
          aria-label="Вернуться к дереву"
        >
          <BackIcon />
          к дереву
        </button>

        <div className="mb-6 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl border border-gold/40 bg-gold/10 text-gold">
            <LockIcon />
          </span>
          <div>
            <h1 className="font-display text-[17px] font-bold text-mist-100">Админ-панель</h1>
            <p className="text-[11.5px] text-mist-500">Вход для редакторов дерева обещаний</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label htmlFor="email" className="field-label">
              Email
            </label>
            <input
              id="email"
              className="field"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                clearError();
              }}
              placeholder="admin@company.com"
              autoComplete="email"
              autoFocus
              disabled={loading}
              required
              aria-invalid={error ? "true" : "false"}
              aria-describedby={error ? "error-message" : undefined}
            />
          </div>

          <div>
            <label htmlFor="password" className="field-label">
              Пароль
            </label>
            <input
              id="password"
              className="field"
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                clearError();
              }}
              placeholder="••••••••"
              autoComplete="current-password"
              disabled={loading}
              required
              minLength={6}
              aria-invalid={error ? "true" : "false"}
              aria-describedby={error ? "error-message" : undefined}
            />
          </div>
        </div>

        {error && (
          <p id="error-message" className="mt-3 text-[12px] font-medium text-ember" role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading || !email.trim() || !password}
          className="font-display mt-6 w-full rounded-lg bg-gold py-2.5 text-[13px] font-bold text-ink-950 transition-all hover:-translate-y-0.5 hover:brightness-110 hover:shadow-lg hover:shadow-gold/25 active:translate-y-0 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? "Вход..." : "Войти"}
        </button>
      </form>
    </div>
  );
}
