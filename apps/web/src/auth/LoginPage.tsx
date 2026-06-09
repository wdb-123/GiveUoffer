import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

export interface LoginCredentials {
  email: string;
  password: string;
  remember: boolean;
  method: "password" | "google" | "create-account";
}

interface LoginPageProps {
  onLogin(credentials: LoginCredentials): Promise<void>;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ title: string; message: string } | null>(null);
  const toastTimer = useRef<number | null>(null);

  const fieldState = useMemo(() => ({
    email: email.trim().length > 0,
    password: password.length > 0,
  }), [email, password]);

  useEffect(() => () => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
  }, []);

  function showToast(title: string, message: string) {
    setToast({ title, message });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2400);
  }

  async function runAuth(credentials: LoginCredentials) {
    setSubmitting(true);
    try {
      await onLogin(credentials);
    } catch (cause) {
      showToast("登录失败", cause instanceof Error ? cause.message : "请检查账号信息。");
    } finally {
      setSubmitting(false);
    }
  }

  function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      showToast("需要登录信息", "请输入邮箱和密码。");
      return;
    }
    void runAuth({ email: cleanEmail, password, remember, method: "password" });
  }

  function continueWithGoogle() {
    void runAuth({ email: "google-user@ucareer.local", password: "", remember, method: "google" });
  }

  function createAccount() {
    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      showToast("创建账户", "请输入邮箱和密码后创建本地账户。");
      return;
    }
    void runAuth({ email: cleanEmail, password, remember, method: "create-account" });
  }

  return (
    <main className="login-page" aria-label="Ucareer 登录页">
      <section className="login-canvas" aria-label="Ucareer login page">
        <section className="login-brand-story" aria-label="Ucareer brand story">
          <div className="login-story-brand">
            <img src="/assets/ucareer-primary-logo-light.svg" alt="Ucareer" />
          </div>

          <div className="login-story-copy">
            <h1>Your Journey.<br />Your Career.</h1>
            <span>每个人都有自己的旅程，也值得拥有属于自己的职业方向。Ucareer 陪你看清自己，连接机会，走向真正适合你的未来。</span>
            <div className="login-story-pillars" aria-label="Ucareer brand principles">
              <span>帮你找准适合自己的工作方向</span>
              <span>把岗位搜索、投递记录和简历定制串起来</span>
              <span>让每次投递与面试复盘都变成下一次的养分</span>
            </div>
          </div>

          <div className="journey-scene" aria-hidden="true">
            <div className="journey-sky" />
            <div className="journey-horizon" />
            <svg className="journey-map" viewBox="0 0 760 620" role="img">
              <defs>
                <linearGradient id="journeyRouteGradient" x1="138" y1="498" x2="608" y2="116" gradientUnits="userSpaceOnUse">
                  <stop offset="0" stopColor="#7b61ff" />
                  <stop offset="0.38" stopColor="#4f8cff" />
                  <stop offset="0.7" stopColor="#ffd08a" />
                  <stop offset="1" stopColor="#ffad6e" />
                </linearGradient>
                <filter id="journeyGlow" x="-30%" y="-30%" width="160%" height="160%">
                  <feGaussianBlur stdDeviation="7" result="blur" />
                  <feColorMatrix in="blur" type="matrix" values="1 0 0 0 0.4 0 1 0 0 0.55 0 0 1 0 1 0 0 0 0.85 0" />
                  <feMerge>
                    <feMergeNode />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              <path className="journey-route route-shadow" d="M146 510C146 420 242 381 332 410C433 443 492 403 462 326C436 258 501 213 562 168C596 143 612 116 610 82" />
              <path className="journey-route route-main" d="M146 510C146 420 242 381 332 410C433 443 492 403 462 326C436 258 501 213 562 168C596 143 612 116 610 82" />
              <path className="journey-route route-core" d="M146 510C146 420 242 381 332 410C433 443 492 403 462 326C436 258 501 213 562 168C596 143 612 116 610 82" />
              <circle className="journey-start" cx="146" cy="510" r="9" />
              <circle className="journey-orbit" cx="610" cy="82" r="58" />
              <path className="journey-compass" d="M610 29L624 82L610 135L596 82Z" />
              <path className="journey-compass-soft" d="M557 82L610 68L663 82L610 96Z" />
            </svg>
          </div>

        </section>

        <form className="login-panel" aria-label="Ucareer 登录表单" autoComplete="on" noValidate onSubmit={submitLogin}>
          <div className="login-panel-brand">
            <img src="/assets/ucareer-primary-logo-light.svg" alt="Ucareer" />
          </div>

          <label className={fieldState.email ? "login-control has-value" : "login-control"}>
            <span>Email</span>
            <input
              name="email"
              type="email"
              placeholder="name@company.com"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>

          <label className={fieldState.password ? "login-control has-value" : "login-control"}>
            <span>Password</span>
            <input
              name="password"
              type="password"
              placeholder="Enter your password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          <div className="login-panel-row">
            <label className="login-check">
              <input
                name="remember"
                type="checkbox"
                checked={remember}
                onChange={(event) => setRemember(event.target.checked)}
              />
              <span>Remember me</span>
            </label>
            <button className="login-text-button" type="button" onClick={() => showToast("找回密码", "找回密码流程入口已预留。")}>
              Forgot password?
            </button>
          </div>

          <button className="login-primary-action" type="submit" disabled={submitting}>
            <span>{submitting ? "Signing in..." : "Log in"}</span>
            <i aria-hidden="true">→</i>
          </button>

          <div className="login-divider">
            <span>or continue with</span>
          </div>

          <div className="login-secondary-actions">
            <button type="button" disabled={submitting} onClick={createAccount}>Create account</button>
            <button type="button" disabled={submitting} onClick={continueWithGoogle}>Google</button>
          </div>

          <p className="login-legal">
            By continuing, you agree to our <a href="#terms">Terms</a> and <a href="#privacy">Privacy Policy</a>.
          </p>
        </form>

        <div className={toast ? "login-toast show" : "login-toast"} role="status" aria-live="polite">
          {toast ? (
            <>
              <strong>{toast.title}</strong>
              {toast.message}
            </>
          ) : null}
        </div>
      </section>
    </main>
  );
}
