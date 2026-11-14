import { useState } from 'react';
import { CheckCircle2, Download, Share2, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'button' | 'card' | 'compact-link';
}

export function PWAInstallButton({ variant = 'button' }: PWAInstallButtonProps) {
  const { isInstallable, isInstalled, isIOS, isAndroid, install } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);

  // Installed standalone mode: hide normal install buttons per PWA guidelines
  if (isInstalled) {
    if (variant === 'card') {
      return (
        <div
          data-testid="pwa-installed-status"
          className="flex items-center gap-2 rounded-2xl border border-[var(--ok)]/25 bg-[var(--ok-tint)] px-4 py-3 text-xs font-semibold text-[var(--ok-ink)]"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--ok)]" />
          <span>درس‌نگار به‌عنوان اپلیکیشن (PWA) روی دستگاه شما نصب و فعال است.</span>
        </div>
      );
    }
    return null;
  }

  const handleActionClick = async () => {
    if (isInstallable) {
      await install();
      return;
    }
    setShowGuideModal(true);
  };

  const guideModal = showGuideModal && (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pwa-install-guide-title"
      data-testid="pwa-install-guide-modal"
    >
      <div className="glass-card-strong w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h3
            id="pwa-install-guide-title"
            className="text-base font-extrabold text-[var(--ink-strong)] flex items-center gap-2"
          >
            <Smartphone className="h-4.5 w-4.5 text-[var(--blue)] shrink-0" />
            <span>نصب درس‌نگار روی گوشی (مثل اپلیکیشن)</span>
          </h3>
          <button
            type="button"
            onClick={() => setShowGuideModal(false)}
            aria-label="بستن راهنمای نصب"
            className="btn-secondary-glass rounded-full p-1.5 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 text-xs sm:text-[13px] text-[var(--ink-2)] leading-7">
          {isIOS ? (
            <div className="rounded-2xl bg-[var(--sunk)] p-3.5 space-y-2">
              <p className="font-bold text-[var(--ink-strong)] flex items-center gap-1.5">
                <Share2 className="h-4 w-4 text-[var(--blue)]" />
                <span>آیفون و آیپد (مرورگر Safari):</span>
              </p>
              <ol className="list-decimal pr-5 space-y-1">
                <li>
                  در نوار پایین سافاری روی دکمه <strong>اشتراک‌گذاری (Share)</strong> بزنید.
                </li>
                <li>
                  به پایین اسکرول کرده و گزینه <strong>Add to Home Screen</strong> را بزنید.
                </li>
                <li>
                  در بالا روی <strong>Add</strong> بزنید تا آیکون درس‌نگار به صفحه اصلی گوشی اضافه شود.
                </li>
              </ol>
            </div>
          ) : (
            <>
              <div className="rounded-2xl bg-[var(--sunk)] p-3.5 space-y-2">
                <p className="font-bold text-[var(--ink-strong)]">
                  اندروید (مرورگر Chrome / Edge / Samsung):
                </p>
                <ol className="list-decimal pr-5 space-y-1">
                  <li>
                    روی منوی سه‌نقطه (<strong dir="ltr">⋮</strong>) گوشه بالای مرورگر بزنید.
                  </li>
                  <li>
                    گزینه <strong>Install app</strong> یا <strong>Add to Home screen</strong> را انتخاب کنید.
                  </li>
                  <li>
                    نصب را تایید کنید تا برنامه با آیکون مستقل و پشتیبانی آفلاین روی گوشی نصب شود.
                  </li>
                </ol>
              </div>

              {!isAndroid && (
                <div className="rounded-2xl bg-[var(--sunk)] p-3.5 space-y-1.5">
                  <p className="font-bold text-[var(--ink-strong)]">آیفون و آیپد (Safari):</p>
                  <p>
                    در Safari دکمه <strong>Share</strong> را بزنید و گزینه{' '}
                    <strong>Add to Home Screen</strong> را انتخاب کنید.
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => setShowGuideModal(false)}
          className="btn-primary-glass w-full min-h-[44px] rounded-full text-xs sm:text-sm font-bold cursor-pointer"
        >
          متوجه شدم
        </button>
      </div>
    </div>
  );

  if (variant === 'compact-link') {
    return (
      <>
        <button
          type="button"
          data-testid="library-pwa-install-btn"
          onClick={() => void handleActionClick()}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--purple-ink)] hover:underline cursor-pointer whitespace-nowrap"
        >
          <Smartphone className="h-3.5 w-3.5" />
          <span>{isInstallable ? 'نصب اپلیکیشن' : 'نصب روی گوشی'}</span>
        </button>
        {guideModal}
      </>
    );
  }

  if (variant === 'card') {
    return (
      <>
        <div
          data-testid="pwa-install-card"
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border border-[var(--blue)]/20 bg-[var(--blue-tint)] p-4"
        >
          <div className="flex items-start gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--glass-strong)] text-[var(--blue-ink)] shadow-sm">
              <Smartphone className="h-5 w-5" />
            </div>
            <div className="space-y-0.5 min-w-0">
              <p className="text-sm font-extrabold text-[var(--ink-strong)]">
                نصب درس‌نگار روی گوشی (Android و iOS)
              </p>
              <p className="text-xs text-[var(--muted)] leading-5">
                مثل اپلیکیشن مستقل روی صفحه اصلی گوشی نصب کنید و حتی بدون اینترنت از درس‌ها استفاده کنید.
              </p>
            </div>
          </div>

          <button
            type="button"
            data-testid="settings-pwa-install-btn"
            onClick={() => void handleActionClick()}
            className="btn-primary-glass min-h-[42px] inline-flex items-center justify-center gap-2 rounded-xl sm:rounded-full px-5 py-2 text-xs sm:text-sm font-bold cursor-pointer whitespace-nowrap shrink-0"
          >
            <Download className="h-4 w-4 shrink-0" />
            <span>
              {isInstallable
                ? 'نصب مستقیم برنامه'
                : isIOS
                  ? 'نحوه نصب در آیفون'
                  : 'راهنمای نصب روی گوشی'}
            </span>
          </button>
        </div>
        {guideModal}
      </>
    );
  }

  // Default button variant: auto-show native install if installable or iOS, or guide button
  if (!isInstallable && !isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowGuideModal(true)}
          className="btn-secondary-glass min-h-[42px] inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-xs sm:text-sm font-semibold cursor-pointer whitespace-nowrap"
        >
          <Smartphone className="h-4 w-4 shrink-0 text-[var(--blue)]" />
          <span>نصب روی گوشی</span>
        </button>
        {guideModal}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void handleActionClick()}
        className="btn-primary-glass min-h-[42px] inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-xs sm:text-sm font-bold cursor-pointer whitespace-nowrap"
      >
        <Download className="h-4 w-4 shrink-0" />
        <span>{isInstallable ? 'نصب روی گوشی (PWA)' : 'نصب در آیفون / آیپد'}</span>
      </button>
      {guideModal}
    </>
  );
}
