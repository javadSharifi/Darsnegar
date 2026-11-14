import { useMemo, useState } from 'react';
import {
  Bookmark,
  BookOpen,
  Flame,
  Moon,
  Plus,
  Search,
  Settings,
  Sparkles,
  Sun,
} from 'lucide-react';
import { LessonBuilder } from './components/LessonBuilder';
import { LessonWorkspace } from './components/LessonWorkspace';
import { OfflineStatusBanner } from './components/OfflineStatusBanner';
import { ReviewQueue } from './components/ReviewQueue';
import { SearchView } from './components/SearchView';
import { SettingsView } from './components/SettingsView';
import { useLearningStore } from './hooks/useLearningStore';
import type { AppTab, Lesson } from './types/learning';
import { toPersianDigits } from './utils/studyEngine';

const DESKTOP_NAV: { id: AppTab; label: string }[] = [
  { id: 'lessons', label: 'درس‌ها' },
  { id: 'review', label: 'مرور' },
  { id: 'settings', label: 'تنظیمات' },
];

const MOBILE_DOCK: { id: AppTab; label: string; Icon: typeof BookOpen }[] = [
  { id: 'lessons', label: 'درس‌ها', Icon: BookOpen },
  { id: 'review', label: 'مرور', Icon: Bookmark },
  { id: 'add', label: 'افزودن', Icon: Plus },
  { id: 'settings', label: 'تنظیمات', Icon: Settings },
];

export default function App() {
  const store = useLearningStore();
  const [activeTab, setActiveTab] = useState<AppTab>('lessons');
  const [lessonsScreenMode, setLessonsScreenMode] = useState<'list' | 'detail'>('list');
  const [editingLesson, setEditingLesson] = useState<Lesson | null>(null);
  const [builderTab, setBuilderTab] = useState<'lesson' | 'quick-question' | 'import'>('lesson');
  const [builderTargetLessonId, setBuilderTargetLessonId] = useState<string>('');
  const [builderTargetChapterId, setBuilderTargetChapterId] = useState<string>('');

  const reviewCount = useMemo(() => {
    let count = 0;
    for (const lesson of store.lessons) {
      for (const q of lesson.questions) {
        if (store.progress[q.id]?.state === 'want_to_learn') {
          count += 1;
        }
      }
    }
    return count;
  }, [store.lessons, store.progress]);

  const navigateTo = (tab: AppTab) => {
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCreateNewLesson = () => {
    setEditingLesson(null);
    setBuilderTab('lesson');
    navigateTo('add');
  };

  const handleAddQuestionForLesson = (lessonId: string, chapterId?: string) => {
    setEditingLesson(null);
    setBuilderTargetLessonId(lessonId);
    setBuilderTargetChapterId(chapterId ?? '');
    setBuilderTab('quick-question');
    navigateTo('add');
  };

  const handleEditLesson = (lesson: Lesson) => {
    setEditingLesson(lesson);
    setBuilderTab('lesson');
    navigateTo('add');
  };

  const handleSaveLesson = (lesson: Lesson, isEdit: boolean) => {
    if (isEdit) {
      store.updateLesson(lesson);
    } else {
      store.addLesson(lesson);
    }
    setEditingLesson(null);
    store.setActiveLessonId(lesson.id);
    setLessonsScreenMode('detail');
    navigateTo('lessons');
  };

  const isCurrentlyDark =
    store.settings.theme === 'dark' ||
    (store.settings.theme === 'auto' &&
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);

  const toggleQuickTheme = () => {
    store.updateSettings({ theme: isCurrentlyDark ? 'light' : 'dark' });
  };

  return (
    <div className="min-h-screen pb-24 md:pb-12">
      {/* Top Bar: Airy single-row header on mobile & desktop */}
      <header className="relative border-b border-[var(--line)] bg-[var(--nav-bg)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1160px] items-center justify-between gap-2 md:gap-4 px-4 py-2.5 sm:py-3 sm:px-6 min-w-0">
          {/* Zone 1: Single-line Brand Wordmark */}
          <button
            type="button"
            onClick={() => {
              setLessonsScreenMode('list');
              navigateTo('lessons');
            }}
            className="text-lg sm:text-xl font-extrabold tracking-tight text-[var(--ink-strong)] whitespace-nowrap shrink-0 cursor-pointer"
          >
            درس‌نگار
          </button>

          {/* Zone 2: Desktop concise single-line text nav links */}
          <nav
            aria-label="ناوبری اصلی"
            className="hidden md:flex items-center gap-4 lg:gap-6 text-sm font-medium"
          >
            {DESKTOP_NAV.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    if (item.id === 'lessons') {
                      setLessonsScreenMode('list');
                    }
                    navigateTo(item.id);
                  }}
                  aria-current={isActive ? 'page' : undefined}
                  className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 inline-flex items-center gap-1.5 ${
                    isActive
                      ? 'border-[var(--blue)] text-[var(--blue-ink)] font-bold'
                      : 'border-transparent text-[var(--muted)] hover:text-[var(--ink-strong)]'
                  }`}
                >
                  <span>{item.label}</span>
                  {item.id === 'review' && reviewCount > 0 && (
                    <span className="rounded-full bg-[var(--blue-soft)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--blue-ink)] tabular-nums">
                      {toPersianDigits(reviewCount)}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Compact Progress Stats, Quick Utilities & Desktop Primary CTA */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <div
              className="flex items-center gap-2 sm:rounded-full sm:border sm:border-[var(--line)] sm:bg-[var(--surface-2)] px-1.5 sm:px-2.5 py-1 text-xs tabular-nums"
              title={`استریک: ${toPersianDigits(store.gamification.streak)} روز · ${toPersianDigits(store.gamification.xp)} امتیاز`}
            >
              <span className="inline-flex items-center gap-1 font-semibold text-[var(--peach-ink)] whitespace-nowrap">
                <Flame className="h-3.5 w-3.5 text-[var(--peach)]" />
                <span>{toPersianDigits(store.gamification.streak)}</span>
                <span className="hidden xl:inline">روز</span>
              </span>

              <span className="text-[var(--line-2)]" aria-hidden="true">
                ·
              </span>

              <span className="inline-flex items-center gap-1 font-semibold text-[var(--blue-ink)] whitespace-nowrap">
                <Sparkles className="h-3.5 w-3.5 text-[var(--blue)]" />
                <span data-testid="xp-counter">
                  {toPersianDigits(store.gamification.xp)}
                  <span className="hidden sm:inline"> امتیاز</span>
                </span>
              </span>
            </div>

            <button
              type="button"
              onClick={() => navigateTo('search')}
              aria-label="جستجو در درس‌ها و سوالات"
              title="جستجو"
              className={`btn-secondary-glass inline-flex items-center justify-center gap-1.5 rounded-full min-h-[40px] min-w-[40px] lg:min-w-0 lg:px-3 lg:py-1.5 text-xs font-semibold cursor-pointer whitespace-nowrap ${
                activeTab === 'search' ? 'text-[var(--blue-ink)]' : ''
              }`}
            >
              <Search className="h-4 w-4 lg:h-3.5 lg:w-3.5" />
              <span className="hidden lg:inline">جستجو</span>
            </button>

            <button
              type="button"
              onClick={toggleQuickTheme}
              aria-label={isCurrentlyDark ? 'تغییر به تم روشن' : 'تغییر به تم تیره'}
              title={isCurrentlyDark ? 'تم روشن' : 'تم تیره'}
              className="btn-secondary-glass inline-flex items-center justify-center rounded-full min-h-[40px] min-w-[40px] cursor-pointer"
            >
              {isCurrentlyDark ? (
                <Sun className="h-4 w-4 sm:h-3.5 sm:w-3.5 text-[var(--peach)]" />
              ) : (
                <Moon className="h-4 w-4 sm:h-3.5 sm:w-3.5 text-[var(--blue-ink)]" />
              )}
            </button>

            <button
              type="button"
              onClick={handleCreateNewLesson}
              className="btn-primary-glass hidden md:inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>افزودن درس</span>
            </button>
          </div>
        </div>
      </header>

      {/* Top Offline / Reconnect Auto-Sync Status Bar */}
      <OfflineStatusBanner
        isOnline={store.isOnline}
        hasCloudAccount={Boolean(store.cloudUser)}
        pendingChangesCount={store.offlineQueue.pendingChangesCount}
        reconnectSyncStatus={store.reconnectSyncStatus}
        onManualRetrySync={() => void store.flushOfflineQueue()}
        onDismissSynced={store.dismissReconnectBanner}
      />

      {/* Main Workspace Container */}
      <main className="mx-auto w-full max-w-[1160px] min-w-0 px-4 pt-4 sm:pt-5 sm:px-6 space-y-5">
        {/* Active View */}
        {activeTab === 'lessons' && (
          <LessonWorkspace
            lessons={store.lessons}
            activeLessonId={store.activeLessonId}
            screenMode={lessonsScreenMode}
            progress={store.progress}
            fontSize={store.settings.fontSize}
            onChangeScreenMode={setLessonsScreenMode}
            onSelectLesson={store.setActiveLessonId}
            onCreateNewLesson={handleCreateNewLesson}
            onEditLesson={handleEditLesson}
            onDeleteLesson={store.deleteLesson}
            onAddQuestionForLesson={handleAddQuestionForLesson}
            onSaveClassNote={store.saveClassNote}
            onDeleteClassNote={store.deleteClassNote}
            onSaveCourseOverview={store.saveCourseOverview}
            onRecordExam={store.recordExamAttempt}
            cloudUser={store.cloudUser}
            cloudSyncing={store.cloudSyncing}
            isOnline={store.isOnline}
            onSyncWithCloud={store.performCloudSync}
            onPushLessonToCloud={store.pushLessonToCloud}
            onOpenCloudSettings={() => navigateTo('settings')}
          />
        )}

        {activeTab === 'review' && (
          <ReviewQueue
            lessons={store.lessons}
            progress={store.progress}
            onMarkKnown={(qId) => store.markQuestionState(qId, 'know', 10)}
          />
        )}

        {activeTab === 'add' && (
          <LessonBuilder
            lessons={store.lessons}
            editingLesson={editingLesson}
            initialTab={builderTab}
            initialTargetLessonId={builderTargetLessonId}
            initialTargetChapterId={builderTargetChapterId}
            onSaveLesson={handleSaveLesson}
            onSelectLessonForEdit={(lesson) => {
              setEditingLesson(lesson);
              setBuilderTab('lesson');
            }}
            onImportLessons={(imported) => {
              store.addLessonsBatch(imported);
              setLessonsScreenMode('detail');
              navigateTo('lessons');
            }}
            onAddQuickQuestion={(lessonId, q) => {
              store.addQuestionToLesson(lessonId, q);
            }}
            onCancelEdit={() => {
              setEditingLesson(null);
              navigateTo('lessons');
            }}
          />
        )}

        {activeTab === 'search' && (
          <SearchView
            lessons={store.lessons}
            onOpenLesson={(lessonId) => {
              store.setActiveLessonId(lessonId);
              setLessonsScreenMode('detail');
              navigateTo('lessons');
            }}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsView
            settings={store.settings}
            lessonCount={store.lessons.length}
            cloudUser={store.cloudUser}
            cloudSyncing={store.cloudSyncing}
            cloudLastSyncedAt={store.cloudLastSyncedAt}
            cloudApiUrl={store.cloudApiUrl}
            isOnline={store.isOnline}
            pendingSyncCount={store.offlineQueue.pendingChangesCount}
            onUpdateSettings={store.updateSettings}
            onExportBackup={store.exportBackupJson}
            onImportBackup={store.importBackupJson}
            onResetProgress={store.resetProgressOnly}
            onRegisterToCloud={store.registerToCloud}
            onLoginToCloud={store.loginToCloud}
            onLogoutFromCloud={store.logoutFromCloud}
            onSyncWithCloud={store.performCloudSync}
            onPushAllToCloud={store.pushAllLessonsToCloud}
            onUpdateCloudApiUrl={store.updateCloudApiUrl}
            onTestCloudConnection={store.testCloudConnection}
          />
        )}
      </main>

      {/* Clean Edge-to-Edge Frosted Mobile Bottom Tab Bar */}
      <nav
        aria-label="نوار ناوبری موبایل"
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--line)] bg-[var(--nav-bg)] backdrop-blur-xl pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <div className="mx-auto grid h-16 max-w-md grid-cols-4 items-center px-2">
          {MOBILE_DOCK.map(({ id, label, Icon }) => {
            const isActive = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  if (id === 'add') {
                    setEditingLesson(null);
                    setBuilderTab('lesson');
                  } else if (id === 'lessons') {
                    setLessonsScreenMode('list');
                  }
                  navigateTo(id);
                }}
                aria-current={isActive ? 'page' : undefined}
                className={`relative flex min-h-[48px] flex-col items-center justify-center gap-1 text-[11px] cursor-pointer transition-colors ${
                  isActive
                    ? 'font-bold text-[var(--blue-ink)]'
                    : 'font-medium text-[var(--muted)]'
                }`}
              >
                <span
                  className={`inline-flex items-center justify-center rounded-full px-3.5 py-1 transition-colors ${
                    isActive ? 'bg-[var(--blue-tint)] text-[var(--blue-ink)]' : ''
                  }`}
                >
                  <Icon className="h-4.5 w-4.5" />
                </span>
                <span className="whitespace-nowrap leading-none">{label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
