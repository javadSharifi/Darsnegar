export type DifficultyLevel = 'junior' | 'mid' | 'senior';

export type QuestionProgressState = 'unseen' | 'know' | 'want_to_learn' | 'skip';

export type AppTab = 'lessons' | 'review' | 'add' | 'search' | 'settings';

export type QuestionType = 'mcq' | 'descriptive';

export type LessonViewMode = 'text' | 'summary' | 'exam';

export type ThemePreference = 'light' | 'dark' | 'auto';

export type FontSizePreference = 'small' | 'medium' | 'large';

export interface LessonQuestion {
  id: string;
  questionType?: QuestionType;
  question: string;
  answer: string;
  options: string[];
  correctOptionIndex: number;
  level: DifficultyLevel;
  codeSnippet?: string;
  chapterId?: string;
  chapterTitle?: string;
  isCustom?: boolean;
}

export interface LessonChapter {
  id: string;
  title: string;
  summary: string;
  content: string;
  questions: LessonQuestion[];
}

export interface ClassNote {
  id: string;
  title: string;
  content: string;
  chapterId?: string;
  chapterTitle?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Lesson {
  id: string;
  title: string;
  category: string;
  level: DifficultyLevel;
  courseOverview?: string;
  summary: string;
  keyPoints: string[];
  content: string;
  chapters?: LessonChapter[];
  classNotes?: ClassNote[];
  questions: LessonQuestion[];
  createdAt: number;
  updatedAt: number;
  isCustom?: boolean;
}

export interface UserQuestionProgress {
  state: QuestionProgressState;
  updatedAt: number;
}

export interface ExamAttempt {
  id: string;
  lessonId: string;
  lessonTitle: string;
  totalQuestions: number;
  correctCount: number;
  wrongQuestionIds: string[];
  scorePercent: number;
  xpEarned: number;
  durationSeconds: number;
  completedAt: number;
}

export interface GamificationStats {
  xp: number;
  streak: number;
  lastActiveDate: string;
  examsCompleted: number;
}

export interface AppSettings {
  theme: ThemePreference;
  fontSize: FontSizePreference;
  examTimerMinutes: number;
}

export interface BackupPayload {
  version: number;
  exportedAt: number;
  lessons: Lesson[];
  progress: Record<string, UserQuestionProgress>;
  gamification: GamificationStats;
  examHistory: ExamAttempt[];
  settings: AppSettings;
}

export interface CloudUser {
  id: string;
  email: string;
  name: string;
}

export interface DeletedLessonRecord {
  id: string;
  deletedAt: number;
}

export interface CloudSyncPayload {
  lessons: Lesson[];
  deletedLessons?: DeletedLessonRecord[];
  progress: Record<string, UserQuestionProgress>;
  gamification: GamificationStats;
  examHistory: ExamAttempt[];
}

export interface CloudSyncResult {
  ok: boolean;
  message: string;
  pushedLessons?: number;
  pulledLessons?: number;
  syncedAt?: number;
}

