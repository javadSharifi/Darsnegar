import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarClock,
  Check,
  Clock,
  Cloud,
  CloudUpload,
  Copy,
  FileText,
  FileUp,
  GraduationCap,
  ListTree,
  NotebookPen,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import type {
  ClassNote,
  CloudSyncResult,
  CloudUser,
  ExamAttempt,
  FontSizePreference,
  Lesson,
  LessonViewMode,
  UserQuestionProgress,
} from '../types/learning';
import {
  estimateReadingMinutes,
  extractLessonHeadings,
  formatLessonForClipboard,
  getLessonMasteryStats,
  parseMarkdownFileToLessonParts,
  toPersianDigits,
} from '../utils/studyEngine';
import { LessonContentRenderer } from './LessonContentRenderer';
import { LessonExamPanel } from './LessonExamPanel';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';

type PendingDeleteTarget =
  | { kind: 'lesson'; lesson: Lesson; returnToList: boolean }
  | { kind: 'note'; lessonId: string; note: ClassNote }
  | null;

interface LessonWorkspaceProps {
  lessons: Lesson[];
  activeLessonId: string;
  screenMode: 'list' | 'detail';
  progress: Record<string, UserQuestionProgress>;
  fontSize: FontSizePreference;
  onChangeScreenMode: (mode: 'list' | 'detail') => void;
  onSelectLesson: (lessonId: string) => void;
  onCreateNewLesson: () => void;
  onEditLesson: (lesson: Lesson) => void;
  onDeleteLesson: (lessonId: string) => void;
  onAddQuestionForLesson: (lessonId: string, chapterId?: string) => void;
  onSaveClassNote: (lessonId: string, note: ClassNote) => void;
  onDeleteClassNote: (lessonId: string, noteId: string) => void;
  onSaveCourseOverview: (lessonId: string, courseOverview: string) => void;
  onRecordExam: (attempt: ExamAttempt) => void;
  cloudUser: CloudUser | null;
  cloudSyncing: boolean;
  onSyncWithCloud: () => Promise<CloudSyncResult>;
  onPushLessonToCloud: (lesson: Lesson) => Promise<CloudSyncResult>;
  onOpenCloudSettings: () => void;
}

export function LessonWorkspace({
  lessons,
  activeLessonId,
  screenMode,
  progress,
  fontSize,
  onChangeScreenMode,
  onSelectLesson,
  onCreateNewLesson,
  onEditLesson,
  onDeleteLesson,
  onAddQuestionForLesson,
  onSaveClassNote,
  onDeleteClassNote,
  onSaveCourseOverview,
  onRecordExam,
  cloudUser,
  cloudSyncing,
  onSyncWithCloud,
  onPushLessonToCloud,
  onOpenCloudSettings,
}: LessonWorkspaceProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [listSearchQuery, setListSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<LessonViewMode>('text');
  const [selectedChapterId, setSelectedChapterId] = useState<string | 'all'>('all');
  const [pendingDelete, setPendingDelete] = useState<PendingDeleteTarget>(null);
  const [copiedScope, setCopiedScope] = useState<'all' | 'lesson' | null>(null);
  const [activeHeadingId, setActiveHeadingId] = useState<string>('');
  const [cloudNotice, setCloudNotice] = useState<{ ok: boolean; text: string } | null>(null);

  // General Course Overview Textarea State (midterm dates, instructor notes, syllabus...)
  const [overviewDraft, setOverviewDraft] = useState('');
  const [overviewSaved, setOverviewSaved] = useState(false);

  // Class Notes Composer State
  const [noteComposerOpen, setNoteComposerOpen] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [noteChapterId, setNoteChapterId] = useState<string>('');
  const [noteError, setNoteError] = useState('');

  const handleCopyText = async (text: string, scope: 'all' | 'lesson') => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', 'true');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopiedScope(scope);
      window.setTimeout(() => {
        setCopiedScope((prev) => (prev === scope ? null : prev));
      }, 2400);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', 'true');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopiedScope(scope);
      window.setTimeout(() => {
        setCopiedScope((prev) => (prev === scope ? null : prev));
      }, 2400);
    }
  };

  const categories = useMemo(() => {
    const unique = Array.from(new Set(lessons.map((l) => l.category)));
    return ['all', ...unique];
  }, [lessons]);

  const filteredLessons = useMemo(() => {
    const q = listSearchQuery.trim().toLowerCase();
    return lessons.filter((l) => {
      if (selectedCategory !== 'all' && l.category !== selectedCategory) return false;
      if (!q) return true;
      return (
        l.title.toLowerCase().includes(q) ||
        l.category.toLowerCase().includes(q) ||
        l.summary.toLowerCase().includes(q) ||
        l.content.toLowerCase().includes(q)
      );
    });
  }, [lessons, selectedCategory, listSearchQuery]);

  const activeLesson = useMemo(
    () => lessons.find((l) => l.id === activeLessonId) ?? lessons[0] ?? null,
    [lessons, activeLessonId]
  );

  const libraryTotals = useMemo(() => {
    let notes = 0;
    let minutes = 0;
    for (const l of lessons) {
      notes += l.classNotes?.length ?? 0;
      minutes += estimateReadingMinutes(l.content);
    }
    return { notes, minutes };
  }, [lessons]);

  // Reset per-lesson UI state whenever activeLesson changes
  useEffect(() => {
    setSelectedChapterId('all');
    setViewMode('text');
    setActiveHeadingId('');
    setPendingDelete(null);
    setOverviewDraft(activeLesson?.courseOverview ?? '');
    setOverviewSaved(false);
    setNoteComposerOpen(false);
    setEditingNoteId(null);
    setNoteTitle('');
    setNoteContent('');
    setNoteError('');
  }, [activeLesson?.id]);

  // Keep draft synced if lesson overview was updated via LessonBuilder edit
  useEffect(() => {
    setOverviewDraft(activeLesson?.courseOverview ?? '');
  }, [activeLesson?.courseOverview]);

  // Auto-save course overview after typing pauses
  useEffect(() => {
    if (!activeLesson) return;
    const persisted = activeLesson.courseOverview ?? '';
    if (overviewDraft === persisted) return;

    const timer = window.setTimeout(() => {
      onSaveCourseOverview(activeLesson.id, overviewDraft);
      setOverviewSaved(true);
      window.setTimeout(() => setOverviewSaved(false), 2000);
    }, 550);

    return () => window.clearTimeout(timer);
  }, [overviewDraft, activeLesson, onSaveCourseOverview]);

  const handleImmediateSaveOverview = () => {
    if (!activeLesson) return;
    if (overviewDraft === (activeLesson.courseOverview ?? '')) return;
    onSaveCourseOverview(activeLesson.id, overviewDraft);
    setOverviewSaved(true);
    window.setTimeout(() => setOverviewSaved(false), 2000);
  };

  const lessonChapters = activeLesson?.chapters ?? [];
  const hasMultipleChapters = lessonChapters.length > 1;

  const activeChapter = useMemo(() => {
    if (!activeLesson || selectedChapterId === 'all') return null;
    return lessonChapters.find((c) => c.id === selectedChapterId) ?? null;
  }, [activeLesson, lessonChapters, selectedChapterId]);

  const displayedContent = useMemo(() => {
    if (!activeLesson) return '';
    if (activeChapter) return activeChapter.content;
    return activeLesson.content;
  }, [activeLesson, activeChapter]);

  const displayedOutline = useMemo(
    () => extractLessonHeadings(displayedContent, 'lesson-sec'),
    [displayedContent]
  );

  const displayedReadingMinutes = useMemo(
    () => estimateReadingMinutes(displayedContent),
    [displayedContent]
  );

  const visibleClassNotes = useMemo(() => {
    const notes = activeLesson?.classNotes ?? [];
    if (!activeChapter) return notes;
    return notes.filter((n) => !n.chapterId || n.chapterId === activeChapter.id);
  }, [activeLesson?.classNotes, activeChapter]);

  const activeMastery = useMemo(
    () => (activeLesson ? getLessonMasteryStats(activeLesson, progress) : null),
    [activeLesson, progress]
  );

  const openLessonDetail = (lessonId: string, targetMode: LessonViewMode = 'text') => {
    onSelectLesson(lessonId);
    setViewMode(targetMode);
    onChangeScreenMode('detail');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const scrollToSection = (headingId: string) => {
    setActiveHeadingId(headingId);
    const el = document.getElementById(headingId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const openNewNoteComposer = (scrollToForm = false) => {
    setEditingNoteId(null);
    setNoteTitle('');
    setNoteContent('');
    setNoteChapterId(activeChapter?.id ?? '');
    setNoteError('');
    setNoteComposerOpen(true);
    if (scrollToForm) {
      window.setTimeout(() => {
        document
          .querySelector('[data-testid="class-notes-section"]')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 40);
    }
  };

  const openEditNoteComposer = (note: ClassNote) => {
    setEditingNoteId(note.id);
    setNoteTitle(note.title);
    setNoteContent(note.content);
    setNoteChapterId(note.chapterId ?? '');
    setNoteError('');
    setNoteComposerOpen(true);
  };

  const handleNoteMarkdownUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const raw = typeof reader.result === 'string' ? reader.result : '';
      const parsed = parseMarkdownFileToLessonParts(raw);
      if (!noteTitle.trim() && parsed.suggestedTitle) {
        setNoteTitle(parsed.suggestedTitle);
      }
      setNoteContent(parsed.content);
      setNoteError('');
    };
    reader.readAsText(file, 'utf-8');
    e.target.value = '';
  };

  const handleSaveNoteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeLesson) return;
    setNoteError('');

    if (!noteContent.trim()) {
      setNoteError('لطفاً متن جزوه یا نکته استاد را وارد کنید.');
      return;
    }

    const existingNote = editingNoteId
      ? (activeLesson.classNotes ?? []).find((n) => n.id === editingNoteId)
      : undefined;

    const chosenChapter = lessonChapters.find((c) => c.id === noteChapterId);
    const now = Date.now();
    const todayFa = new Intl.DateTimeFormat('fa-IR', {
      month: 'long',
      day: 'numeric',
    }).format(new Date());

    onSaveClassNote(activeLesson.id, {
      id: editingNoteId || `note-${now}`,
      title: noteTitle.trim() || `جزوه سر کلاس (${todayFa})`,
      content: noteContent.trim(),
      chapterId: chosenChapter?.id,
      chapterTitle: chosenChapter?.title,
      createdAt: existingNote?.createdAt ?? now,
      updatedAt: now,
    });

    setNoteComposerOpen(false);
    setEditingNoteId(null);
    setNoteTitle('');
    setNoteContent('');
  };

  if (lessons.length === 0) {
    return (
      <section className="glass-card-strong p-10 text-center space-y-4">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--blue-tint)] text-[var(--blue-ink)]">
          <BookOpen className="h-7 w-7" />
        </div>
        <div className="space-y-1.5">
          <h1 className="text-xl font-extrabold text-[var(--ink-strong)]">
            هنوز درسی اضافه نشده است
          </h1>
          <p className="mx-auto max-w-md text-sm text-[var(--muted)] leading-7">
            اولین درس خود را همراه با متن فصل‌ها، جزوه سر کلاس، خلاصه و سوالات امتحانی بسازید.
          </p>
        </div>
        <button
          type="button"
          onClick={onCreateNewLesson}
          className="btn-primary-glass inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold cursor-pointer whitespace-nowrap"
        >
          <Plus className="h-4 w-4" />
          <span>افزودن اولین درس</span>
        </button>
      </section>
    );
  }

  const handleConfirmPendingDelete = () => {
    if (!pendingDelete) return;
    if (pendingDelete.kind === 'lesson') {
      onDeleteLesson(pendingDelete.lesson.id);
      if (pendingDelete.returnToList) {
        onChangeScreenMode('list');
      }
    } else {
      onDeleteClassNote(pendingDelete.lessonId, pendingDelete.note.id);
    }
    setPendingDelete(null);
  };

  const getDeleteModalCopy = () => {
    if (!pendingDelete) {
      return { title: '', itemName: '', description: '', confirmLabel: 'بله، حذف شود' };
    }
    if (pendingDelete.kind === 'lesson') {
      const chCount = pendingDelete.lesson.chapters?.length ?? 0;
      const notesCount = pendingDelete.lesson.classNotes?.length ?? 0;
      const qCount = pendingDelete.lesson.questions.length;
      const parts: string[] = [];
      if (chCount > 1) parts.push(`${toPersianDigits(chCount)} فصل`);
      if (notesCount > 0) parts.push(`${toPersianDigits(notesCount)} جزوه سر کلاس`);
      if (qCount > 0) parts.push(`${toPersianDigits(qCount)} سوال`);
      const details = parts.length > 0 ? ` شامل ${parts.join('، ')}` : '';
      return {
        title: 'تایید حذف درس',
        itemName: pendingDelete.lesson.title,
        description: `با تایید حذف، این درس${details} به‌طور دائمی پاک می‌شود و امکان بازگردانی آن وجود ندارد.`,
        confirmLabel: 'بله، درس حذف شود',
      };
    }
    return {
      title: 'تایید حذف جزوه سر کلاس',
      itemName: pendingDelete.note.title,
      description: pendingDelete.note.chapterTitle
        ? `این جزوه سر کلاس از «${pendingDelete.note.chapterTitle}» به‌صورت دائمی حذف می‌شود و قابل بازگردانی نیست.`
        : 'این جزوه سر کلاس به‌صورت دائمی حذف می‌شود و قابل بازگردانی نیست.',
      confirmLabel: 'بله، جزوه حذف شود',
    };
  };

  const modalCopy = getDeleteModalCopy();
  const confirmModal = (
    <ConfirmDeleteModal
      open={Boolean(pendingDelete)}
      title={modalCopy.title}
      itemName={modalCopy.itemName}
      description={modalCopy.description}
      confirmLabel={modalCopy.confirmLabel}
      onConfirm={handleConfirmPendingDelete}
      onCancel={() => setPendingDelete(null)}
    />
  );

  /* =========================================================
     Screen Mode A: Refined Editorial Library & Lessons Directory
     ========================================================= */
  if (screenMode === 'list' || !activeLesson) {
    const isFiltering = Boolean(listSearchQuery.trim()) || selectedCategory !== 'all';

    return (
      <div className="space-y-6">
        {/* Unboxed Editorial Masthead + Streamlined Search & Category Tabs */}
        <section className="space-y-4 pt-1">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="space-y-1">
              <h1 className="text-2xl sm:text-[28px] font-extrabold tracking-tight text-[var(--ink-strong)]">
                کتابخانه درس‌های من
              </h1>
              <p className="text-xs sm:text-sm text-[var(--muted)] tabular-nums flex flex-wrap items-center gap-2">
                <span>{toPersianDigits(lessons.length)} درس</span>
                <span aria-hidden="true">·</span>
                <span>{toPersianDigits(libraryTotals.notes)} جزوه سر کلاس</span>
                <span aria-hidden="true">·</span>
                <span>{toPersianDigits(libraryTotals.minutes)} دقیقه مطالعه کل</span>
              </p>
            </div>

            <div className="relative w-full md:w-80 shrink-0">
              <Search className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
              <label htmlFor="lessons-directory-search" className="sr-only">
                جستجو در فهرست درس‌ها
              </label>
              <input
                id="lessons-directory-search"
                type="search"
                value={listSearchQuery}
                onChange={(e) => setListSearchQuery(e.target.value)}
                placeholder="جستجو در عنوان، موضوع یا متن درس..."
                className="glass-field w-full py-2.5 pr-10 pl-9 text-sm"
              />
              {listSearchQuery && (
                <button
                  type="button"
                  onClick={() => setListSearchQuery('')}
                  aria-label="پاک کردن جستجو"
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--ink-strong)] cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          <div
            className="flex items-center gap-1.5 overflow-x-auto border-b border-[var(--line)] pb-3.5"
            aria-label="فیلتر موضوع درس‌ها"
          >
            {categories.map((cat) => {
              const isSelected = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`rounded-xl px-3 py-1.5 text-xs sm:text-[13px] transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                    isSelected
                      ? 'bg-[var(--glass-strong)] text-[var(--blue-ink)] font-bold shadow-sm border border-[var(--glass-border)]'
                      : 'text-[var(--muted)] hover:text-[var(--ink-strong)] hover:bg-[var(--glass)] border border-transparent font-medium'
                  }`}
                >
                  {cat === 'all' ? 'همه موضوعات' : cat}
                </button>
              );
            })}
          </div>
        </section>

        {/* All Lessons Collection */}
        <section className="space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <h2 className="text-sm font-bold text-[var(--ink-2)] tabular-nums">
              {isFiltering
                ? `نتایج (${toPersianDigits(filteredLessons.length)} درس)`
                : `همه درس‌ها (${toPersianDigits(filteredLessons.length)})`}
            </h2>
            <div className="flex flex-wrap items-center gap-3">
              {cloudUser ? (
                <button
                  type="button"
                  data-testid="library-cloud-sync-btn"
                  disabled={cloudSyncing}
                  onClick={async () => {
                    const res = await onSyncWithCloud();
                    setCloudNotice({ ok: res.ok, text: res.message });
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--ok-ink)] hover:underline cursor-pointer whitespace-nowrap disabled:opacity-60"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${cloudSyncing ? 'animate-spin' : ''}`} />
                  <span>{cloudSyncing ? 'در حال همگام‌سازی...' : 'همگام‌سازی کلادفلر'}</span>
                </button>
              ) : (
                <button
                  type="button"
                  data-testid="library-cloud-connect-btn"
                  onClick={onOpenCloudSettings}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--muted)] hover:text-[var(--blue-ink)] hover:underline cursor-pointer whitespace-nowrap"
                >
                  <Cloud className="h-3.5 w-3.5" />
                  <span>اتصال به کلادفلر</span>
                </button>
              )}

              <button
                type="button"
                onClick={onCreateNewLesson}
                className="inline-flex items-center gap-1 text-xs font-bold text-[var(--blue-ink)] hover:underline cursor-pointer whitespace-nowrap"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>افزودن درس جدید</span>
              </button>
            </div>
          </div>

          {cloudNotice && (
            <p
              role={cloudNotice.ok ? 'status' : 'alert'}
              className={`rounded-xl px-4 py-2 text-xs font-semibold ${
                cloudNotice.ok
                  ? 'bg-[var(--ok-tint)] text-[var(--ok-ink)]'
                  : 'bg-[var(--danger-tint)] text-[var(--danger)]'
              }`}
            >
              {cloudNotice.text}
            </p>
          )}

          {filteredLessons.length === 0 ? (
            <div className="glass-card p-9 text-center space-y-2.5">
              <p className="text-base font-bold text-[var(--ink-strong)]">
                درسی با این فیلتر پیدا نشد
              </p>
              <p className="text-xs sm:text-sm text-[var(--muted)]">
                عبارت جستجو را تغییر دهید یا موضوع را روی «همه موضوعات» بگذارید.
              </p>
              <button
                type="button"
                onClick={() => {
                  setListSearchQuery('');
                  setSelectedCategory('all');
                }}
                className="btn-secondary-glass mt-2 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold cursor-pointer"
              >
                نمایش همه درس‌ها
              </button>
            </div>
          ) : (
            <div
              className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
              data-testid="lesson-list"
            >
              {filteredLessons.map((lesson, idx) => {
                const isCurrent = activeLesson?.id === lesson.id;
                const stats = getLessonMasteryStats(lesson, progress);
                const chCount = lesson.chapters?.length ?? 0;
                const notesCount = lesson.classNotes?.length ?? 0;
                const readingMins = estimateReadingMinutes(lesson.content);
                const topicHeadings = extractLessonHeadings(lesson.content).slice(0, 2);

                return (
                  <article
                    key={lesson.id}
                    className={`lesson-card-surface p-5 sm:p-6 flex flex-col justify-between gap-4 ${
                      isCurrent ? 'ring-1 ring-[var(--blue)]/45' : ''
                    }`}
                  >
                    <div className="flex-1 flex flex-col justify-between gap-3">
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between gap-2 text-xs text-[var(--muted)]">
                          <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                            <span className="font-extrabold text-[var(--blue)] tabular-nums">
                              {toPersianDigits(String(idx + 1).padStart(2, '0'))}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="font-semibold text-[var(--blue-ink)] truncate">
                              {lesson.category}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="tabular-nums whitespace-nowrap">
                              {toPersianDigits(readingMins)} دقیقه
                            </span>
                          </div>

                          {isCurrent && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--blue-ink)] shrink-0">
                              <span
                                className="h-1.5 w-1.5 rounded-full bg-[var(--blue)]"
                                aria-hidden="true"
                              />
                              فعال
                            </span>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => openLessonDetail(lesson.id, 'text')}
                          className="text-right cursor-pointer group block w-full"
                        >
                          <h3 className="text-[16.5px] sm:text-[17.5px] font-extrabold text-[var(--ink-strong)] leading-7 md:min-h-[3.5rem] line-clamp-2 group-hover:text-[var(--blue-ink)] transition-colors">
                            {lesson.title}
                          </h3>
                        </button>

                        <p className="text-[13px] sm:text-[13.5px] text-[var(--muted)] leading-6 line-clamp-3">
                          {lesson.summary || 'متن کامل و جزوه این درس را باز کنید.'}
                        </p>
                      </div>

                      <div className="space-y-2 pt-1">
                        {topicHeadings.length > 0 && (
                          <p className="text-[11.5px] text-[var(--faint)] truncate">
                            مباحث: {topicHeadings.map((h) => h.text).join(' · ')}
                          </p>
                        )}

                        <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-[var(--muted)] tabular-nums">
                          {chCount > 1 && <span>{toPersianDigits(chCount)} فصل</span>}
                          {chCount > 1 && <span aria-hidden="true">·</span>}
                          {notesCount > 0 && (
                            <>
                              <span className="font-semibold text-[var(--purple-ink)]">
                                {toPersianDigits(notesCount)} جزوه
                              </span>
                              <span aria-hidden="true">·</span>
                            </>
                          )}
                          <span>
                            {lesson.questions.length > 0
                              ? `${toPersianDigits(lesson.questions.length)} سوال`
                              : 'متن و خلاصه'}
                          </span>
                        </div>

                        {lesson.questions.length > 0 && (
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--sunk-2)]">
                              <div
                                className="h-full rounded-full bg-[var(--blue)] transition-all duration-300"
                                style={{ width: `${stats.percent}%` }}
                              />
                            </div>
                            <span className="text-[11px] font-medium text-[var(--muted)] tabular-nums">
                              {toPersianDigits(stats.percent)}٪
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 border-t border-[var(--line)] pt-3.5">
                      <button
                        type="button"
                        onClick={() => openLessonDetail(lesson.id, 'text')}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--blue-tint)] px-3.5 py-2 text-xs font-bold text-[var(--blue-ink)] hover:bg-[var(--blue)] hover:text-white transition-colors cursor-pointer whitespace-nowrap"
                      >
                        <span>مطالعه و جزوه</span>
                        <ArrowLeft className="h-3.5 w-3.5" />
                      </button>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onEditLesson(lesson)}
                          aria-label={`ویرایش ${lesson.title}`}
                          className="btn-secondary-glass inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold cursor-pointer whitespace-nowrap"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          <span>ویرایش</span>
                        </button>

                        {lessons.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              setPendingDelete({
                                kind: 'lesson',
                                lesson,
                                returnToList: false,
                              })
                            }
                            aria-label={`حذف ${lesson.title}`}
                            className="btn-secondary-glass inline-flex items-center justify-center rounded-xl p-2 text-[var(--danger)] cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
        {confirmModal}
      </div>
    );
  }

  /* =========================================================
     Screen Mode B: Two-Zone Editorial Reader + Study Companion
     ========================================================= */
  return (
    <div className="space-y-5 min-w-0" data-testid="active-lesson-panel">
      {/* Unboxed Top Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 min-w-0">
        <button
          type="button"
          onClick={() => {
            setPendingDelete(null);
            onChangeScreenMode('list');
          }}
          className="btn-secondary-glass inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold cursor-pointer whitespace-nowrap"
        >
          <ArrowRight className="h-3.5 w-3.5" />
          <span>بازگشت به فهرست درس‌ها</span>
        </button>

        <div className="flex flex-wrap items-center gap-2 min-w-0 max-w-full">
          <button
            type="button"
            data-testid="push-lesson-cloud-btn"
            disabled={cloudSyncing}
            onClick={async () => {
              if (!cloudUser) {
                onOpenCloudSettings();
                return;
              }
              const res = await onPushLessonToCloud(activeLesson);
              setCloudNotice({ ok: res.ok, text: res.message });
            }}
            className="btn-secondary-glass inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold cursor-pointer whitespace-nowrap disabled:opacity-60"
          >
            <CloudUpload className="h-3.5 w-3.5 text-[var(--blue)]" />
            <span>{cloudUser ? 'ارسال به کلادفلر' : 'ذخیره در کلادفلر'}</span>
          </button>

          <button
            type="button"
            data-testid="copy-lesson-btn"
            onClick={() => handleCopyText(formatLessonForClipboard(activeLesson), 'lesson')}
            className="btn-secondary-glass inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold cursor-pointer whitespace-nowrap"
          >
            {copiedScope === 'lesson' ? (
              <>
                <Check className="h-3.5 w-3.5 text-[var(--ok)]" />
                <span className="text-[var(--ok-ink)]">کپی شد</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                <span>کپی کل درس و جزوه</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => onEditLesson(activeLesson)}
            aria-label={`ویرایش درس ${activeLesson.title}`}
            className="btn-secondary-glass inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold cursor-pointer whitespace-nowrap"
          >
            <Pencil className="h-3.5 w-3.5" />
            <span>ویرایش درس</span>
          </button>

          {lessons.length > 1 && (
            <button
              type="button"
              onClick={() =>
                setPendingDelete({
                  kind: 'lesson',
                  lesson: activeLesson,
                  returnToList: true,
                })
              }
              aria-label={`حذف درس ${activeLesson.title}`}
              className="btn-secondary-glass inline-flex items-center justify-center rounded-full p-2.5 text-[var(--danger)] cursor-pointer"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {cloudNotice && (
        <p
          role={cloudNotice.ok ? 'status' : 'alert'}
          className={`rounded-xl px-4 py-2.5 text-xs font-semibold ${
            cloudNotice.ok
              ? 'bg-[var(--ok-tint)] text-[var(--ok-ink)]'
              : 'bg-[var(--danger-tint)] text-[var(--danger)]'
          }`}
        >
          {cloudNotice.text}
        </p>
      )}

      {/* Lesson Masthead & Navigation Tabs */}
      <section className="glass-card-strong p-5 sm:p-7 space-y-5">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
            <span className="font-bold text-[var(--blue-ink)]">{activeLesson.category}</span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Clock className="h-3.5 w-3.5" />
              حدود {toPersianDigits(displayedReadingMinutes)} دقیقه مطالعه
            </span>
            {lessonChapters.length > 1 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">{toPersianDigits(lessonChapters.length)} فصل</span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">
              {toPersianDigits((activeLesson.classNotes ?? []).length)} جزوه سر کلاس
            </span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">
              {activeLesson.questions.length > 0
                ? `${toPersianDigits(activeLesson.questions.length)} سوال`
                : 'فقط متن و خلاصه'}
            </span>
            {activeMastery && activeLesson.questions.length > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums font-semibold text-[var(--ok-ink)]">
                  تسلط {toPersianDigits(activeMastery.percent)}٪
                </span>
              </>
            )}
          </div>
          <h1 className="text-xl sm:text-[26px] font-extrabold text-[var(--ink-strong)] leading-snug">
            {activeLesson.title}
          </h1>
        </div>

        {/* Optional Chapter Switcher */}
        {hasMultipleChapters && (
          <div className="flex flex-wrap items-center gap-1.5" aria-label="فصل‌های درس">
            <button
              type="button"
              onClick={() => setSelectedChapterId('all')}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                selectedChapterId === 'all'
                  ? 'bg-[var(--blue-tint)] text-[var(--blue-ink)]'
                  : 'bg-[var(--sunk)] text-[var(--muted)] hover:text-[var(--ink)]'
              }`}
            >
              همه فصل‌ها ({toPersianDigits(lessonChapters.length)})
            </button>
            {lessonChapters.map((ch) => {
              const isSelected = selectedChapterId === ch.id;
              return (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => setSelectedChapterId(ch.id)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    isSelected
                      ? 'bg-[var(--blue-tint)] text-[var(--blue-ink)]'
                      : 'bg-[var(--sunk)] text-[var(--muted)] hover:text-[var(--ink)]'
                  }`}
                >
                  {ch.title}
                  {ch.questions.length > 0 ? ` (${toPersianDigits(ch.questions.length)})` : ''}
                </button>
              );
            })}
          </div>
        )}

        {/* 3-Mode Segmented Control: Text & Notes | Summary | Exam & Questions */}
        <div
          role="tablist"
          aria-label="بخش‌های درس"
          className="grid grid-cols-3 gap-1.5 rounded-2xl bg-[var(--sunk)] p-1.5"
        >
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'text'}
            onClick={() => setViewMode('text')}
            className={`flex items-center justify-center gap-1.5 sm:gap-2 rounded-xl px-2 sm:px-3 py-2.5 text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${
              viewMode === 'text'
                ? 'bg-[var(--glass-strong)] text-[var(--blue-ink)] shadow-sm'
                : 'text-[var(--muted)] hover:text-[var(--ink)]'
            }`}
          >
            <BookOpen className="h-4 w-4 shrink-0" />
            <span>متن درس و جزوه</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={viewMode === 'summary'}
            onClick={() => setViewMode('summary')}
            className={`flex items-center justify-center gap-1.5 sm:gap-2 rounded-xl px-2 sm:px-3 py-2.5 text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${
              viewMode === 'summary'
                ? 'bg-[var(--glass-strong)] text-[var(--blue-ink)] shadow-sm'
                : 'text-[var(--muted)] hover:text-[var(--ink)]'
            }`}
          >
            <FileText className="h-4 w-4 shrink-0" />
            <span>خلاصه درس</span>
          </button>

          <button
            type="button"
            role="tab"
            data-testid="lesson-exam-tab"
            aria-selected={viewMode === 'exam'}
            onClick={() => setViewMode('exam')}
            className={`flex items-center justify-center gap-1.5 sm:gap-2 rounded-xl px-2 sm:px-3 py-2.5 text-xs sm:text-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${
              viewMode === 'exam'
                ? 'bg-[var(--glass-strong)] text-[var(--blue-ink)] shadow-sm'
                : 'text-[var(--muted)] hover:text-[var(--ink)]'
            }`}
          >
            <GraduationCap className="h-4 w-4 shrink-0" />
            <span>
              آزمون و سوالات
              {activeLesson.questions.length > 0
                ? ` (${toPersianDigits(activeLesson.questions.length)})`
                : ''}
            </span>
          </button>
        </div>
      </section>

      {/* General Course Overview Textarea Card (Midterm date, instructor info, general notes) */}
      <section
        aria-label="توضیحات کلی درباره درس"
        data-testid="course-overview-card"
        className="glass-card p-4 sm:p-5 space-y-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-[var(--blue)] shrink-0" />
            <label
              htmlFor="course-overview-textarea"
              className="text-sm font-bold text-[var(--ink-strong)]"
            >
              توضیحات کلی درباره درس
            </label>
            <span className="hidden sm:inline text-xs text-[var(--muted)]">
              (تاریخ میان‌ترم، پایان‌ترم، نام استاد، بارم‌بندی و...)
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {overviewSaved && (
              <span
                role="status"
                className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--ok-ink)]"
              >
                <Check className="h-3.5 w-3.5" />
                <span>ذخیره شد</span>
              </span>
            )}
            {overviewDraft !== (activeLesson.courseOverview ?? '') && (
              <button
                type="button"
                data-testid="save-course-overview-btn"
                onClick={handleImmediateSaveOverview}
                className="btn-primary-glass inline-flex items-center gap-1 rounded-full px-3.5 py-1.5 text-xs font-bold cursor-pointer whitespace-nowrap"
              >
                <Save className="h-3.5 w-3.5" />
                <span>ذخیره توضیحات</span>
              </button>
            )}
          </div>
        </div>

        <textarea
          id="course-overview-textarea"
          data-testid="course-overview-textarea"
          rows={2}
          value={overviewDraft}
          onChange={(e) => setOverviewDraft(e.target.value)}
          onBlur={handleImmediateSaveOverview}
          placeholder="مثلاً: تاریخ میان‌ترم ۲۵ آذر ساعت ۱۰ (فصل‌های ۱ تا ۳) — استاد دکتر ... — پروژه کلاسی ۴ نمره..."
          className="glass-field w-full p-3 text-xs sm:text-sm leading-7"
        />
      </section>

      {/* Mode 1: Two-Zone Textbook Prose + Companion Outline + Class Notes */}
      {viewMode === 'text' && (
        <div
          className={
            displayedOutline.length > 0
              ? 'grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px] gap-5 items-start'
              : 'space-y-6'
          }
        >
          {/* Main Reading Sheet */}
          <article className="glass-card-strong p-6 sm:p-9 space-y-9">
            <div className="max-w-[72ch] mx-auto space-y-5">
              {activeChapter && (
                <div className="rounded-2xl bg-[var(--blue-tint)] px-4 py-2.5 text-sm font-bold text-[var(--blue-ink)]">
                  {activeChapter.title}
                </div>
              )}

              <LessonContentRenderer
                content={displayedContent}
                fontSize={fontSize}
                headingIdPrefix="lesson-sec"
              />
            </div>

            {/* Classroom Lecture Notes ("جزوه سر کلاس و نکات استاد") directly beneath textbook prose */}
            <section
              aria-label="جزوه سر کلاس و نکات استاد"
              data-testid="class-notes-section"
              className="max-w-[72ch] mx-auto border-t border-[var(--line)] pt-7 space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--purple-tint)] text-[var(--purple-ink)]">
                    <NotebookPen className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-base sm:text-lg font-extrabold text-[var(--ink-strong)]">
                      جزوه سر کلاس و نکات استاد ({toPersianDigits(visibleClassNotes.length)})
                    </h2>
                    <p className="text-xs text-[var(--muted)] mt-0.5 leading-5">
                      مباحث تکمیلی و نکاتی که استاد سر کلاس خارج از متن کتاب می‌گوید را اینجا یادداشت کنید تا همیشه زیر متن کتاب همراهتان باشد.
                    </p>
                  </div>
                </div>

                {!noteComposerOpen && (
                  <button
                    type="button"
                    onClick={() => openNewNoteComposer(false)}
                    className="btn-primary-glass inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>افزودن جزوه سر کلاس</span>
                  </button>
                )}
              </div>

              {/* Inline Live Class Note Composer */}
              {noteComposerOpen && (
                <form
                  onSubmit={handleSaveNoteSubmit}
                  data-testid="class-note-form"
                  className="rounded-[22px] border border-[var(--blue)] bg-[var(--sunk)] p-4 sm:p-5 space-y-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-[var(--ink-strong)]">
                      {editingNoteId ? 'ویرایش جزوه سر کلاس' : 'ثبت جزوه جدید سر کلاس'}
                    </h3>
                    <label className="btn-secondary-glass inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold cursor-pointer whitespace-nowrap">
                      <FileUp className="h-3.5 w-3.5" />
                      <span>بارگذاری فایل .md</span>
                      <input
                        type="file"
                        accept=".md,.markdown,.txt,text/markdown,text/plain"
                        onChange={handleNoteMarkdownUpload}
                        className="sr-only"
                      />
                    </label>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <label
                        htmlFor="class-note-title"
                        className="block text-xs font-semibold text-[var(--muted)]"
                      >
                        عنوان جلسه یا مبحث (اختیاری)
                      </label>
                      <input
                        id="class-note-title"
                        type="text"
                        value={noteTitle}
                        onChange={(e) => setNoteTitle(e.target.value)}
                        placeholder="مثلاً: جلسه پنجم — مثال‌های بالینی استاد"
                        className="glass-field w-full px-3.5 py-2.5 text-sm"
                      />
                    </div>

                    {lessonChapters.length > 1 && (
                      <div className="space-y-1.5">
                        <label
                          htmlFor="class-note-chapter"
                          className="block text-xs font-semibold text-[var(--muted)]"
                        >
                          مربوط به فصل
                        </label>
                        <select
                          id="class-note-chapter"
                          value={noteChapterId}
                          onChange={(e) => setNoteChapterId(e.target.value)}
                          className="glass-field w-full px-3.5 py-2.5 text-sm"
                        >
                          <option value="">کل درس (عمومی)</option>
                          {lessonChapters.map((ch) => (
                            <option key={ch.id} value={ch.id}>
                              {ch.title}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label
                      htmlFor="class-note-content"
                      className="block text-xs font-semibold text-[var(--muted)]"
                    >
                      متن جزوه و نکات استاد (پشتیبانی از تیتر با ## و لیست با -) *
                    </label>
                    <textarea
                      id="class-note-content"
                      rows={5}
                      value={noteContent}
                      onChange={(e) => setNoteContent(e.target.value)}
                      placeholder="## نکات تکمیلی استاد&#10;- نکته خارج از کتاب اول...&#10;- مثال بالینی مطرح‌شده در کلاس..."
                      className="glass-field w-full p-3.5 text-sm leading-8"
                    />
                  </div>

                  {noteError && (
                    <p
                      role="alert"
                      className="rounded-xl bg-[var(--danger-tint)] px-3.5 py-2 text-xs font-semibold text-[var(--danger)]"
                    >
                      {noteError}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setNoteComposerOpen(false);
                        setEditingNoteId(null);
                        setNoteError('');
                      }}
                      className="btn-secondary-glass rounded-full px-4 py-2 text-xs font-semibold cursor-pointer whitespace-nowrap"
                    >
                      انصراف
                    </button>
                    <button
                      type="submit"
                      className="btn-primary-glass rounded-full px-5 py-2 text-xs font-bold cursor-pointer whitespace-nowrap"
                    >
                      {editingNoteId ? 'ذخیره تغییرات جزوه' : 'ثبت در جزوه درس'}
                    </button>
                  </div>
                </form>
              )}

              {/* Saved Class Notes List */}
              {visibleClassNotes.length === 0 && !noteComposerOpen ? (
                <div className="rounded-[20px] bg-[var(--sunk)] p-6 text-center space-y-2.5">
                  <p className="text-sm font-semibold text-[var(--ink-strong)]">
                    هنوز جزوه‌ای برای این {activeChapter ? 'فصل' : 'درس'} ثبت نشده است
                  </p>
                  <p className="text-xs text-[var(--muted)] max-w-md mx-auto leading-6">
                    هنگام تدریس استاد سر کلاس، می‌توانید نکات خارج از کتاب را همین‌جا اضافه کنید.
                  </p>
                  <button
                    type="button"
                    onClick={() => openNewNoteComposer(false)}
                    className="btn-secondary-glass inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold cursor-pointer whitespace-nowrap"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>ثبت اولین نکته سر کلاس</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-3.5">
                  {visibleClassNotes.map((note) => {
                    const dateLabel = new Intl.DateTimeFormat('fa-IR', {
                      month: 'short',
                      day: 'numeric',
                    }).format(new Date(note.updatedAt));
                    return (
                      <article
                        key={note.id}
                        className="rounded-[22px] border border-[var(--line)] bg-[var(--sunk)] p-4 sm:p-5 space-y-3"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-[var(--line)] pb-3">
                          <div>
                            <h3 className="text-sm sm:text-base font-bold text-[var(--ink-strong)]">
                              {note.title}
                            </h3>
                            <p className="text-xs text-[var(--muted)] mt-0.5 tabular-nums">
                              ثبت / بروزرسانی: {dateLabel}
                              {note.chapterTitle ? ` · ${note.chapterTitle}` : ''}
                            </p>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => openEditNoteComposer(note)}
                              aria-label={`ویرایش ${note.title}`}
                              className="btn-secondary-glass inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold cursor-pointer whitespace-nowrap"
                            >
                              <Pencil className="h-3 w-3" />
                              <span>ویرایش</span>
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setPendingDelete({
                                  kind: 'note',
                                  lessonId: activeLesson.id,
                                  note,
                                })
                              }
                              aria-label={`حذف ${note.title}`}
                              className="btn-secondary-glass inline-flex items-center justify-center rounded-full p-2 text-[var(--danger)] cursor-pointer"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        <LessonContentRenderer
                          content={note.content}
                          fontSize={fontSize}
                          headingIdPrefix={`note-${note.id}`}
                        />
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Bottom Next-Step Bar */}
            <div className="max-w-[72ch] mx-auto flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-5">
              <p className="text-xs text-[var(--muted)]">
                پس از مطالعه متن درس و جزوه استاد، می‌توانید خلاصه درس را مرور کنید یا نکته جدیدی به جزوه اضافه نمایید.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setViewMode('summary')}
                  className="btn-primary-glass rounded-full px-5 py-2 text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  مشاهده خلاصه درس
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onAddQuestionForLesson(activeLesson.id, activeChapter?.id)
                  }
                  className="btn-secondary-glass inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>افزودن سوال به این {activeChapter ? 'فصل' : 'درس'}</span>
                </button>
              </div>
            </div>
          </article>

          {/* Desktop Study Companion Outline & Quick Actions */}
          {displayedOutline.length > 0 && (
            <aside
              aria-label="فهرست مطالب و ابزار مطالعه"
              className="hidden lg:block lg:sticky lg:top-6 space-y-4"
            >
              <div className="glass-card p-5 space-y-3">
                <div className="flex items-center gap-2 text-xs font-extrabold text-[var(--ink-strong)]">
                  <ListTree className="h-4 w-4 text-[var(--blue)]" />
                  <span>فهرست بخش‌های درس</span>
                </div>
                <nav
                  aria-label="سرفصل‌های متن درس"
                  className="space-y-1 max-h-[calc(100vh-300px)] overflow-y-auto pl-1"
                >
                  {displayedOutline.map((heading, idx) => {
                    const isActive = activeHeadingId === heading.id;
                    return (
                      <button
                        key={heading.id}
                        type="button"
                        onClick={() => scrollToSection(heading.id)}
                        className={`w-full text-right rounded-xl px-3 py-2 text-xs leading-5 transition-colors cursor-pointer flex items-start gap-2 ${
                          isActive
                            ? 'bg-[var(--blue-tint)] text-[var(--blue-ink)] font-bold'
                            : 'text-[var(--muted)] hover:text-[var(--ink-strong)] hover:bg-[var(--sunk)]'
                        }`}
                      >
                        <span className="tabular-nums text-[11px] font-bold opacity-70 pt-0.5 shrink-0">
                          {toPersianDigits(idx + 1)}.
                        </span>
                        <span className="line-clamp-2">{heading.text}</span>
                      </button>
                    );
                  })}
                </nav>
              </div>

              <div className="glass-card p-5 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-[var(--ink-strong)]">همراه مطالعه</span>
                  <span className="text-[var(--muted)] tabular-nums">
                    {toPersianDigits(visibleClassNotes.length)} جزوه
                  </span>
                </div>
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => openNewNoteComposer(true)}
                    className="btn-secondary-glass w-full inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-semibold cursor-pointer whitespace-nowrap"
                  >
                    <NotebookPen className="h-3.5 w-3.5 text-[var(--purple-ink)]" />
                    <span>ثبت نکته سر کلاس</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('summary')}
                    className="btn-secondary-glass w-full inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-semibold cursor-pointer whitespace-nowrap"
                  >
                    <FileText className="h-3.5 w-3.5 text-[var(--blue-ink)]" />
                    <span>مرور خلاصه درس</span>
                  </button>
                </div>
              </div>
            </aside>
          )}
        </div>
      )}

      {/* Mode 2: Lesson Summary */}
      {viewMode === 'summary' && (
        <section className="glass-card-strong p-6 sm:p-8 space-y-6">
          <div className="max-w-[72ch] mx-auto space-y-5">
            {hasMultipleChapters && !activeChapter ? (
              <div className="space-y-3.5">
                {lessonChapters.map((ch, idx) => (
                  <div
                    key={ch.id}
                    className="rounded-[20px] border border-[var(--line)] bg-[var(--sunk)] p-5 space-y-2"
                  >
                    <h2 className="text-sm font-extrabold text-[var(--blue-ink)]">
                      {ch.title || `فصل ${toPersianDigits(idx + 1)}`}
                    </h2>
                    <p className="text-[15px] leading-8 text-[var(--ink)]">
                      {ch.summary || 'خلاصه‌ای برای این فصل ثبت نشده است.'}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-[22px] border border-[var(--line)] bg-[var(--sunk)] p-6 space-y-2.5">
                <h2 className="text-sm font-extrabold text-[var(--blue-ink)]">
                  {activeChapter ? `خلاصه ${activeChapter.title}` : 'چکیده سریع درس'}
                </h2>
                <p className="text-[15.5px] leading-8 text-[var(--ink)] whitespace-pre-line">
                  {(activeChapter ? activeChapter.summary : activeLesson.summary) ||
                    'خلاصه‌ای برای این بخش ثبت نشده است.'}
                </p>
              </div>
            )}

            {activeLesson.keyPoints.length > 0 && !hasMultipleChapters && (
              <div className="space-y-3">
                <h3 className="text-base font-bold text-[var(--ink-strong)]">
                  مرور نکات کلیدی ({toPersianDigits(activeLesson.keyPoints.length)} مورد)
                </h3>
                <ul className="space-y-2.5">
                  {activeLesson.keyPoints.map((point, index) => (
                    <li
                      key={index}
                      className="flex items-start gap-3 rounded-2xl bg-[var(--sunk)] px-4 py-3 text-sm leading-7 text-[var(--ink)]"
                    >
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--purple-tint)] text-xs font-bold text-[var(--purple-ink)] tabular-nums">
                        {toPersianDigits(index + 1)}
                      </span>
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--line)] pt-5">
              <button
                type="button"
                onClick={() => setViewMode('text')}
                className="btn-primary-glass rounded-full px-5 py-2 text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                بازگشت به متن درس و جزوه
              </button>
              <button
                type="button"
                onClick={() => setViewMode('exam')}
                className="btn-secondary-glass inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                <GraduationCap className="h-3.5 w-3.5" />
                <span>آزمون و سوالات فصل‌ها</span>
              </button>
              <button
                type="button"
                onClick={() => onEditLesson(activeLesson)}
                className="btn-secondary-glass inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                <Pencil className="h-3.5 w-3.5" />
                <span>ویرایش درس و خلاصه</span>
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Mode 3: Per-Lesson Chapter-by-Chapter Question Bank & Interactive Exam */}
      {viewMode === 'exam' && (
        <LessonExamPanel
          lesson={activeLesson}
          chapters={lessonChapters}
          selectedChapterId={selectedChapterId}
          onSelectChapterId={setSelectedChapterId}
          onRecordExam={onRecordExam}
          onAddQuestionForLesson={onAddQuestionForLesson}
        />
      )}

      {confirmModal}
    </div>
  );
}
