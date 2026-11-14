import { useMemo, useState } from 'react';
import { BookmarkCheck, CheckCircle2, Eye } from 'lucide-react';
import type { Lesson, LessonQuestion, UserQuestionProgress } from '../types/learning';
import { getLevelLabel, toPersianDigits } from '../utils/studyEngine';

interface ReviewQueueProps {
  lessons: Lesson[];
  progress: Record<string, UserQuestionProgress>;
  onMarkKnown: (questionId: string) => void;
}

interface ReviewItem {
  lessonId: string;
  lessonTitle: string;
  category: string;
  question: LessonQuestion;
}

export function ReviewQueue({
  lessons,
  progress,
  onMarkKnown,
}: ReviewQueueProps) {
  const [revealedIds, setRevealedIds] = useState<Record<string, boolean>>({});
  const [filterLessonId, setFilterLessonId] = useState<string>('all');

  const reviewItems = useMemo<ReviewItem[]>(() => {
    const items: ReviewItem[] = [];
    for (const lesson of lessons) {
      if (filterLessonId !== 'all' && lesson.id !== filterLessonId) continue;
      for (const q of lesson.questions) {
        if (progress[q.id]?.state === 'want_to_learn') {
          items.push({
            lessonId: lesson.id,
            lessonTitle: lesson.title,
            category: lesson.category,
            question: q,
          });
        }
      }
    }
    return items;
  }, [lessons, progress, filterLessonId]);

  const toggleReveal = (id: string) => {
    setRevealedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="space-y-5">
      <section className="glass-card p-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-[var(--ink-strong)]">صف مرور و تثبیت</h1>
          <p className="text-xs text-[var(--muted)] mt-1 tabular-nums">
            سوالاتی که با «یاد می‌گیرم» علامت زدید یا در آزمون اشتباه پاسخ دادید ({toPersianDigits(reviewItems.length)} مورد)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            aria-label="فیلتر درس در صف مرور"
            value={filterLessonId}
            onChange={(e) => setFilterLessonId(e.target.value)}
            className="glass-field px-3 py-2 text-xs sm:text-sm"
          >
            <option value="all">همه درس‌ها</option>
            {lessons.map((l) => (
              <option key={l.id} value={l.id}>
                {l.title}
              </option>
            ))}
          </select>
        </div>
      </section>

      {reviewItems.length === 0 ? (
        <section className="glass-card-strong p-8 text-center space-y-2.5">
          <BookmarkCheck className="mx-auto h-10 w-10 text-[var(--ok)]" />
          <h2 className="text-lg font-bold text-[var(--ink-strong)]">
            صف مرور شما کاملاً پاک است
          </h2>
          <p className="mx-auto max-w-md text-sm text-[var(--muted)]">
            در حال حاضر موردی برای مرور ثبت نشده است.
          </p>
        </section>
      ) : (
        <div className="space-y-3.5" data-testid="review-list">
          {reviewItems.map(({ lessonTitle, category, question }) => {
            const isRevealed = Boolean(revealedIds[question.id]);
            return (
              <article
                key={question.id}
                className="glass-card-strong p-5 space-y-3.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--muted)]">
                  <span>
                    {category} · {lessonTitle} · {getLevelLabel(question.level)}
                  </span>
                </div>

                <h2 className="text-base font-bold leading-relaxed text-[var(--ink-strong)]">
                  {question.question}
                </h2>

                {isRevealed && (
                  <div className="rounded-2xl bg-[var(--ok-tint)] p-4 text-sm leading-7 text-[var(--ink)]">
                    {question.answer}
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => toggleReveal(question.id)}
                    className="btn-secondary-glass inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold cursor-pointer whitespace-nowrap"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    <span>{isRevealed ? 'پنهان کردن پاسخ' : 'مشاهده پاسخ'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onMarkKnown(question.id)}
                    className="btn-primary-glass inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold cursor-pointer whitespace-nowrap"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>یاد گرفتم (+۱۰ امتیاز)</span>
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
