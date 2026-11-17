import type {
  ActiveExamSession,
  ExamAttempt,
  ExamItem,
  QuestionResult,
  StoreState,
  UserProfile,
} from '../types';
import { calculateAcseeGrade } from './acsee';

const STATE_CACHE_PREFIX = 'elimu_fasta_offline_state_v2_';
const QUEUE_CACHE_KEY = 'elimu_fasta_offline_queue_v1';

export interface OfflineMutation {
  id: string;
  url: string;
  method: 'POST';
  body: unknown;
  label: string;
  createdAt: string;
}

export function saveCachedState<T extends StoreState>(state: T, username = 'default'): void {
  try {
    localStorage.setItem(`${STATE_CACHE_PREFIX}${username}`, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors
  }
}

export function loadCachedState<T extends StoreState>(username = 'default'): T | null {
  try {
    const raw = localStorage.getItem(`${STATE_CACHE_PREFIX}${username}`);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function getOfflineQueue(): OfflineMutation[] {
  try {
    const raw = localStorage.getItem(QUEUE_CACHE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as OfflineMutation[];
  } catch {
    return [];
  }
}

export function enqueueOfflineMutation(item: Omit<OfflineMutation, 'id' | 'createdAt'>): OfflineMutation[] {
  const queue = getOfflineQueue();
  const next: OfflineMutation[] = [
    ...queue,
    {
      ...item,
      id: `off-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: new Date().toISOString(),
    },
  ];
  try {
    localStorage.setItem(QUEUE_CACHE_KEY, JSON.stringify(next));
  } catch {
    // Ignore quota errors
  }
  return next;
}

export function clearOfflineQueueItem(id: string): OfflineMutation[] {
  const next = getOfflineQueue().filter((x) => x.id !== id);
  try {
    localStorage.setItem(QUEUE_CACHE_KEY, JSON.stringify(next));
  } catch {
    // Ignore
  }
  return next;
}

export function createOfflineExamSession(exam: ExamItem, user: UserProfile, priorAttempts: ExamAttempt[]): ActiveExamSession {
  if (exam.antiRepetition) {
    const prior = priorAttempts.find(
      (a) => a.examId === exam.id && a.studentUsername === user.username
    );
    if (prior) {
      throw new Error('Anti-Repetition System Active: You have already completed this teacher-locked exam.');
    }
  }
  const now = Date.now();
  return {
    sessionId: `offline-sess-${now}`,
    examId: exam.id,
    examTitle: exam.title,
    studentUsername: user.username,
    studentName: user.realName,
    startedAt: now,
    expiresAt: now + exam.durationMinutes * 60 * 1000,
  };
}

export function scoreWrittenAnswerLocally(
  q: ExamItem['questions'][number],
  writtenAnswer: string
): { marksAwarded: number; isCorrect: boolean; aiFeedback: string } {
  const clean = writtenAnswer.trim();
  if (!clean) {
    return {
      marksAwarded: 0,
      isCorrect: false,
      aiFeedback: 'No written solution submitted.',
    };
  }
  const lower = clean.toLowerCase();
  const points = q.markingPoints && q.markingPoints.length > 0 ? q.markingPoints : [q.expectedAnswer || q.explanation];
  const expectedLower = String(q.expectedAnswer || '').trim().toLowerCase();

  let matchedPoints = 0;
  for (const pt of points) {
    const tokens = pt
      .toLowerCase()
      .split(/[^a-z0-9²³√πθ=+\-/^]+/)
      .filter((t) => t.length >= 2);
    if (tokens.length === 0) continue;
    const hits = tokens.filter((t) => lower.includes(t)).length;
    if (hits >= Math.max(1, Math.ceil(tokens.length * 0.35))) {
      matchedPoints += 1;
    }
  }

  let ratio = points.length > 0 ? matchedPoints / points.length : 0;
  if (expectedLower && lower.includes(expectedLower)) {
    ratio = Math.max(ratio, 0.8);
  }
  if (clean.length >= 40 && ratio === 0) {
    ratio = 0.25;
  }
  const marksAwarded = Math.min(q.marks, Math.max(0, Math.round(ratio * q.marks)));
  const isCorrect = marksAwarded >= Math.ceil(q.marks * 0.6);
  const aiFeedback = `Local ACSEE rubric check matched ${matchedPoints}/${points.length} key marking point(s).${
    isCorrect ? ' Meets pass threshold — awaiting teacher confirmation.' : ' Review step-by-step marking points in Correction Door.'
  }`;
  return { marksAwarded, isCorrect, aiFeedback };
}

export function gradeExamLocally(
  exam: ExamItem,
  user: UserProfile,
  answers: Record<string, number>,
  mode: ExamAttempt['mode'],
  session?: ActiveExamSession,
  forceExpiredTest = false,
  writtenAnswers: Record<string, string> = {}
): ExamAttempt {
  const now = Date.now();
  if (forceExpiredTest || (session && now > session.expiresAt)) {
    throw new Error('3-Hour Time Limit Expired: Submitting is not allowed after the end of time.');
  }

  let score = 0;
  let totalMarks = 0;
  const questionResults: QuestionResult[] = exam.questions.map((q) => {
    totalMarks += q.marks;
    const qType = q.questionType || 'mcq';
    if (qType === 'mcq') {
      const selectedIndex = typeof answers[q.id] === 'number' ? answers[q.id] : -1;
      const isCorrect = selectedIndex === q.correctIndex;
      const marksAwarded = isCorrect ? q.marks : 0;
      score += marksAwarded;
      return {
        questionId: q.id,
        questionType: qType,
        topic: q.topic,
        selectedIndex,
        correctIndex: q.correctIndex,
        isCorrect,
        marksAwarded,
        maxMarks: q.marks,
      };
    }
    const text = String(writtenAnswers[q.id] || '');
    const graded = scoreWrittenAnswerLocally(q, text);
    score += graded.marksAwarded;
    return {
      questionId: q.id,
      questionType: qType,
      topic: q.topic,
      selectedIndex: -1,
      correctIndex: -1,
      writtenAnswer: text,
      expectedAnswer: q.expectedAnswer,
      aiFeedback: graded.aiFeedback,
      isCorrect: graded.isCorrect,
      marksAwarded: graded.marksAwarded,
      maxMarks: q.marks,
    };
  });

  const percentage = totalMarks > 0 ? Math.round((score / totalMarks) * 100) : 0;
  const acsee = calculateAcseeGrade(percentage);
  const elapsedSeconds = session ? Math.max(12, Math.floor((now - session.startedAt) / 1000)) : 600;

  return {
    id: `att-off-${now}`,
    examId: exam.id,
    examTitle: exam.title,
    subject: exam.subject,
    studentUsername: user.username,
    studentName: user.realName,
    schoolName: user.schoolName,
    className: user.className,
    classCode: user.classCode,
    mode,
    startedAt: session ? new Date(session.startedAt).toISOString() : new Date().toISOString(),
    submittedAt: new Date().toISOString(),
    elapsedSeconds,
    score,
    totalMarks,
    percentage,
    acseeGrade: acsee.grade,
    acseePoints: acsee.points,
    status: exam.requiresTeacherReview ? 'pending_review' : 'released',
    teacherNote: 'Graded offline via local ACSEE engine (queued to sync).',
    questionResults,
  };
}

export function runOfflineAiTutor(
  attempts: ExamAttempt[],
  exams: ExamItem[],
  user: UserProfile,
  customQuestion?: string
) {
  const myAttempts = attempts.filter((a) => a.studentUsername === user.username);
  const missedList: Array<{ subject: string; topic: string; qPrompt: string; explanation: string }> = [];

  for (const att of myAttempts) {
    const exam = exams.find((e) => e.id === att.examId);
    for (const qr of att.questionResults) {
      if (!qr.isCorrect) {
        const q = exam?.questions.find((x) => x.id === qr.questionId);
        missedList.push({
          subject: att.subject,
          topic: qr.topic,
          qPrompt: q?.prompt || `Review ${qr.topic} problem`,
          explanation: q?.explanation || 'Re-derive using core ACSEE principles and verify SI units.',
        });
      }
    }
  }

  const weakAreas =
    missedList.length > 0
      ? missedList.slice(0, 4).map((m) => ({
          topic: `${m.subject} · ${m.topic}`,
          mistakePattern: `Missed question on ${m.topic} in recent ACSEE assessment.`,
          whatToDo: `Review formulas in the In-App Library for ${m.topic} and test parameters in the Physics Emulation Lab.`,
          practiceExercise: m.qPrompt,
          solutionGuide: m.explanation,
        }))
      : [
          {
            topic: 'Physics · Simple Harmonic Motion & Optics',
            mistakePattern: 'Offline baseline drill generated (no missed questions detected yet).',
            whatToDo: 'Use the Physical Emulation Lab to verify T = 2π√(L/g) and double-slit fringe spacing β = λD/d.',
            practiceExercise: 'Calculate the period of a 1.0 m simple pendulum where g = 9.81 m/s².',
            solutionGuide: 'T = 2π√(1.0 / 9.81) ≈ 2.01 s.',
          },
          {
            topic: 'Mathematics · Calculus & Vectors',
            mistakePattern: 'Offline baseline drill for Pure Mathematics Paper 1.',
            whatToDo: 'Practice chain rule differentiation and 3D vector dot products using the Scientific Calculator.',
            practiceExercise: 'Evaluate ∫₀¹ (3x² + 2x) dx.',
            solutionGuide: 'Antiderivative is x³ + x². From 0 to 1 gives 1 + 1 = 2.',
          },
        ];

  return {
    diagnosisSummary: `Offline Diagnostic Mode active for ${user.realName}. Analyzed ${myAttempts.length} cached exam attempt(s) locally${
      customQuestion ? ` with note: "${customQuestion}"` : ''
    }. Reconnect to internet anytime for extended Gemini AI follow-up.`,
    weakAreas,
    nextStudyPlan:
      '1) Inspect Correction Door explanations for missed questions. 2) Run interactive simulations in Physics Lab. 3) Re-test with cached Past Papers offline.',
  };
}
