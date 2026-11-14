import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeDeletedLessonRecords,
  mergeExamHistory,
  mergeFullCloudPayload,
  mergeGamification,
  mergeLessons,
  mergeProgress,
} from './cloudMerge';
import type { Lesson } from '../types/learning';

function makeLesson(id: string, title: string, updatedAt: number, isCustom = true): Lesson {
  return {
    id,
    title,
    category: 'عمومی',
    level: 'mid',
    summary: 'خلاصه',
    keyPoints: [],
    content: 'متن درس',
    questions: [],
    createdAt: 1000,
    updatedAt,
    isCustom,
  };
}

test('mergeLessons pulls new cloud lessons and applies Last-Write-Wins on conflicts', () => {
  const local = [
    makeLesson('l-1', 'نسخه قدیمی محلی', 1000),
    makeLesson('l-2', 'درس جدید محلی', 2000),
  ];
  const cloud = [
    makeLesson('l-1', 'نسخه جدید کلادفلر', 3000),
    makeLesson('l-3', 'درس جدید کلادفلر', 2500),
  ];

  const res = mergeLessons(local, cloud);
  assert.equal(res.pulledNewCount, 1);
  assert.equal(res.updatedFromCloudCount, 1);
  assert.equal(res.merged.length, 3);
  assert.equal(res.merged.find((l) => l.id === 'l-1')?.title, 'نسخه جدید کلادفلر');
  assert.equal(res.merged.find((l) => l.id === 'l-2')?.title, 'درس جدید محلی');
  assert.equal(res.merged.find((l) => l.id === 'l-3')?.title, 'درس جدید کلادفلر');
});

test('mergeLessons respects tombstones unless lesson was re-saved after deletion', () => {
  const local = [makeLesson('l-keep', 'محلی', 5000)];
  const cloud = [
    makeLesson('l-del', 'حذف شده', 2000),
    makeLesson('l-recreated', 'بازسازی شده', 6000),
  ];
  const deleted = mergeDeletedLessonRecords(
    [{ id: 'l-del', deletedAt: 3000 }],
    [{ id: 'l-recreated', deletedAt: 4000 }]
  );

  const res = mergeLessons(local, cloud, deleted);
  assert.equal(res.merged.some((l) => l.id === 'l-del'), false);
  assert.equal(res.merged.some((l) => l.id === 'l-recreated'), true);
});

test('mergeProgress keeps newer question states by updatedAt', () => {
  const merged = mergeProgress(
    {
      q1: { state: 'want_to_learn', updatedAt: 100 },
      q2: { state: 'know', updatedAt: 500 },
    },
    {
      q1: { state: 'know', updatedAt: 300 },
      q2: { state: 'want_to_learn', updatedAt: 200 },
      q3: { state: 'know', updatedAt: 400 },
    }
  );
  assert.equal(merged.q1.state, 'know');
  assert.equal(merged.q2.state, 'know');
  assert.equal(merged.q3.state, 'know');
});

test('mergeGamification takes max xp/streak/exams and latest active date', () => {
  const merged = mergeGamification(
    { xp: 120, streak: 2, lastActiveDate: '2026-11-10', examsCompleted: 1 },
    { xp: 80, streak: 5, lastActiveDate: '2026-11-14', examsCompleted: 3 }
  );
  assert.equal(merged.xp, 120);
  assert.equal(merged.streak, 5);
  assert.equal(merged.examsCompleted, 3);
  assert.equal(merged.lastActiveDate, '2026-11-14');
});

test('mergeExamHistory deduplicates by id and sorts newest first', () => {
  const merged = mergeExamHistory(
    [
      {
        id: 'ex-1',
        lessonId: 'l-1',
        lessonTitle: 'درس ۱',
        totalQuestions: 5,
        correctCount: 4,
        wrongQuestionIds: [],
        scorePercent: 80,
        xpEarned: 40,
        durationSeconds: 30,
        completedAt: 1000,
      },
    ],
    [
      {
        id: 'ex-1',
        lessonId: 'l-1',
        lessonTitle: 'درس ۱',
        totalQuestions: 5,
        correctCount: 4,
        wrongQuestionIds: [],
        scorePercent: 80,
        xpEarned: 40,
        durationSeconds: 30,
        completedAt: 1000,
      },
      {
        id: 'ex-2',
        lessonId: 'l-2',
        lessonTitle: 'درس ۲',
        totalQuestions: 5,
        correctCount: 5,
        wrongQuestionIds: [],
        scorePercent: 100,
        xpEarned: 60,
        durationSeconds: 25,
        completedAt: 2000,
      },
    ]
  );
  assert.equal(merged.length, 2);
  assert.equal(merged[0].id, 'ex-2');
});

test('mergeFullCloudPayload combines all sync slices cleanly', () => {
  const result = mergeFullCloudPayload(
    {
      lessons: [makeLesson('l-1', 'محلی', 1000)],
      deletedLessons: [],
      progress: { q1: { state: 'unseen', updatedAt: 100 } },
      gamification: { xp: 50, streak: 1, lastActiveDate: '2026-11-12', examsCompleted: 0 },
      examHistory: [],
    },
    {
      lessons: [makeLesson('l-2', 'ابری', 2000)],
      progress: { q1: { state: 'know', updatedAt: 500 } },
      gamification: { xp: 90, streak: 2, lastActiveDate: '2026-11-14', examsCompleted: 1 },
    }
  );
  assert.equal(result.pulledNewCount, 1);
  assert.equal(result.merged.lessons.length, 2);
  assert.equal(result.merged.progress.q1.state, 'know');
  assert.equal(result.merged.gamification.xp, 90);
});
