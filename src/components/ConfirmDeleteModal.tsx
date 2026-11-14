import { useEffect, useId, useRef } from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';

interface ConfirmDeleteModalProps {
  open: boolean;
  title: string;
  itemName: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDeleteModal({
  open,
  title,
  itemName,
  description,
  confirmLabel = 'بله، حذف شود',
  cancelLabel = 'انصراف',
  onConfirm,
  onCancel,
}: ConfirmDeleteModalProps) {
  const titleId = useId();
  const descId = useId();
  const cancelBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const timer = window.setTimeout(() => {
      cancelBtnRef.current?.focus();
    }, 0);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      dir="rtl"
      data-testid="confirm-delete-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onCancel();
        }
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-sm p-4"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="glass-card-strong w-full max-w-md p-5 sm:p-6 space-y-5 shadow-2xl border border-[var(--glass-border)]"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--danger-tint)] text-[var(--danger)]">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="space-y-1 min-w-0">
              <h2
                id={titleId}
                className="text-base sm:text-lg font-extrabold text-[var(--ink-strong)] leading-snug"
              >
                {title}
              </h2>
              <p className="text-xs text-[var(--muted)]">
                لطفاً پیش از حذف، از انتخاب خود مطمئن شوید.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onCancel}
            aria-label="بستن پنجره تایید"
            className="rounded-full p-1.5 text-[var(--muted)] hover:text-[var(--ink-strong)] hover:bg-[var(--sunk)] transition-colors cursor-pointer shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-2.5">
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--sunk)] px-4 py-3">
            <p className="text-[11px] font-semibold text-[var(--muted)] mb-1">
              مورد انتخاب‌شده برای حذف:
            </p>
            <p className="text-sm font-extrabold text-[var(--ink-strong)] leading-6 break-words">
              «{itemName}»
            </p>
          </div>

          <p
            id={descId}
            className="text-xs sm:text-sm text-[var(--ink-2)] leading-7"
          >
            {description}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-[var(--line)] pt-4">
          <button
            ref={cancelBtnRef}
            type="button"
            data-testid="confirm-delete-cancel"
            onClick={onCancel}
            className="btn-secondary-glass rounded-full px-5 py-2.5 text-xs sm:text-sm font-semibold cursor-pointer whitespace-nowrap"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            data-testid="confirm-delete-submit"
            onClick={onConfirm}
            className="inline-flex items-center gap-1.5 rounded-full bg-[var(--danger)] px-5 py-2.5 text-xs sm:text-sm font-bold text-white shadow-sm hover:opacity-90 transition-opacity cursor-pointer whitespace-nowrap"
          >
            <Trash2 className="h-4 w-4 shrink-0" />
            <span>{confirmLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
