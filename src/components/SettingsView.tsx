import { useEffect, useRef, useState } from 'react';
import {
  Check,
  Cloud,
  CloudUpload,
  Copy,
  Download,
  Eye,
  EyeOff,
  Lock,
  LogOut,
  Mail,
  Monitor,
  Moon,
  RefreshCw,
  RotateCcw,
  Sun,
  Upload,
  User,
  WifiOff,
} from 'lucide-react';
import type {
  AppSettings,
  CloudSyncResult,
  CloudUser,
  FontSizePreference,
  ThemePreference,
} from '../types/learning';
import { toPersianDigits } from '../utils/studyEngine';
import { PWAInstallButton } from './PWAInstallButton';

interface SettingsViewProps {
  settings: AppSettings;
  lessonCount: number;
  cloudUser: CloudUser | null;
  cloudSyncing: boolean;
  cloudLastSyncedAt: number | null;
  cloudApiUrl: string;
  isOnline: boolean;
  pendingSyncCount: number;
  onUpdateSettings: (partial: Partial<AppSettings>) => void;
  onExportBackup: () => string;
  onImportBackup: (jsonText: string) => { ok: boolean; message: string };
  onResetProgress: () => void;
  onRestoreDefaults: () => void;
  onRegisterToCloud: (
    email: string,
    password: string,
    name?: string,
    website?: string
  ) => Promise<CloudSyncResult>;
  onLoginToCloud: (email: string, password: string) => Promise<CloudSyncResult>;
  onLogoutFromCloud: () => void;
  onSyncWithCloud: () => Promise<CloudSyncResult>;
  onPushAllToCloud: () => Promise<CloudSyncResult>;
  onUpdateCloudApiUrl: (url: string) => string;
  onTestCloudConnection: (overrideUrl?: string) => Promise<{ ok: boolean; message: string }>;
}

const WORKER_DEPLOY_COMMANDS = `cd cloudflare-worker
npm install
npx wrangler login
npx wrangler d1 create darsnegar-db
# Paste database_id into wrangler.toml
npm run db:migrate
npx wrangler secret put JWT_SECRET
npm run deploy`;

export function SettingsView({
  settings,
  lessonCount,
  cloudUser,
  cloudSyncing,
  cloudLastSyncedAt,
  cloudApiUrl,
  isOnline,
  pendingSyncCount,
  onUpdateSettings,
  onExportBackup,
  onImportBackup,
  onResetProgress,
  onRestoreDefaults,
  onRegisterToCloud,
  onLoginToCloud,
  onLogoutFromCloud,
  onSyncWithCloud,
  onPushAllToCloud,
  onUpdateCloudApiUrl,
  onTestCloudConnection,
}: SettingsViewProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  // Cloudflare Account & Sync State
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authName, setAuthName] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authPending, setAuthPending] = useState(false);
  const [cloudFeedback, setCloudFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  // Custom Cloudflare Worker URL state
  const [workerUrlDraft, setWorkerUrlDraft] = useState(cloudApiUrl);
  const [testingConn, setTestingConn] = useState(false);
  const [copiedGuide, setCopiedGuide] = useState(false);

  useEffect(() => {
    setWorkerUrlDraft(cloudApiUrl);
  }, [cloudApiUrl]);

  const formatLastSynced = (ts: number | null) => {
    if (!ts) return 'هنوز همگام‌سازی نشده';
    try {
      return new Intl.DateTimeFormat('fa-IR', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(ts));
    } catch {
      return new Date(ts).toLocaleString();
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCloudFeedback(null);

    const email = authEmail.trim();
    const password = authPassword.trim();
    const name = authName.trim();

    if (!email || !email.includes('@')) {
      setCloudFeedback({ ok: false, text: 'لطفاً یک آدرس ایمیل معتبر وارد کنید.' });
      return;
    }
    if (password.length < 6) {
      setCloudFeedback({ ok: false, text: 'رمز عبور باید حداقل ۶ کاراکتر باشد.' });
      return;
    }

    setAuthPending(true);
    try {
      const result =
        authMode === 'login'
          ? await onLoginToCloud(email, password)
          : await onRegisterToCloud(email, password, name || undefined, honeypot || undefined);
      setCloudFeedback({ ok: result.ok, text: result.message });
      if (result.ok) {
        setAuthPassword('');
      }
    } finally {
      setAuthPending(false);
    }
  };

  const handleManualSync = async () => {
    setCloudFeedback(null);
    const res = await onSyncWithCloud();
    setCloudFeedback({ ok: res.ok, text: res.message });
  };

  const handlePushAll = async () => {
    setCloudFeedback(null);
    const res = await onPushAllToCloud();
    setCloudFeedback({ ok: res.ok, text: res.message });
  };

  const handleSaveWorkerUrl = () => {
    const saved = onUpdateCloudApiUrl(workerUrlDraft);
    setWorkerUrlDraft(saved);
    setCloudFeedback({
      ok: true,
      text: saved
        ? `آدرس Cloudflare Worker ذخیره شد: ${saved}`
        : 'آدرس روی سرور پیش‌فرض برنامه تنظیم شد.',
    });
  };

  const handleTestConnection = async () => {
    setTestingConn(true);
    setCloudFeedback(null);
    try {
      const candidate = workerUrlDraft.trim();
      const res = await onTestCloudConnection(candidate);
      setCloudFeedback({ ok: res.ok, text: res.message });
    } finally {
      setTestingConn(false);
    }
  };

  const handleCopyGuideCommands = async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(WORKER_DEPLOY_COMMANDS);
      } else {
        const ta = document.createElement('textarea');
        ta.value = WORKER_DEPLOY_COMMANDS;
        ta.setAttribute('readonly', 'true');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopiedGuide(true);
      window.setTimeout(() => setCopiedGuide(false), 2400);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleDownloadBackup = () => {
    const json = onExportBackup();
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `darsnegar-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setFeedback({ ok: true, text: 'فایل پشتیبان با موفقیت دانلود شد.' });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const result = onImportBackup(text);
    setFeedback({ ok: result.ok, text: result.message });
    e.target.value = '';
  };

  const userInitial = (cloudUser?.name || cloudUser?.email || 'ک').trim().charAt(0).toUpperCase();

  return (
    <div className="space-y-5 max-w-3xl mx-auto min-w-0">
      {/* Cloudflare Account & Cloud Lesson Sync Card */}
      <section className="glass-card-strong p-5 sm:p-7 space-y-5 min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <h1 className="text-xl font-extrabold text-[var(--ink-strong)] flex items-center gap-2">
              <Cloud className="h-5 w-5 text-[var(--blue)] shrink-0" />
              <span>حساب کاربری و اتصال به کلادفلر</span>
            </h1>
            <p className="text-xs text-[var(--muted)] leading-6">
              درس‌ها، فصل‌ها، جزوه‌ها و پیشرفت خود را روی سرور ابری (Cloudflare Worker + D1) ذخیره کنید تا در همه دستگاه‌ها و حتی هنگام قطع اینترنت در دسترس باشد.
            </p>
          </div>
        </div>

        <PWAInstallButton variant="card" />

        {!isOnline && (
          <div className="flex items-center gap-2 rounded-2xl border border-[var(--peach)]/30 bg-[var(--peach-tint)] px-4 py-2.5 text-xs font-semibold text-[var(--peach-ink)]">
            <WifiOff className="h-4 w-4 shrink-0 text-[var(--peach)]" />
            <span>
              در حال حاضر آفلاین هستید. درس‌های ذخیره‌شده بدون اینترنت کار می‌کنند و تغییرات پس از اتصال خودکار ارسال می‌شوند.
            </span>
          </div>
        )}

        {cloudUser ? (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl bg-[var(--sunk)] border border-[var(--line)] p-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-11 w-11 rounded-full bg-[var(--blue-tint)] text-[var(--blue-ink)] font-extrabold text-base flex items-center justify-center shrink-0">
                  {userInitial}
                </div>
                <div className="min-w-0 space-y-0.5">
                  <p className="text-sm font-extrabold text-[var(--ink-strong)] truncate">
                    {cloudUser.name}
                  </p>
                  <p className="text-xs text-[var(--muted)] truncate" dir="ltr">
                    {cloudUser.email}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-[var(--muted)] tabular-nums">
                <span>{toPersianDigits(lessonCount)} درس محلی</span>
                <span aria-hidden="true">·</span>
                <span>آخرین همگام‌سازی: {formatLastSynced(cloudLastSyncedAt)}</span>
                {pendingSyncCount > 0 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-bold text-[var(--peach-ink)]">
                      {toPersianDigits(pendingSyncCount)} تغییر در صف ارسال
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <button
                type="button"
                data-testid="cloud-sync-now-btn"
                disabled={cloudSyncing}
                onClick={() => void handleManualSync()}
                className="btn-primary-glass min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl sm:rounded-full px-4 py-2.5 text-xs sm:text-sm font-bold cursor-pointer whitespace-nowrap disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 shrink-0 ${cloudSyncing ? 'animate-spin' : ''}`} />
                <span>{cloudSyncing ? 'در حال همگام‌سازی...' : 'همگام‌سازی کامل'}</span>
              </button>

              <button
                type="button"
                data-testid="cloud-push-all-btn"
                disabled={cloudSyncing}
                onClick={() => void handlePushAll()}
                className="btn-secondary-glass min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl sm:rounded-full px-4 py-2.5 text-xs sm:text-sm font-semibold cursor-pointer whitespace-nowrap disabled:opacity-60"
              >
                <CloudUpload className="h-4 w-4 shrink-0 text-[var(--blue)]" />
                <span>ارسال همه به کلادفلر</span>
              </button>

              <button
                type="button"
                data-testid="cloud-logout-btn"
                disabled={cloudSyncing}
                onClick={() => {
                  onLogoutFromCloud();
                  setCloudFeedback({ ok: true, text: 'از حساب کاربری ابری خارج شدید.' });
                }}
                className="btn-secondary-glass min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl sm:rounded-full px-4 py-2.5 text-xs sm:text-sm font-semibold text-[var(--danger)] cursor-pointer whitespace-nowrap"
              >
                <LogOut className="h-4 w-4 shrink-0" />
                <span>خروج از حساب</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Login / Register Segmented Tabs */}
            <div
              className="grid grid-cols-2 gap-1.5 rounded-2xl bg-[var(--sunk)] p-1.5"
              role="tablist"
              aria-label="نوع ورود به حساب کلادفلر"
            >
              <button
                type="button"
                role="tab"
                aria-selected={authMode === 'login'}
                data-testid="cloud-tab-login"
                onClick={() => {
                  setAuthMode('login');
                  setCloudFeedback(null);
                }}
                className={`min-h-[42px] rounded-xl px-3 py-2 text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap ${
                  authMode === 'login'
                    ? 'bg-[var(--glass-strong)] text-[var(--blue-ink)] shadow-sm'
                    : 'text-[var(--muted)] hover:text-[var(--ink)]'
                }`}
              >
                ورود به حساب
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={authMode === 'register'}
                data-testid="cloud-tab-register"
                onClick={() => {
                  setAuthMode('register');
                  setCloudFeedback(null);
                }}
                className={`min-h-[42px] rounded-xl px-3 py-2 text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap ${
                  authMode === 'register'
                    ? 'bg-[var(--glass-strong)] text-[var(--blue-ink)] shadow-sm'
                    : 'text-[var(--muted)] hover:text-[var(--ink)]'
                }`}
              >
                ثبت‌نام رایگان
              </button>
            </div>

            <form onSubmit={handleAuthSubmit} className="space-y-3.5" noValidate>
              {/* Hidden honeypot for anti-bot compatibility */}
              <input
                type="text"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
                className="sr-only"
              />

              {authMode === 'register' && (
                <div className="space-y-1.5">
                  <label htmlFor="cloud-auth-name" className="block text-xs font-semibold text-[var(--muted)]">
                    نام نمایشی
                  </label>
                  <div className="relative">
                    <User className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
                    <input
                      id="cloud-auth-name"
                      type="text"
                      value={authName}
                      onChange={(e) => setAuthName(e.target.value)}
                      placeholder="مثال: سارا محمدی"
                      className="glass-field w-full min-h-[46px] py-2.5 pr-10 pl-3.5 text-sm"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="space-y-1.5">
                  <label htmlFor="cloud-auth-email" className="block text-xs font-semibold text-[var(--muted)]">
                    ایمیل *
                  </label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
                    <input
                      id="cloud-auth-email"
                      type="email"
                      dir="ltr"
                      value={authEmail}
                      onChange={(e) => setAuthEmail(e.target.value)}
                      placeholder="name@example.com"
                      className="glass-field w-full min-h-[46px] py-2.5 pr-10 pl-3.5 text-sm"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="cloud-auth-password" className="block text-xs font-semibold text-[var(--muted)]">
                    رمز عبور (حداقل ۶ کاراکتر) *
                  </label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
                    <input
                      id="cloud-auth-password"
                      type={showPassword ? 'text' : 'password'}
                      dir="ltr"
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      placeholder="••••••••"
                      className="glass-field w-full min-h-[46px] py-2.5 pr-10 pl-11 text-sm"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? 'پنهان کردن رمز عبور' : 'نمایش رمز عبور'}
                      className="absolute left-1.5 top-1/2 -translate-y-1/2 min-h-[38px] min-w-[38px] inline-flex items-center justify-center rounded-xl text-[var(--muted)] hover:text-[var(--ink-strong)] cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-1">
                <p className="text-xs text-[var(--muted)]">
                  ثبت‌نام آنی است و نیازی به تایید ایمیل ندارد.
                </p>
                <button
                  type="submit"
                  data-testid="cloud-auth-submit"
                  disabled={authPending}
                  className="btn-primary-glass min-h-[46px] inline-flex items-center justify-center gap-2 rounded-xl sm:rounded-full px-6 py-2.5 text-xs sm:text-sm font-bold cursor-pointer whitespace-nowrap disabled:opacity-60"
                >
                  <CloudUpload className="h-4 w-4 shrink-0" />
                  <span>
                    {authPending
                      ? 'در حال ارتباط با سرور...'
                      : authMode === 'login'
                        ? 'ورود و دریافت درس‌ها'
                        : 'ثبت‌نام و ذخیره در کلادفلر'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        )}

        {cloudFeedback && (
          <p
            role={cloudFeedback.ok ? 'status' : 'alert'}
            data-testid="cloud-feedback"
            className={`rounded-xl px-4 py-2.5 text-xs font-semibold leading-6 ${
              cloudFeedback.ok
                ? 'bg-[var(--ok-tint)] text-[var(--ok-ink)]'
                : 'bg-[var(--danger-tint)] text-[var(--danger)]'
            }`}
          >
            {cloudFeedback.text}
          </p>
        )}

        {/* Advanced: Custom Cloudflare Worker URL & Deployment Guide */}
        <details className="rounded-2xl border border-[var(--line)] bg-[var(--sunk)] p-4">
          <summary className="text-xs sm:text-sm font-bold text-[var(--ink-strong)] cursor-pointer select-none">
            تنظیمات آدرس سرور کلادفلر (Cloudflare Worker URL) و راهنمای استقرار
          </summary>

          <div className="mt-4 space-y-4 pt-3 border-t border-[var(--line)]">
            <div className="space-y-1.5">
              <label htmlFor="cloudflare-worker-url" className="block text-xs font-semibold text-[var(--muted)]">
                آدرس ورکر کلادفلر (اختیاری — در صورت خالی بودن از سرور پیش‌فرض درس‌نگار استفاده می‌شود)
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  id="cloudflare-worker-url"
                  type="url"
                  dir="ltr"
                  value={workerUrlDraft}
                  onChange={(e) => setWorkerUrlDraft(e.target.value)}
                  placeholder="https://darsnegar-api.yourname.workers.dev"
                  className="glass-field flex-1 min-h-[44px] px-3.5 py-2 text-xs sm:text-sm font-mono-code"
                />
                <div className="grid grid-cols-2 sm:flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleSaveWorkerUrl}
                    className="btn-secondary-glass min-h-[44px] rounded-xl sm:rounded-full px-4 py-2 text-xs font-semibold cursor-pointer whitespace-nowrap"
                  >
                    ذخیره آدرس
                  </button>
                  <button
                    type="button"
                    disabled={testingConn}
                    onClick={() => void handleTestConnection()}
                    className="btn-secondary-glass min-h-[44px] rounded-xl sm:rounded-full px-4 py-2 text-xs font-semibold cursor-pointer whitespace-nowrap disabled:opacity-60"
                  >
                    {testingConn ? 'در حال تست...' : 'تست اتصال'}
                  </button>
                </div>
              </div>
              <p className="text-[11.5px] text-[var(--muted)]">
                وضعیت فعلی آدرس:{' '}
                <span className="font-semibold text-[var(--ink-strong)]" dir="ltr">
                  {cloudApiUrl || 'سرور ابری پیش‌فرض برنامه (/api)'}
                </span>
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold text-[var(--ink-strong)]">
                  دستورهای استقرار روی اکانت Cloudflare خودتان (Workers + D1)
                </p>
                <button
                  type="button"
                  onClick={() => void handleCopyGuideCommands()}
                  className="btn-secondary-glass inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold cursor-pointer whitespace-nowrap"
                >
                  {copiedGuide ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-[var(--ok)]" />
                      <span className="text-[var(--ok-ink)]">کپی شد</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>کپی دستورها</span>
                    </>
                  )}
                </button>
              </div>
              <pre
                dir="ltr"
                className="overflow-x-auto rounded-xl bg-[var(--code-bg)] text-[var(--code-ink)] p-3.5 text-[11.5px] leading-6 font-mono-code"
              >
                {WORKER_DEPLOY_COMMANDS}
              </pre>
            </div>
          </div>
        </details>
      </section>

      {/* Appearance & Local Backup Section */}
      <section className="glass-card-strong p-5 sm:p-7 space-y-6">
        <div>
          <h2 className="text-lg sm:text-xl font-extrabold text-[var(--ink-strong)]">
            تنظیمات ظاهر و پشتیبان‌گیری محلی
          </h2>
          <p className="text-xs text-[var(--muted)] mt-1">
            شخصی‌سازی ظاهر شیشه‌ای، اندازه متن درس و مدیریت فایل‌های پشتیبان.
          </p>
        </div>

        {/* Theme Switcher */}
        <div className="space-y-2.5 border-b border-[var(--line)] pb-5">
          <p className="text-sm font-bold text-[var(--ink-strong)]">پوسته ظاهری</p>
          <div className="grid grid-cols-3 gap-2 rounded-2xl bg-[var(--sunk)] p-1.5">
            {(
              [
                { value: 'light', label: 'روشن', Icon: Sun },
                { value: 'dark', label: 'تیره', Icon: Moon },
                { value: 'auto', label: 'خودکار', Icon: Monitor },
              ] as const
            ).map(({ value, label, Icon }) => {
              const active = settings.theme === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => onUpdateSettings({ theme: value as ThemePreference })}
                  aria-pressed={active}
                  className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${
                    active
                      ? 'bg-[var(--glass-strong)] text-[var(--blue-ink)] shadow-sm'
                      : 'text-[var(--muted)] hover:text-[var(--ink)]'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Font Size */}
        <div className="space-y-2.5 border-b border-[var(--line)] pb-5">
          <p className="text-sm font-bold text-[var(--ink-strong)]">اندازه فونت مطالعه درس</p>
          <div className="grid grid-cols-3 gap-2 rounded-2xl bg-[var(--sunk)] p-1.5">
            {(
              [
                { value: 'small', label: 'کوچک' },
                { value: 'medium', label: 'متوسط' },
                { value: 'large', label: 'بزرگ' },
              ] as const
            ).map(({ value, label }) => {
              const active = settings.fontSize === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => onUpdateSettings({ fontSize: value as FontSizePreference })}
                  aria-pressed={active}
                  className={`rounded-xl px-3 py-2.5 text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${
                    active
                      ? 'bg-[var(--glass-strong)] text-[var(--blue-ink)] shadow-sm'
                      : 'text-[var(--muted)] hover:text-[var(--ink)]'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Backup & Restore */}
        <div className="space-y-3 border-b border-[var(--line)] pb-5">
          <p className="text-sm font-bold text-[var(--ink-strong)]">پشتیبان‌گیری و بازیابی فایل</p>
          <p className="text-xs text-[var(--muted)]">
            همه درس‌ها، خلاصه‌ها، سوالات سفارشی و امتیازهای شما را به صورت فایل JSON ذخیره یا بازیابی کنید.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              onClick={handleDownloadBackup}
              className="btn-primary-glass inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-xs sm:text-sm font-semibold cursor-pointer whitespace-nowrap"
            >
              <Download className="h-4 w-4" />
              <span>دانلود نسخه پشتیبان</span>
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="btn-secondary-glass inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-xs sm:text-sm font-semibold cursor-pointer whitespace-nowrap"
            >
              <Upload className="h-4 w-4" />
              <span>بازیابی از فایل JSON</span>
            </button>
          </div>
        </div>

        {/* Reset Actions */}
        <div className="space-y-3">
          <p className="text-sm font-bold text-[var(--ink-strong)]">مدیریت پیشرفت و درس‌های پایه</p>
          <div className="flex flex-wrap items-center gap-3">
            {confirmReset ? (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onResetProgress();
                    setConfirmReset(false);
                    setFeedback({ ok: true, text: 'امتیازها و سوابق آزمون بازنشانی شدند.' });
                  }}
                  className="rounded-full bg-[var(--danger)] px-4 py-2 text-xs font-bold text-white cursor-pointer whitespace-nowrap"
                >
                  تایید پاکسازی پیشرفت
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmReset(false)}
                  className="btn-secondary-glass rounded-full px-4 py-2 text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  انصراف
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                className="btn-secondary-glass inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold text-[var(--danger)] cursor-pointer whitespace-nowrap"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>صفر کردن امتیازها و تاریخچه</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                onRestoreDefaults();
                setFeedback({ ok: true, text: 'درس‌های پیش‌فرض بازیابی شدند.' });
              }}
              className="btn-secondary-glass rounded-full px-4 py-2 text-xs font-semibold cursor-pointer whitespace-nowrap"
            >
              بازیابی درس‌های نمونه اولیه
            </button>
          </div>
        </div>

        {feedback && (
          <p
            role="status"
            className={`rounded-xl px-4 py-2.5 text-xs font-semibold ${
              feedback.ok
                ? 'bg-[var(--ok-tint)] text-[var(--ok-ink)]'
                : 'bg-[var(--danger-tint)] text-[var(--danger)]'
            }`}
          >
            {feedback.text}
          </p>
        )}
      </section>
    </div>
  );
}
