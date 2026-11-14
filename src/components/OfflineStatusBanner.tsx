import { CheckCircle2, CloudUpload, RefreshCw, WifiOff, X } from 'lucide-react';
import { toPersianDigits } from '../utils/studyEngine';

export type ReconnectSyncStatus = 'idle' | 'syncing' | 'synced';

interface OfflineStatusBannerProps {
  isOnline: boolean;
  hasCloudAccount: boolean;
  pendingChangesCount: number;
  reconnectSyncStatus: ReconnectSyncStatus;
  onManualRetrySync: () => void;
  onDismissSynced: () => void;
}

export function OfflineStatusBanner({
  isOnline,
  hasCloudAccount,
  pendingChangesCount,
  reconnectSyncStatus,
  onManualRetrySync,
  onDismissSynced,
}: OfflineStatusBannerProps) {
  // 1. Offline State (always prominent top bar)
  if (!isOnline) {
    return (
      <div
        role="status"
        aria-live="polite"
        data-testid="offline-status-banner"
        className="sticky top-0 z-30 border-b border-[var(--peach)]/30 bg-[var(--peach-tint)] backdrop-blur-xl"
      >
        <div className="mx-auto flex max-w-[1160px] flex-wrap items-center justify-between gap-2 px-4 py-2 sm:px-6 text-xs text-[var(--peach-ink)]">
          <div className="flex items-center gap-2 min-w-0">
            <WifiOff className="h-4 w-4 shrink-0 text-[var(--peach)]" aria-hidden="true" />
            <p className="font-bold leading-5">
              شما آنلاین نیستید
              <span className="font-medium opacity-90">
                {' '}
                — درس‌ها بدون اینترنت در دسترس‌اند و تغییرات محلی ذخیره می‌شوند
              </span>
            </p>
          </div>

          {hasCloudAccount && pendingChangesCount > 0 && (
            <span
              data-testid="offline-pending-badge"
              className="inline-flex items-center gap-1.5 rounded-full bg-[var(--glass-strong)] border border-[var(--peach)]/25 px-2.5 py-0.5 text-[11px] font-bold text-[var(--peach-ink)] tabular-nums shrink-0"
            >
              <CloudUpload className="h-3.5 w-3.5 text-[var(--peach)]" aria-hidden="true" />
              <span>{toPersianDigits(pendingChangesCount)} تغییر در صف ارسال خودکار</span>
            </span>
          )}
        </div>
      </div>
    );
  }

  // 2. Reconnected & Actively Pushing Queued Offline Data
  if (reconnectSyncStatus === 'syncing') {
    return (
      <div
        role="status"
        aria-live="polite"
        data-testid="reconnect-syncing-banner"
        className="sticky top-0 z-30 border-b border-[var(--blue)]/25 bg-[var(--blue-tint)] backdrop-blur-xl"
      >
        <div className="mx-auto flex max-w-[1160px] items-center justify-between gap-2 px-4 py-2 sm:px-6 text-xs text-[var(--blue-ink)]">
          <div className="flex items-center gap-2 min-w-0">
            <RefreshCw className="h-4 w-4 shrink-0 animate-spin text-[var(--blue)]" aria-hidden="true" />
            <p className="font-bold leading-5">
              اتصال برقرار شد — در حال ارسال تغییرات آفلاین به کلادفلر...
            </p>
          </div>
          {pendingChangesCount > 0 && (
            <span className="text-[11px] font-semibold tabular-nums shrink-0">
              {toPersianDigits(pendingChangesCount)} مورد
            </span>
          )}
        </div>
      </div>
    );
  }

  // 3. Reconnected & Synced Successfully
  if (reconnectSyncStatus === 'synced') {
    return (
      <div
        role="status"
        aria-live="polite"
        data-testid="reconnect-synced-banner"
        className="sticky top-0 z-30 border-b border-[var(--ok)]/25 bg-[var(--ok-tint)] backdrop-blur-xl"
      >
        <div className="mx-auto flex max-w-[1160px] items-center justify-between gap-2 px-4 py-2 sm:px-6 text-xs text-[var(--ok-ink)]">
          <div className="flex items-center gap-2 min-w-0">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--ok)]" aria-hidden="true" />
            <p className="font-bold leading-5">
              اتصال برقرار شد — تغییرات آفلاین با موفقیت روی کلادفلر ذخیره شد.
            </p>
          </div>
          <button
            type="button"
            onClick={onDismissSynced}
            aria-label="بستن پیام همگام‌سازی"
            className="inline-flex h-6 w-6 items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer shrink-0"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  }

  // 4. Online fallback if queued changes await retry
  if (hasCloudAccount && pendingChangesCount > 0) {
    return (
      <div
        role="status"
        aria-live="polite"
        data-testid="pending-sync-retry-banner"
        className="sticky top-0 z-30 border-b border-[var(--blue)]/25 bg-[var(--blue-tint)] backdrop-blur-xl"
      >
        <div className="mx-auto flex max-w-[1160px] flex-wrap items-center justify-between gap-2 px-4 py-2 sm:px-6 text-xs text-[var(--blue-ink)]">
          <div className="flex items-center gap-2 min-w-0">
            <CloudUpload className="h-4 w-4 shrink-0 text-[var(--blue)]" aria-hidden="true" />
            <p className="font-bold leading-5 tabular-nums">
              {toPersianDigits(pendingChangesCount)} تغییر آفلاین آماده ارسال به کلادفلر است
            </p>
          </div>
          <button
            type="button"
            onClick={onManualRetrySync}
            className="btn-primary-glass rounded-full px-3 py-1 text-[11px] font-bold cursor-pointer whitespace-nowrap"
          >
            ارسال فوری به کلادفلر
          </button>
        </div>
      </div>
    );
  }

  return null;
}
