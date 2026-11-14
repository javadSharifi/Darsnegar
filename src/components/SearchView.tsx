import { useMemo, useState } from 'react';
import { BookOpen, HelpCircle, Search } from 'lucide-react';
import type { Lesson } from '../types/learning';
import {
  getLevelLabel,
  searchLessonsAndQuestions,
  toPersianDigits,
} from '../utils/studyEngine';

interface SearchViewProps {
  lessons: Lesson[];
  onOpenLesson: (lessonId: string) => void;
}

export function SearchView({
  lessons,
  onOpenLesson,
}: SearchViewProps) {
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const categories = useMemo(
    () => ['all', ...Array.from(new Set(lessons.map((l) => l.category)))],
    [lessons]
  );

  const results = useMemo(
    () => searchLessonsAndQuestions(lessons, query, categoryFilter),
    [lessons, query, categoryFilter]
  );

  return (
    <div className="space-y-5">
      <section className="glass-card-strong p-5 sm:p-6 space-y-4">
        <div className="space-y-1">
          <h1 className="text-xl font-extrabold text-[var(--ink-strong)]">
            جستجوی سراسری در درس‌ها و سوالات
          </h1>
          <p className="text-xs text-[var(--muted)]">
            در عنوان، متن درس، خلاصه نکات، کدها و بانک سوالات جستجو کنید.
          </p>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
          <label htmlFor="global-search-input" className="sr-only">
            عبارت جستجو
          </label>
          <input
            id="global-search-input"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="مثلاً: نمره آپگار، دلبستگی، گودمن و گوتلیب، اتیسم..."
            className="glass-field w-full py-3 pr-11 pl-4 text-sm"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              className={`rounded-xl px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                categoryFilter === cat
                  ? 'bg-[var(--blue-tint)] text-[var(--blue-ink)] font-semibold'
                  : 'text-[var(--muted)] hover:bg-[var(--sunk)]'
              }`}
            >
              {cat === 'all' ? 'همه موضوعات' : cat}
            </button>
          ))}
        </div>
      </section>

      <div className="text-xs font-medium text-[var(--muted)] px-1 tabular-nums">
        {toPersianDigits(results.length)} نتیجه یافت شد
      </div>

      {results.length === 0 ? (
        <section className="glass-card p-8 text-center space-y-2">
          <p className="text-base font-bold text-[var(--ink-strong)]">نتیجه‌ای پیدا نشد</p>
          <p className="text-xs text-[var(--muted)]">
            کلیدواژه دیگری را امتحان کنید یا فیلتر موضوع را روی «همه موضوعات» بگذارید.
          </p>
        </section>
      ) : (
        <div className="space-y-3" data-testid="search-results">
          {results.map((item, idx) => (
            <article
              key={`${item.type}-${item.lessonId}-${item.questionId ?? idx}`}
              className="glass-card p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
            >
              <div className="space-y-1.5 min-w-0">
                <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
                  <span className="inline-flex items-center gap-1 font-semibold text-[var(--blue-ink)]">
                    {item.type === 'lesson' ? (
                      <BookOpen className="h-3.5 w-3.5" />
                    ) : (
                      <HelpCircle className="h-3.5 w-3.5" />
                    )}
                    <span>{item.type === 'lesson' ? 'درس' : 'سوال'}</span>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{item.category}</span>
                  <span aria-hidden="true">·</span>
                  <span>{getLevelLabel(item.level)}</span>
                </div>

                <h2 className="text-sm sm:text-base font-bold text-[var(--ink-strong)]">
                  {item.title}
                </h2>
                <p className="text-xs sm:text-sm text-[var(--muted)] line-clamp-2 leading-6">
                  {item.snippet}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => onOpenLesson(item.lessonId)}
                  className="btn-secondary-glass rounded-full px-4 py-2 text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  مطالعه درس
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
