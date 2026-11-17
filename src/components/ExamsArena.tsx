import React, { useEffect, useMemo, useState } from 'react';
import {
  Bookmark,
  Camera,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Heart,
  Lock,
  Plus,
  Share2,
  ShieldCheck,
  Swords,
  Trash2,
  Users,
} from 'lucide-react';
import type {
  ActiveExamSession,
  AppConfig,
  AppPerformanceSummary,
  ArenaRoom,
  ClassGroup,
  ExamAttempt,
  ExamItem,
  ExamQuestion,
  ExamQuestionType,
  Subject,
  UserProfile,
} from '../types';
import { ACSEE_SYLLABUS, formatCountdown } from '../utils/acsee';
import { downloadDataUrlFile } from '../utils/media';
import { downloadTeacherResultsPdf, downloadWatermarkedExamPdf } from '../utils/pdf';

interface Props {
  config: AppConfig;
  currentUser: UserProfile;
  exams: ExamItem[];
  attempts: ExamAttempt[];
  classes: ClassGroup[];
  users: UserProfile[];
  appPerformance?: AppPerformanceSummary;
  activeSessions: ActiveExamSession[];
  arenas: ArenaRoom[];
  onReactExam: (examId: string, action: 'like' | 'save' | 'share') => Promise<void>;
  onToggleAntiRep: (examId: string) => Promise<void>;
  onCreateExam: (payload: any) => Promise<void>;
  onStartExam: (examId: string) => Promise<{ session: ActiveExamSession; questions: ExamQuestion[] }>;
  onSubmitExam: (
    examId: string,
    payload: {
      sessionId?: string;
      answers: Record<string, number>;
      writtenAnswers?: Record<string, string>;
      mode?: string;
      forceExpiredTest?: boolean;
    }
  ) => Promise<ExamAttempt>;
  onScanGradeExam: (payload: {
    examId: string;
    imageBase64?: string;
    mimeType?: string;
    handwrittenNotes?: string;
  }) => Promise<{ attempt: ExamAttempt; scanSummary: string }>;
  onReleaseAttempt: (
    attemptId: string,
    teacherNote: string,
    questionMarkOverrides?: Record<string, number>
  ) => Promise<void>;
  onArenaCreate: (examId: string) => void;
  onArenaJoin: (code: string) => void;
  onArenaProgress: (code: string, progress: number) => void;
  onArenaFinish: (code: string, score: number) => void;
}

interface DraftQuestion {
  id: string;
  questionType: ExamQuestionType;
  section: 'Section A' | 'Section B';
  topic: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  expectedAnswer: string;
  markingPointsText: string;
  marks: number;
  explanation: string;
}

const STEM_SYMBOLS = ['π', '√', '∫', '∑', 'Δ', 'θ', '⇒', '∴', '≥', '≤', '²', '³', '±', '∞'];

const QUESTION_TYPE_LABELS: Record<ExamQuestionType, string> = {
  mcq: 'Multiple Choice (MCQ)',
  short_answer: 'Structured Solution',
  explanation: 'Explanation Question',
  proof: 'Formal Proof',
};

const makeBlankQuestion = (subject: Subject, idx: number): DraftQuestion => ({
  id: `draft-q-${Date.now()}-${idx}`,
  questionType: 'mcq',
  section: 'Section A',
  topic: ACSEE_SYLLABUS[subject].topics[0],
  prompt: '',
  options: ['', '', '', ''],
  correctIndex: 0,
  expectedAnswer: '',
  markingPointsText: '',
  marks: 10,
  explanation: '',
});

export const ExamsArena: React.FC<Props> = ({
  config,
  currentUser,
  exams,
  attempts,
  classes,
  users,
  appPerformance,
  activeSessions,
  arenas,
  onReactExam,
  onToggleAntiRep,
  onCreateExam,
  onStartExam,
  onSubmitExam,
  onScanGradeExam,
  onReleaseAttempt,
  onArenaCreate,
  onArenaJoin,
  onArenaProgress,
  onArenaFinish,
}) => {
  const isTeacher = currentUser.role === 'teacher';
  const isAdmin = currentUser.role === 'admin';
  const isTeacherOrAdmin = isTeacher || isAdmin;
  const isParent = currentUser.role === 'parent';

  const [subTab, setSubTab] = useState<'exams' | 'scan' | 'arena' | 'results' | 'create'>(
    isParent ? 'results' : 'exams'
  );
  const [subjectFilter, setSubjectFilter] = useState<'All' | Subject>('All');

  // Active sitting state (3-hour timer)
  const [activeExam, setActiveExam] = useState<{
    exam: ExamItem;
    session: ActiveExamSession;
    questions: ExamQuestion[];
  } | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [writtenAnswers, setWrittenAnswers] = useState<Record<string, string>>({});
  const [remainingSeconds, setRemainingSeconds] = useState<number>(10800);
  const [examError, setExamError] = useState<string | null>(null);
  const [latestSubmitted, setLatestSubmitted] = useState<ExamAttempt | null>(null);
  const [submittingExam, setSubmittingExam] = useState(false);

  // Physical Scan state
  const [scanExamId, setScanExamId] = useState<string>(exams[0]?.id || '');
  const [scanImageBase64, setScanImageBase64] = useState<string>('');
  const [scanMimeType, setScanMimeType] = useState<string>('image/jpeg');
  const [scanNotes, setScanNotes] = useState<string>('');
  const [scanLoading, setScanLoading] = useState(false);
  const [scanResult, setScanResult] = useState<{ attempt: ExamAttempt; scanSummary: string } | null>(null);

  // 1v1 Arena state (MCQ compatible papers)
  const mcqArenaExams = useMemo(
    () => exams.filter((e) => e.questions.some((q) => (q.questionType || 'mcq') === 'mcq')),
    [exams]
  );
  const [arenaExamId, setArenaExamId] = useState<string>(mcqArenaExams[0]?.id || exams[0]?.id || '');
  const [arenaJoinCode, setArenaJoinCode] = useState('');
  const [arenaAnswers, setArenaAnswers] = useState<Record<string, number>>({});

  // Correction door & teacher review state
  const [selectedAttemptId, setSelectedAttemptId] = useState<string | null>(null);
  const [teacherNotes, setTeacherNotes] = useState<Record<string, string>>({});
  const [markOverrides, setMarkOverrides] = useState<Record<string, number>>({});
  const [releasingId, setReleasingId] = useState<string | null>(null);

  // Create Exam / Past Paper state aligned with NECTA ACSEE syllabus (multi-question + non-MCQ)
  const [newTitle, setNewTitle] = useState('');
  const [newSubject, setNewSubject] = useState<Subject>('Physics');
  const [newPaperCode, setNewPaperCode] = useState('131/1');
  const [newKind, setNewKind] = useState<'teacher_exam' | 'past_paper' | 'competition'>(
    isTeacherOrAdmin ? 'teacher_exam' : 'past_paper'
  );
  const [newScope, setNewScope] = useState<'individual' | 'class_to_class' | 'school_to_school'>('individual');
  const [newAntiRep, setNewAntiRep] = useState(false);
  const [newAttachmentName, setNewAttachmentName] = useState('');
  const [newAttachmentDataUrl, setNewAttachmentDataUrl] = useState('');
  const [newVideoUrl, setNewVideoUrl] = useState('');
  const [draftQuestions, setDraftQuestions] = useState<DraftQuestion[]>([
    makeBlankQuestion('Physics', 1),
  ]);
  const [creatingExam, setCreatingExam] = useState(false);

  useEffect(() => {
    setNewPaperCode(ACSEE_SYLLABUS[newSubject].papers[0].code);
    setDraftQuestions((prev) =>
      prev.map((q) => ({
        ...q,
        topic: ACSEE_SYLLABUS[newSubject].topics.includes(q.topic)
          ? q.topic
          : ACSEE_SYLLABUS[newSubject].topics[0],
      }))
    );
  }, [newSubject]);

  useEffect(() => {
    if (!scanExamId && exams[0]) {
      setScanExamId(exams[0].id);
    }
  }, [scanExamId, exams]);

  useEffect(() => {
    if (!arenaExamId && mcqArenaExams[0]) {
      setArenaExamId(mcqArenaExams[0].id);
    }
  }, [arenaExamId, mcqArenaExams]);

  useEffect(() => {
    if (!activeExam) return;
    const tick = () => {
      const secs = Math.max(0, Math.floor((activeExam.session.expiresAt - Date.now()) / 1000));
      setRemainingSeconds(secs);
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [activeExam]);

  const filteredExams = useMemo(
    () => exams.filter((e) => subjectFilter === 'All' || e.subject === subjectFilter),
    [exams, subjectFilter]
  );

  const teacherStudentUsernames = useMemo(() => {
    const set = new Set<string>();
    if (!isTeacher) return set;
    const teacherClasses = classes.filter(
      (c) =>
        c.teacherUsername === currentUser.username ||
        (currentUser.classCode && c.classCode.toUpperCase() === currentUser.classCode.toUpperCase())
    );
    const codes = new Set<string>(teacherClasses.map((c) => c.classCode.toUpperCase()));
    if (currentUser.classCode) codes.add(currentUser.classCode.toUpperCase());
    for (const cls of teacherClasses) {
      for (const uname of cls.memberUsernames) {
        const u = users.find((x) => x.username === uname);
        if (u?.role === 'student') set.add(u.username);
      }
    }
    for (const u of users) {
      if (u.role === 'student' && u.classCode && codes.has(u.classCode.toUpperCase())) {
        set.add(u.username);
      }
    }
    return set;
  }, [isTeacher, classes, users, currentUser.username, currentUser.classCode]);

  const visibleAttempts = useMemo(() => {
    if (isAdmin) return [];
    if (isTeacher) {
      return attempts.filter((a) => teacherStudentUsernames.has(a.studentUsername));
    }
    if (isParent) {
      return currentUser.connectedChildUsername
        ? attempts.filter((a) => a.studentUsername === currentUser.connectedChildUsername)
        : [];
    }
    return attempts.filter((a) => a.studentUsername === currentUser.username);
  }, [attempts, currentUser, isTeacher, isAdmin, isParent, teacherStudentUsernames]);

  const visibleActiveSessions = useMemo(() => {
    if (!isTeacher) return [];
    return activeSessions.filter((s) => teacherStudentUsernames.has(s.studentUsername));
  }, [isTeacher, activeSessions, teacherStudentUsernames]);

  const activeArena = useMemo(
    () =>
      arenas.find(
        (r) =>
          (r.hostUsername === currentUser.username || r.guestUsername === currentUser.username) &&
          r.status !== 'finished'
      ) || arenas[0],
    [arenas, currentUser.username]
  );

  const selectedAttempt = visibleAttempts.find((a) => a.id === selectedAttemptId);
  const selectedAttemptExam = selectedAttempt ? exams.find((e) => e.id === selectedAttempt.examId) : undefined;

  useEffect(() => {
    if (!selectedAttempt) {
      setMarkOverrides({});
      return;
    }
    const init: Record<string, number> = {};
    for (const qr of selectedAttempt.questionResults) {
      init[qr.questionId] = qr.marksAwarded;
    }
    setMarkOverrides(init);
  }, [selectedAttemptId]);

  const handleBeginExam = async (exam: ExamItem) => {
    setExamError(null);
    setLatestSubmitted(null);
    try {
      const { session, questions } = await onStartExam(exam.id);
      setActiveExam({ exam, session, questions });
      setAnswers({});
      setWrittenAnswers({});
      setRemainingSeconds(exam.durationMinutes * 60);
    } catch (err: any) {
      setExamError(err?.message || 'Unable to start exam.');
    }
  };

  const handleSubmitActiveExam = async (forceExpiredTest = false) => {
    if (!activeExam || submittingExam) return;
    setExamError(null);
    setSubmittingExam(true);
    try {
      const attempt = await onSubmitExam(activeExam.exam.id, {
        sessionId: activeExam.session.sessionId,
        answers,
        writtenAnswers,
        mode:
          activeExam.exam.competitionScope === 'school_to_school'
            ? 'school_competition'
            : activeExam.exam.competitionScope === 'class_to_class'
              ? 'class_competition'
              : 'digital',
        forceExpiredTest,
      });
      setLatestSubmitted(attempt);
      setActiveExam(null);
    } catch (err: any) {
      setExamError(err?.message || 'Submission rejected.');
    } finally {
      setSubmittingExam(false);
    }
  };

  const handleScanFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanMimeType(file.type || 'image/jpeg');
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setScanImageBase64(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRunScanMarking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scanExamId || (!scanImageBase64 && !scanNotes.trim())) return;
    setScanLoading(true);
    setExamError(null);
    try {
      const res = await onScanGradeExam({
        examId: scanExamId,
        imageBase64: scanImageBase64 || undefined,
        mimeType: scanMimeType,
        handwrittenNotes: scanNotes || undefined,
      });
      setScanResult(res);
    } catch (err: any) {
      setExamError(err?.message || 'Physical scan grading failed.');
    } finally {
      setScanLoading(false);
    }
  };

  const selectedPaperMeta = ACSEE_SYLLABUS[newSubject].papers.find((p) => p.code === newPaperCode);

  const updateDraftQuestion = (idx: number, patch: Partial<DraftQuestion>) => {
    setDraftQuestions((prev) => prev.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
  };

  const handleCreateExamSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setExamError(null);
    if (!newTitle.trim()) {
      setExamError('Enter an exam title.');
      return;
    }
    if (draftQuestions.length === 0) {
      setExamError('Include at least one question.');
      return;
    }
    for (let i = 0; i < draftQuestions.length; i++) {
      const q = draftQuestions[i];
      if (!q.prompt.trim()) {
        setExamError(`Question ${i + 1} needs a question prompt.`);
        return;
      }
      if (q.questionType === 'mcq' && q.options.some((o) => !o.trim())) {
        setExamError(`Question ${i + 1} (MCQ) needs all 4 options filled in.`);
        return;
      }
      if (q.questionType !== 'mcq' && !q.expectedAnswer.trim() && !q.markingPointsText.trim()) {
        setExamError(`Question ${i + 1} (${QUESTION_TYPE_LABELS[q.questionType]}) needs an expected answer or marking rubric.`);
        return;
      }
    }

    const effectiveKind = isTeacherOrAdmin ? newKind : 'past_paper';
    const effectiveScope = isTeacherOrAdmin ? newScope : 'individual';
    const hasNonMcq = draftQuestions.some((q) => q.questionType !== 'mcq');

    setCreatingExam(true);
    try {
      await onCreateExam({
        title: newTitle.trim(),
        subject: newSubject,
        paperCode: newPaperCode.trim(),
        acseeSectionFormat: selectedPaperMeta?.format,
        kind: effectiveKind,
        competitionScope: effectiveScope,
        antiRepetition: isTeacherOrAdmin ? newAntiRep : false,
        requiresTeacherReview: effectiveKind === 'teacher_exam' || hasNonMcq,
        attachmentName: newAttachmentName.trim() || undefined,
        attachmentDataUrl: newAttachmentDataUrl || undefined,
        videoAttachmentUrl: newVideoUrl.trim() || undefined,
        questions: draftQuestions.map((q) => ({
          questionType: q.questionType,
          topic: q.topic,
          section: q.section,
          prompt: q.prompt.trim(),
          options: q.questionType === 'mcq' ? q.options.map((o) => o.trim()) : [],
          correctIndex: q.questionType === 'mcq' ? q.correctIndex : -1,
          expectedAnswer: q.questionType !== 'mcq' ? q.expectedAnswer.trim() : undefined,
          markingPoints:
            q.questionType !== 'mcq'
              ? q.markingPointsText
                  .split('\n')
                  .map((l) => l.trim())
                  .filter(Boolean)
              : undefined,
          marks: Math.max(1, Number(q.marks) || (q.section === 'Section B' ? 15 : 10)),
          explanation:
            q.explanation.trim() ||
            q.expectedAnswer.trim() ||
            'Checked via standard NECTA ACSEE marking scheme.',
        })),
      });
      setNewTitle('');
      setNewAttachmentName('');
      setNewAttachmentDataUrl('');
      setNewVideoUrl('');
      setDraftQuestions([makeBlankQuestion(newSubject, 1)]);
      setSubTab('exams');
    } catch (err: any) {
      setExamError(err?.message || 'Unable to publish exam.');
    } finally {
      setCreatingExam(false);
    }
  };

  const handleReleaseWithOverrides = async (attemptId: string) => {
    setReleasingId(attemptId);
    try {
      await onReleaseAttempt(
        attemptId,
        teacherNotes[attemptId] || 'Verified and released by teacher.',
        selectedAttemptId === attemptId ? markOverrides : undefined
      );
    } catch (err: any) {
      setExamError(err?.message || 'Unable to release attempt.');
    } finally {
      setReleasingId(null);
    }
  };

  const visibleSubTabs: Array<[typeof subTab, string]> = isParent
    ? [
        ['results', "My Child's ACSEE Results"],
        ['exams', 'ACSEE Paper Directory'],
      ]
    : isAdmin
      ? [
          ['exams', 'Exams & Past Papers'],
          ['results', 'App General Performance'],
          ['create', 'Publish Exam / Competition'],
        ]
      : [
          ['exams', 'Exams & Past Papers'],
          ['scan', 'Physical Paper Scan'],
          ['arena', '1v1 Exam Arena'],
          ['results', isTeacher ? 'My Students Results & Release' : 'My Results & Correction Door'],
          ['create', isTeacher ? 'Create Exam / Past Paper' : 'Upload Past Paper'],
        ];

  return (
    <div className="space-y-6">
      {/* Sub-tabs & Role-Gated Teacher Live Proctor Counter */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div className="flex flex-wrap items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
          {visibleSubTabs.map(([id, label]) => (
            <button
              key={id}
              onClick={() => setSubTab(id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                subTab === id
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {isTeacher ? (
          <div className="flex items-center gap-3 text-xs text-slate-700 dark:text-slate-300">
            <Users className="w-4 h-4 text-sky-700 dark:text-sky-400" />
            <span className="font-medium tabular-nums">
              My Students Live Sitting:{' '}
              <strong className="text-slate-900 dark:text-slate-100">{visibleActiveSessions.length}</strong>
            </span>
          </div>
        ) : isAdmin ? (
          <div className="flex items-center gap-3 text-xs text-slate-700 dark:text-slate-300">
            <Users className="w-4 h-4 text-sky-700 dark:text-sky-400" />
            <span className="font-medium tabular-nums">
              Platform Live Sittings:{' '}
              <strong className="text-slate-900 dark:text-slate-100">
                {appPerformance?.liveExamSittingCount ?? 0}
              </strong>
            </span>
          </div>
        ) : (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            NECTA ACSEE Standard · Physics (131) & Advanced Mathematics (142) · 3-Hour Timed Format
          </p>
        )}
      </div>

      {examError && (
        <div className="px-4 py-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-900 dark:text-rose-200 text-sm rounded-lg flex items-center justify-between gap-4">
          <span>{examError}</span>
          <button onClick={() => setExamError(null)} className="text-xs font-medium underline shrink-0">
            Close
          </button>
        </div>
      )}

      {latestSubmitted && (
        <div className="px-5 py-4 bg-teal-50 dark:bg-teal-950/50 border border-teal-200 dark:border-teal-900 rounded-xl flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-teal-950 dark:text-teal-100">
              Instant Marking Complete: {latestSubmitted.score}/{latestSubmitted.totalMarks} ({latestSubmitted.percentage}%) · ACSEE Grade {latestSubmitted.acseeGrade}
            </p>
            <p className="text-xs text-teal-800 dark:text-teal-300 mt-0.5">
              Status:{' '}
              {latestSubmitted.status === 'pending_review'
                ? 'Pending teacher review before official release'
                : 'Released — inspect Correction Door'}
            </p>
          </div>
          <button
            onClick={() => {
              setSelectedAttemptId(latestSubmitted.id);
              setSubTab('results');
            }}
            className="px-3 py-1.5 text-xs font-medium bg-teal-800 text-white rounded-lg hover:bg-teal-900 whitespace-nowrap shrink-0"
          >
            Open Result & Corrections
          </button>
        </div>
      )}

      {/* Active 3-Hour Timed Exam Sitting View */}
      {activeExam && (
        <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
            <div>
              <p className="text-xs font-medium text-sky-700 dark:text-sky-400">
                {activeExam.exam.subject} · {activeExam.exam.paperCode} · Strict 3-Hour Timed Session
              </p>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                {activeExam.exam.title}
              </h2>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3.5 py-2 bg-slate-900 dark:bg-slate-800 text-white rounded-lg font-mono text-sm tabular-nums">
                <Clock className="w-4 h-4 text-amber-400" />
                <span>{formatCountdown(remainingSeconds)}</span>
              </div>
              <button
                onClick={() => setActiveExam(null)}
                className="px-3 py-2 text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
            </div>
          </div>

          <div className="space-y-6">
            {activeExam.questions.map((q, idx) => {
              const qType: ExamQuestionType = q.questionType || 'mcq';
              const writtenVal = writtenAnswers[q.id] || '';
              return (
                <div key={q.id} className="space-y-3 pb-5 border-b border-slate-100 dark:border-slate-800 last:border-0">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-relaxed">
                      {idx + 1}. [{q.section ? `${q.section} · ` : ''}
                      {q.topic} · {QUESTION_TYPE_LABELS[qType]} · {q.marks} Marks] {q.prompt}
                    </p>
                  </div>

                  {qType === 'mcq' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {q.options.map((opt, oIdx) => {
                        const checked = answers[q.id] === oIdx;
                        return (
                          <button
                            key={oIdx}
                            type="button"
                            onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: oIdx }))}
                            className={`text-left px-4 py-2.5 text-sm rounded-lg border transition-colors ${
                              checked
                                ? 'bg-sky-50 dark:bg-sky-950/60 border-sky-600 dark:border-sky-500 text-sky-950 dark:text-sky-100 font-medium'
                                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/70'
                            }`}
                          >
                            <span className="font-mono text-xs mr-2">{String.fromCharCode(65 + oIdx)}.</span>
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {qType === 'proof'
                            ? 'Show full step-by-step derivation, assumptions, inductive/logical steps, and Q.E.D. conclusion.'
                            : qType === 'explanation'
                              ? 'State the physical/mathematical principle clearly, explain cause-and-effect, and give equations.'
                              : 'Show intermediate working clearly with SI units or exact algebraic expressions.'}
                        </span>
                        <div className="flex flex-wrap items-center gap-1">
                          {STEM_SYMBOLS.map((sym) => (
                            <button
                              key={sym}
                              type="button"
                              onClick={() =>
                                setWrittenAnswers((prev) => ({
                                  ...prev,
                                  [q.id]: `${prev[q.id] || ''}${sym}`,
                                }))
                              }
                              className="px-2 py-1 text-xs font-mono bg-slate-100 dark:bg-slate-800 hover:bg-sky-100 dark:hover:bg-sky-900 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded"
                              title={`Insert ${sym}`}
                            >
                              {sym}
                            </button>
                          ))}
                        </div>
                      </div>
                      <textarea
                        rows={qType === 'proof' ? 6 : 4}
                        value={writtenVal}
                        onChange={(e) =>
                          setWrittenAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
                        }
                        placeholder={
                          qType === 'proof'
                            ? 'Write step-by-step proof here (e.g., Base case n = 1..., Inductive hypothesis..., Q.E.D.)...'
                            : qType === 'explanation'
                              ? 'Write your structured scientific / mathematical explanation...'
                              : 'Write your step-by-step calculation and final answer...'
                        }
                        className="w-full px-3.5 py-2.5 text-sm font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-lg focus:outline-none focus:border-sky-600"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Note: Server blocks all submissions once the 3-hour timer reaches 00:00:00. Non-MCQ answers are rubric-graded immediately and verified by your teacher.
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleSubmitActiveExam(true)}
                disabled={submittingExam}
                className="px-3 py-2 text-xs font-medium border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/50 whitespace-nowrap shrink-0"
              >
                Test Expired Block
              </button>
              <button
                onClick={() => handleSubmitActiveExam(false)}
                disabled={remainingSeconds <= 0 || submittingExam}
                className="px-5 py-2 text-xs font-medium bg-slate-900 dark:bg-sky-600 text-white rounded-lg hover:bg-slate-800 dark:hover:bg-sky-700 disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                {submittingExam ? 'Grading Submission...' : 'Submit for Instant Marking'}
              </button>
            </div>
          </div>
        </div>
      )}

      {subTab === 'exams' && !activeExam && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                ACSEE Physics & Mathematics Exams
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Perform teacher-assigned exams, structured explanations, proofs, or past papers (3-hour strict timer). Download any paper with {config.appName} watermark.
              </p>
            </div>
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
              {(['All', 'Physics', 'Mathematics'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSubjectFilter(s)}
                  className={`px-3 py-1 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${
                    subjectFilter === s
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {isTeacher && visibleActiveSessions.length > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
              <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100 mb-2">
                Teacher Proctor Feed — My Students Currently Performing Exams ({visibleActiveSessions.length})
              </h3>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {visibleActiveSessions.map((s) => (
                  <div key={s.sessionId} className="py-2 flex items-center justify-between gap-4">
                    <span className="font-medium text-slate-900 dark:text-slate-100">{s.studentName}</span>
                    <span className="text-slate-600 dark:text-slate-400">{s.examTitle}</span>
                    <span className="font-mono text-slate-500 dark:text-slate-400">
                      Started {new Date(s.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {filteredExams.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center space-y-3">
              <FileText className="w-8 h-8 text-slate-400 mx-auto" />
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                No Live Exams Published Yet
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                Only live user-created ACSEE exams and past papers appear here. Publish an exam or past paper to make it available to sit and download.
              </p>
              {!isParent && (
                <button
                  onClick={() => setSubTab('create')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-slate-900 dark:bg-sky-600 text-white rounded-lg hover:bg-slate-800"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {isTeacherOrAdmin ? 'Create Exam / Past Paper' : 'Upload Past Paper'}
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {filteredExams.map((ex) => {
                const liked = currentUser.likedExamIds.includes(ex.id);
                const saved = currentUser.savedExamIds.includes(ex.id);
                const writtenCount = ex.questions.filter((q) => (q.questionType || 'mcq') !== 'mcq').length;
                return (
                  <div
                    key={ex.id}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between space-y-4"
                  >
                    <div className="space-y-2">
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {ex.subject} · Paper {ex.paperCode} · {ex.kind.replace('_', ' ')} · {ex.durationMinutes} min
                      </p>
                      <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 leading-snug">
                        {ex.title}
                      </h3>
                      {ex.acseeSectionFormat && (
                        <p className="text-xs text-sky-900 dark:text-sky-200 bg-sky-50 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-900 rounded-md px-2.5 py-1.5">
                          {ex.acseeSectionFormat}
                        </p>
                      )}
                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        By {ex.creatorName} · {ex.schoolName} · {ex.questions.length} Questions
                        {writtenCount > 0 ? ` (${writtenCount} Structured/Proof)` : ' (Objective MCQ)'}
                        {ex.competitionCode ? ` · Competition Code: ${ex.competitionCode}` : ''}
                      </p>
                      {ex.joinedParticipants && ex.joinedParticipants.length > 0 && (
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Joined Entities ({ex.joinedParticipants.length}): {ex.joinedParticipants.join(', ')}
                        </p>
                      )}
                      {ex.antiRepetition && (
                        <p className="inline-flex items-center gap-1 text-xs font-medium text-amber-800 dark:text-amber-300">
                          <Lock className="w-3.5 h-3.5" />
                          Anti-Repetition Enabled (1 attempt, randomized order)
                        </p>
                      )}
                    </div>

                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                        <button
                          onClick={() => onReactExam(ex.id, 'like')}
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 ${
                            liked ? 'text-rose-600 dark:text-rose-400 font-medium' : ''
                          }`}
                        >
                          <Heart className="w-3.5 h-3.5" />
                          <span className="tabular-nums">{ex.likes}</span>
                        </button>
                        <button
                          onClick={() => onReactExam(ex.id, 'save')}
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 ${
                            saved ? 'text-sky-700 dark:text-sky-400 font-medium' : ''
                          }`}
                        >
                          <Bookmark className="w-3.5 h-3.5" />
                          <span className="tabular-nums">{ex.saves}</span>
                        </button>
                        <button
                          onClick={() => onReactExam(ex.id, 'share')}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <Share2 className="w-3.5 h-3.5" />
                          <span className="tabular-nums">{ex.shares}</span>
                        </button>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {isTeacherOrAdmin && (
                          <button
                            onClick={() => onToggleAntiRep(ex.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
                          >
                            <ShieldCheck className="w-3.5 h-3.5" />
                            {ex.antiRepetition ? 'Disable Anti-Rep' : 'Enable Anti-Rep'}
                          </button>
                        )}
                        <button
                          onClick={() => downloadWatermarkedExamPdf(ex, config.appName)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/50 text-sky-900 dark:text-sky-200 rounded-lg hover:bg-sky-100 dark:hover:bg-sky-900/60 whitespace-nowrap shrink-0"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Download Exam (PDF)
                        </button>
                        {ex.attachmentDataUrl && (
                          <button
                            onClick={() =>
                              downloadDataUrlFile(
                                ex.attachmentDataUrl!,
                                ex.attachmentName || `${ex.title.replace(/[^a-z0-9]/gi, '_')}.pdf`
                              )
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            Download Attached File
                          </button>
                        )}
                        {!isParent && (
                          <button
                            onClick={() => handleBeginExam(ex)}
                            className="px-3.5 py-1.5 text-xs font-medium bg-slate-900 dark:bg-sky-600 text-white rounded-lg hover:bg-slate-800 dark:hover:bg-sky-700 whitespace-nowrap shrink-0"
                          >
                            Perform Exam
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {subTab === 'scan' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={handleRunScanMarking}
            className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4"
          >
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Physical Exam Scan & Instant Marking
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Perform your Physics or Mathematics exam physically on paper, scan/upload your sheet (or enter scanned answers), and submit for Gemini AI instant marking + teacher review before release.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Select Exam Paper
              </label>
              <select
                value={scanExamId}
                onChange={(e) => setScanExamId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              >
                {exams.length === 0 ? (
                  <option value="">No exams published yet</option>
                ) : (
                  exams.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.subject} · {e.paperCode} — {e.title}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Upload / Scan Answer Sheet Photo
              </label>
              <label className="flex items-center justify-center gap-2 px-4 py-6 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/70 text-sm text-slate-600 dark:text-slate-300">
                <Camera className="w-5 h-5 text-sky-700 dark:text-sky-400" />
                <span>
                  {scanImageBase64
                    ? 'Answer sheet image attached (click to replace)'
                    : 'Choose photo or camera scan of physical paper'}
                </span>
                <input type="file" accept="image/*" capture="environment" onChange={handleScanFile} className="hidden" />
              </label>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Optional Handwritten Answer Transcript (e.g. Q1: B, Q2: Proof steps...)
              </label>
              <textarea
                rows={3}
                value={scanNotes}
                onChange={(e) => setScanNotes(e.target.value)}
                placeholder="Write your paper answers or derivation notes if testing without a photo..."
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg"
              />
            </div>

            <button
              type="submit"
              disabled={scanLoading || (!scanImageBase64 && !scanNotes.trim())}
              className="w-full px-4 py-2.5 text-xs font-medium bg-slate-900 dark:bg-sky-600 text-white rounded-lg hover:bg-slate-800 dark:hover:bg-sky-700 disabled:opacity-50"
            >
              {scanLoading ? 'Scanning & Marking with Gemini Vision AI...' : 'Scan & Submit for Instant Marking'}
            </button>
          </form>

          <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Instant Scan Evaluation Output
            </h3>
            {!scanResult ? (
              <p className="text-sm text-slate-500 dark:text-slate-400 py-10">
                Submit a scanned paper photo or transcript to see instant marking results and queue for teacher approval.
              </p>
            ) : (
              <div className="space-y-4">
                <div className="p-4 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg space-y-1">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Provisional Score: {scanResult.attempt.score}/{scanResult.attempt.totalMarks} ({scanResult.attempt.percentage}%) · Grade {scanResult.attempt.acseeGrade}
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">{scanResult.scanSummary}</p>
                  <p className="text-xs text-amber-800 dark:text-amber-300 font-medium pt-1">
                    Status: Queued for Teacher Review before Official Release
                  </p>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                  {scanResult.attempt.questionResults.map((qr, i) => (
                    <div key={qr.questionId} className="py-2 flex items-center justify-between text-slate-800 dark:text-slate-200">
                      <span>
                        Q{i + 1} · {qr.topic}
                      </span>
                      <span className="font-mono text-xs tabular-nums">
                        +{qr.marksAwarded}/{qr.maxMarks} marks
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {subTab === 'arena' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 space-y-5">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                1v1 Exam Competition (Live Gaming Mode)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Challenge another student to solve an ACSEE MCQ duel simultaneously over WebSockets.
              </p>
              <select
                value={arenaExamId}
                onChange={(e) => setArenaExamId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              >
                {mcqArenaExams.length === 0 ? (
                  <option value="">No MCQ exam available yet</option>
                ) : (
                  mcqArenaExams.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.subject}: {e.title}
                    </option>
                  ))
                )}
              </select>
              <button
                onClick={() => arenaExamId && onArenaCreate(arenaExamId)}
                disabled={!arenaExamId}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium bg-slate-900 dark:bg-sky-600 text-white rounded-lg hover:bg-slate-800 dark:hover:bg-sky-700 disabled:opacity-50"
              >
                <Swords className="w-4 h-4" />
                Host New 1v1 Duel Room
              </button>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Join Duel by Code</h3>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={arenaJoinCode}
                  onChange={(e) => setArenaJoinCode(e.target.value)}
                  placeholder="DUEL-XXXX"
                  className="flex-1 px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg font-mono uppercase"
                />
                <button
                  onClick={() => {
                    if (arenaJoinCode.trim()) onArenaJoin(arenaJoinCode.trim());
                  }}
                  className="px-4 py-2 text-xs font-medium bg-sky-700 text-white rounded-lg hover:bg-sky-800"
                >
                  Join
                </button>
              </div>

              <div className="pt-2 space-y-2">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Open Rooms ({arenas.length})
                </p>
                {arenas.map((r) => (
                  <div
                    key={r.code}
                    className="p-2.5 border border-slate-200 dark:border-slate-700 rounded-lg flex items-center justify-between text-xs"
                  >
                    <div>
                      <p className="font-mono font-semibold text-slate-900 dark:text-slate-100">{r.code}</p>
                      <p className="text-slate-500 dark:text-slate-400">
                        Host: {r.hostName} · {r.status}
                      </p>
                    </div>
                    {r.status === 'waiting' && r.hostUsername !== currentUser.username && (
                      <button
                        onClick={() => onArenaJoin(r.code)}
                        className="px-2.5 py-1 bg-sky-700 text-white rounded"
                      >
                        Battle
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="lg:col-span-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
            {!activeArena ? (
              <div className="text-center py-16 space-y-2">
                <Swords className="w-8 h-8 text-slate-400 mx-auto" />
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  No Active 1v1 Duel Selected
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Host a duel room or join an opponent’s room code on the left.
                </p>
              </div>
            ) : (
              (() => {
                const duelExam =
                  exams.find((e) => e.id === activeArena.examId) || mcqArenaExams[0] || exams[0];
                const duelMcqQuestions = duelExam
                  ? duelExam.questions.filter((q) => (q.questionType || 'mcq') === 'mcq')
                  : [];
                const isParticipant =
                  activeArena.hostUsername === currentUser.username ||
                  activeArena.guestUsername === currentUser.username;

                return (
                  <div className="space-y-5">
                    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
                      <div>
                        <p className="text-xs font-mono text-sky-700 dark:text-sky-400">
                          Room {activeArena.code} · {activeArena.status.toUpperCase()}
                        </p>
                        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                          {activeArena.examTitle}
                        </h3>
                      </div>
                      <div className="text-xs text-slate-600 dark:text-slate-300 font-mono tabular-nums">
                        {activeArena.hostName}: {activeArena.hostProgress}% vs{' '}
                        {activeArena.guestName || 'Waiting opponent...'}: {activeArena.guestProgress}%
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="p-3 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg">
                        <p className="text-xs font-medium text-slate-700 dark:text-slate-200">
                          {activeArena.hostName} (Player 1)
                        </p>
                        <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full mt-2 overflow-hidden">
                          <div
                            className="h-full bg-sky-600 transition-all"
                            style={{ width: `${activeArena.hostProgress}%` }}
                          />
                        </div>
                        {activeArena.hostScore !== undefined && (
                          <p className="text-xs font-mono font-semibold text-slate-900 dark:text-slate-100 mt-1.5">
                            Final Score: {activeArena.hostScore}%
                          </p>
                        )}
                      </div>
                      <div className="p-3 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg">
                        <p className="text-xs font-medium text-slate-700 dark:text-slate-200">
                          {activeArena.guestName || 'Waiting for Opponent'} (Player 2)
                        </p>
                        <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full mt-2 overflow-hidden">
                          <div
                            className="h-full bg-teal-600 transition-all"
                            style={{ width: `${activeArena.guestProgress}%` }}
                          />
                        </div>
                        {activeArena.guestScore !== undefined && (
                          <p className="text-xs font-mono font-semibold text-slate-900 dark:text-slate-100 mt-1.5">
                            Final Score: {activeArena.guestScore}%
                          </p>
                        )}
                      </div>
                    </div>

                    {isParticipant && activeArena.status !== 'finished' && duelMcqQuestions.length > 0 && (
                      <div className="space-y-4">
                        {duelMcqQuestions.map((q, i) => (
                          <div key={q.id} className="space-y-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                              {i + 1}. {q.prompt}
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {q.options.map((opt, oIdx) => (
                                <button
                                  key={oIdx}
                                  onClick={() => {
                                    const next = { ...arenaAnswers, [q.id]: oIdx };
                                    setArenaAnswers(next);
                                    const pct = Math.round(
                                      (Object.keys(next).length / duelMcqQuestions.length) * 100
                                    );
                                    onArenaProgress(activeArena.code, pct);
                                  }}
                                  className={`text-left px-3 py-2 text-xs rounded-lg border ${
                                    arenaAnswers[q.id] === oIdx
                                      ? 'bg-sky-50 dark:bg-sky-950/60 border-sky-600 text-sky-900 dark:text-sky-100 font-medium'
                                      : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                                  }`}
                                >
                                  {String.fromCharCode(65 + oIdx)}. {opt}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                        <button
                          onClick={() => {
                            let correct = 0;
                            duelMcqQuestions.forEach((q) => {
                              if (arenaAnswers[q.id] === q.correctIndex) correct += 1;
                            });
                            const pct = Math.round((correct / duelMcqQuestions.length) * 100);
                            onArenaFinish(activeArena.code, pct);
                          }}
                          className="px-4 py-2 text-xs font-medium bg-slate-900 dark:bg-sky-600 text-white rounded-lg hover:bg-slate-800 dark:hover:bg-sky-700"
                        >
                          Lock In Duel Score
                        </button>
                      </div>
                    )}
                  </div>
                );
              })()
            )}
          </div>
        </div>
      )}

      {subTab === 'results' && isAdmin && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                App General Assessment Performance
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Platform-wide ACSEE Physics (131) & Mathematics (142) aggregated statistics across all schools and classes.
              </p>
            </div>

            {appPerformance ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="p-4 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg">
                    <p className="text-xs text-slate-500 dark:text-slate-400">Overall Average</p>
                    <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100 tabular-nums mt-1">
                      {appPerformance.overallAveragePct}%
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                      Pass Rate: {appPerformance.overallPassRatePct}%
                    </p>
                  </div>
                  <div className="p-4 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg">
                    <p className="text-xs text-slate-500 dark:text-slate-400">Total Submissions</p>
                    <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100 tabular-nums mt-1">
                      {appPerformance.totalAttempts}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                      {appPerformance.releasedAttempts} Released · {appPerformance.pendingReviewAttempts} Pending
                    </p>
                  </div>
                  {appPerformance.subjectStats.map((s) => (
                    <div
                      key={s.subject}
                      className="p-4 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg"
                    >
                      <p className="text-xs text-slate-500 dark:text-slate-400">{s.subject} Performance</p>
                      <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100 tabular-nums mt-1">
                        {s.averagePct}%
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                        {s.attemptsCount} Papers · {s.passRatePct}% Pass
                      </p>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      ACSEE Grade Distribution Across Platform
                    </h3>
                    <div className="space-y-2">
                      {appPerformance.gradeDistribution.map((g) => {
                        const pct = appPerformance.totalAttempts
                          ? Math.round((g.count / appPerformance.totalAttempts) * 100)
                          : 0;
                        return (
                          <div key={g.grade} className="flex items-center gap-3 text-xs">
                            <span className="font-mono font-bold w-6 text-slate-900 dark:text-slate-100">
                              {g.grade}
                            </span>
                            <div className="flex-1 h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                              <div className="h-full bg-sky-700 dark:bg-sky-500" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="font-mono w-16 text-right text-slate-600 dark:text-slate-400 tabular-nums">
                              {g.count} ({pct}%)
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      School & Class Cohort Aggregates
                    </h3>
                    <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-lg">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                            <th className="py-2 px-3 font-medium">School</th>
                            <th className="py-2 px-3 font-medium">Class Code</th>
                            <th className="py-2 px-3 font-medium text-right">Attempts</th>
                            <th className="py-2 px-3 font-medium text-right">Avg Score</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {appPerformance.schoolCohorts.map((c) => (
                            <tr key={c.classCode}>
                              <td className="py-2.5 px-3 font-medium text-slate-900 dark:text-slate-100">
                                {c.schoolName}
                              </td>
                              <td className="py-2.5 px-3 font-mono text-slate-600 dark:text-slate-400">
                                {c.classCode}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono text-slate-800 dark:text-slate-200 tabular-nums">
                                {c.attemptsCount}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                                {c.attemptsCount ? `${c.averagePct}%` : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                General performance summary unavailable while offline.
              </p>
            )}
          </div>
        </div>
      )}

      {subTab === 'results' && !isAdmin && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {isTeacher
                    ? 'My Students’ Result Board & Release Queue'
                    : isParent
                      ? "My Child's ACSEE Results & Correction Door"
                      : 'My ACSEE Results & Correction Door'}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {isTeacher
                    ? 'Showing strictly results submitted by students enrolled in your classes. Open Correction Door to adjust non-MCQ marks before release.'
                    : isParent
                      ? 'Showing strictly results for your linked child.'
                      : 'Private to your account — other students’ results are hidden. NECTA ACSEE scale (A: 80+, B: 70+, C: 60+, D: 50+, E: 40+, S: 35+, F: <35).'}
                </p>
              </div>
              {isTeacher && visibleAttempts.length > 0 && (
                <button
                  onClick={() =>
                    downloadTeacherResultsPdf(
                      `${currentUser.realName} — My Students ACSEE Results`,
                      visibleAttempts,
                      config.appName
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-slate-900 dark:bg-sky-600 text-white rounded-lg hover:bg-slate-800 dark:hover:bg-sky-700 whitespace-nowrap shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download My Students PDF
                </button>
              )}
            </div>

            {visibleAttempts.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 py-8">
                No exam results found for this account yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                      <th className="py-2 pr-3 font-medium">Candidate</th>
                      <th className="py-2 pr-3 font-medium">Exam</th>
                      <th className="py-2 pr-3 font-medium">Mode</th>
                      <th className="py-2 pr-3 font-medium">Score</th>
                      <th className="py-2 pr-3 font-medium">ACSEE</th>
                      <th className="py-2 pr-3 font-medium">Status</th>
                      <th className="py-2 text-right font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {visibleAttempts.map((att) => (
                      <tr key={att.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="py-3 pr-3">
                          <p className="font-medium text-slate-900 dark:text-slate-100">{att.studentName}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {att.schoolName} · {att.classCode}
                          </p>
                        </td>
                        <td className="py-3 pr-3">
                          <p className="font-medium text-slate-900 dark:text-slate-100">{att.examTitle}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{att.subject}</p>
                        </td>
                        <td className="py-3 pr-3 text-xs text-slate-600 dark:text-slate-400">
                          {att.mode.replace('_', ' ')}
                        </td>
                        <td className="py-3 pr-3 font-mono text-slate-900 dark:text-slate-100 tabular-nums">
                          {att.score}/{att.totalMarks} ({att.percentage}%)
                        </td>
                        <td className="py-3 pr-3 font-mono font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                          {att.acseeGrade} ({att.acseePoints})
                        </td>
                        <td className="py-3 pr-3 text-xs">
                          {att.status === 'released' ? (
                            <span className="inline-flex items-center gap-1 text-teal-700 dark:text-teal-400 font-medium">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Released
                            </span>
                          ) : (
                            <span className="text-amber-700 dark:text-amber-400 font-medium">Pending Review</span>
                          )}
                        </td>
                        <td className="py-3 text-right space-x-2 whitespace-nowrap">
                          {isTeacher && att.status === 'pending_review' && (
                            <button
                              onClick={() => handleReleaseWithOverrides(att.id)}
                              disabled={releasingId === att.id}
                              className="px-2.5 py-1 text-xs font-medium bg-teal-700 text-white rounded-md hover:bg-teal-800 disabled:opacity-50"
                            >
                              {releasingId === att.id ? 'Releasing...' : 'Confirm & Release'}
                            </button>
                          )}
                          <button
                            onClick={() => setSelectedAttemptId(att.id)}
                            className="px-2.5 py-1 text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            Correction Door
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Correction Door System */}
          {selectedAttempt && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
                <div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    Correction Door — {selectedAttempt.examTitle}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {selectedAttempt.studentName} · Score {selectedAttempt.score}/{selectedAttempt.totalMarks} ({selectedAttempt.percentage}% · ACSEE Grade {selectedAttempt.acseeGrade})
                  </p>
                </div>
                {(currentUser.role === 'teacher' || currentUser.role === 'admin') &&
                  selectedAttempt.status === 'pending_review' && (
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        placeholder="Add teacher review note..."
                        value={teacherNotes[selectedAttempt.id] || ''}
                        onChange={(e) =>
                          setTeacherNotes((p) => ({ ...p, [selectedAttempt.id]: e.target.value }))
                        }
                        className="px-3 py-1.5 text-xs border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg"
                      />
                      <button
                        onClick={() => handleReleaseWithOverrides(selectedAttempt.id)}
                        disabled={releasingId === selectedAttempt.id}
                        className="px-3 py-1.5 text-xs font-medium bg-teal-700 text-white rounded-lg hover:bg-teal-800 disabled:opacity-50"
                      >
                        {releasingId === selectedAttempt.id ? 'Releasing...' : 'Save Marks & Release Result'}
                      </button>
                    </div>
                  )}
              </div>

              {selectedAttempt.teacherNote && (
                <p className="text-xs text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700">
                  <strong>Teacher Review Note:</strong> {selectedAttempt.teacherNote}
                </p>
              )}

              {selectedAttempt.status !== 'released' &&
              currentUser.role !== 'teacher' &&
              currentUser.role !== 'admin' ? (
                <p className="text-sm text-amber-800 dark:text-amber-300 py-4">
                  Corrections are locked until your teacher reviews and releases this result.
                </p>
              ) : (
                <div className="space-y-4">
                  {selectedAttempt.questionResults.map((qr, i) => {
                    const qObj = selectedAttemptExam?.questions.find((q) => q.id === qr.questionId);
                    const qType = qr.questionType || qObj?.questionType || 'mcq';
                    const isFull = qr.marksAwarded >= qr.maxMarks;
                    const isPartial = qr.marksAwarded > 0 && qr.marksAwarded < qr.maxMarks;
                    const canOverride =
                      (isTeacher || isAdmin) && selectedAttempt.status === 'pending_review';

                    return (
                      <div
                        key={qr.questionId}
                        className="p-4 border border-slate-200 dark:border-slate-700 rounded-lg space-y-2.5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <span className="font-semibold text-slate-700 dark:text-slate-200">
                            Q{i + 1} · {qr.topic} · {QUESTION_TYPE_LABELS[qType]}
                          </span>
                          <div className="flex items-center gap-3">
                            <span
                              className={`font-mono font-semibold ${
                                isFull
                                  ? 'text-teal-700 dark:text-teal-400'
                                  : isPartial
                                    ? 'text-sky-700 dark:text-sky-400'
                                    : 'text-rose-700 dark:text-rose-400'
                              }`}
                            >
                              {isFull
                                ? `Full Marks (+${qr.marksAwarded}/${qr.maxMarks})`
                                : isPartial
                                  ? `Partial Credit (+${qr.marksAwarded}/${qr.maxMarks})`
                                  : `0/${qr.maxMarks} Marks`}
                            </span>
                            {canOverride && (
                              <label className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                                <span>Adjust:</span>
                                <input
                                  type="number"
                                  min={0}
                                  max={qr.maxMarks}
                                  step="0.5"
                                  value={markOverrides[qr.questionId] ?? qr.marksAwarded}
                                  onChange={(e) => {
                                    const raw = Number(e.target.value);
                                    const clamped = Math.max(0, Math.min(qr.maxMarks, Number.isNaN(raw) ? 0 : raw));
                                    setMarkOverrides((prev) => ({
                                      ...prev,
                                      [qr.questionId]: clamped,
                                    }));
                                  }}
                                  className="w-16 px-2 py-1 text-xs font-mono border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded"
                                />
                              </label>
                            )}
                          </div>
                        </div>

                        {qObj && (
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            {qObj.prompt}
                          </p>
                        )}

                        {qType === 'mcq' ? (
                          <p className="text-xs text-slate-600 dark:text-slate-300">
                            Your Answer:{' '}
                            <span className="font-mono font-medium">
                              {qr.selectedIndex >= 0 ? String.fromCharCode(65 + qr.selectedIndex) : 'Blank'}
                            </span>{' '}
                            · Correct Key:{' '}
                            <span className="font-mono font-semibold text-teal-800 dark:text-teal-400">
                              {String.fromCharCode(65 + qr.correctIndex)}
                            </span>
                          </p>
                        ) : (
                          <div className="space-y-2 text-xs">
                            <div className="p-3 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-md">
                              <p className="font-semibold text-slate-700 dark:text-slate-200 mb-1">
                                Student Written Solution:
                              </p>
                              <p className="font-mono whitespace-pre-wrap text-slate-800 dark:text-slate-200">
                                {qr.writtenAnswer?.trim() || 'No written answer submitted.'}
                              </p>
                            </div>

                            {qr.aiFeedback && (
                              <p className="text-sky-900 dark:text-sky-200 bg-sky-50 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-900 p-2.5 rounded-md">
                                <strong>Rubric Evaluation Feedback:</strong> {qr.aiFeedback}
                              </p>
                            )}

                            {(qr.expectedAnswer || qObj?.expectedAnswer) && (
                              <p className="text-teal-900 dark:text-teal-200 bg-teal-50 dark:bg-teal-950/50 border border-teal-200 dark:border-teal-900 p-2.5 rounded-md">
                                <strong>Expected Key Answer:</strong>{' '}
                                {qr.expectedAnswer || qObj?.expectedAnswer}
                              </p>
                            )}

                            {qObj?.markingPoints && qObj.markingPoints.length > 0 && (
                              <div className="p-2.5 bg-slate-50 dark:bg-slate-800/70 rounded-md text-slate-700 dark:text-slate-300">
                                <p className="font-semibold mb-1">Official NECTA Marking Points:</p>
                                <ul className="list-disc pl-4 space-y-0.5">
                                  {qObj.markingPoints.map((pt, idx) => (
                                    <li key={idx}>{pt}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        )}

                        {qObj && (
                          <p className="text-xs text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/70 p-2.5 rounded-md whitespace-pre-wrap">
                            <strong>Worked Solution / Proof:</strong> {qObj.explanation}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {subTab === 'create' && !isParent && (
        <form
          onSubmit={handleCreateExamSubmit}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5 max-w-4xl"
        >
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {isTeacherOrAdmin
                ? 'Create NECTA ACSEE Exam or Competition Paper (Physics 131 & Math 142)'
                : 'Upload Community ACSEE Past Paper (Physics 131 & Math 142)'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Supports multiple questions mixing MCQ, Non-MCQ Structured Solutions, Explanation Questions, and Formal Proofs with {config.appName} watermarked PDF export.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Exam / Past Paper Title
              </label>
              <input
                type="text"
                required
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. ACSEE 2025 Physics Structured & Proof Mock"
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Subject (Strict Physics & Math)
              </label>
              <select
                value={newSubject}
                onChange={(e) => setNewSubject(e.target.value as Subject)}
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              >
                <option value="Physics">Physics (Code 131)</option>
                <option value="Mathematics">Advanced Mathematics (Code 142)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                NECTA ACSEE Paper Format
              </label>
              <select
                value={newPaperCode}
                onChange={(e) => setNewPaperCode(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono"
              >
                {ACSEE_SYLLABUS[newSubject].papers.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.code} — {p.name} ({p.duration})
                  </option>
                ))}
              </select>
              {selectedPaperMeta && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  {selectedPaperMeta.format}
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Assessment Category
              </label>
              <select
                value={isTeacherOrAdmin ? newKind : 'past_paper'}
                onChange={(e) => setNewKind(e.target.value as any)}
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              >
                <option value="past_paper">Community Past Paper (Instant Release)</option>
                {isTeacherOrAdmin && (
                  <option value="teacher_exam">Teacher Assigned Exam (Teacher Review)</option>
                )}
                {isTeacherOrAdmin && (
                  <option value="competition">Class / School Competition Exam (Auto-generates Code)</option>
                )}
              </select>
            </div>
            {isTeacherOrAdmin && (
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Competition Scope
                </label>
                <select
                  value={newScope}
                  onChange={(e) => setNewScope(e.target.value as any)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                >
                  <option value="individual">Individual / Standard</option>
                  <option value="class_to_class">Class-to-Class Competition (CLS-XXXX)</option>
                  <option value="school_to_school">School-to-School Competition (SCH-XXXX)</option>
                </select>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Video / Document Attachment URL
              </label>
              <input
                type="text"
                value={newVideoUrl}
                onChange={(e) => setNewVideoUrl(e.target.value)}
                placeholder="Optional YouTube / Video URL..."
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg"
              />
            </div>
          </div>

          <div className="space-y-3 text-xs">
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                <FileText className="w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={newAttachmentName}
                  onChange={(e) => setNewAttachmentName(e.target.value)}
                  placeholder="Optional attachment file name (e.g. FormulaSheet.pdf)"
                  className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg w-72"
                />
              </label>
              <label className="inline-flex items-center gap-2 text-slate-700 dark:text-slate-300">
                <span>Upload Downloadable Exam File (PDF/Doc/Image):</span>
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.txt,image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 20 * 1024 * 1024) {
                      setExamError('Exam attachment file must be under 20 MB.');
                      return;
                    }
                    setNewAttachmentName(file.name);
                    const reader = new FileReader();
                    reader.onload = () => {
                      if (typeof reader.result === 'string') {
                        setNewAttachmentDataUrl(reader.result);
                      }
                    };
                    reader.readAsDataURL(file);
                  }}
                  className="text-xs text-slate-600 dark:text-slate-300 file:mr-2 file:py-1 file:px-2.5 file:rounded-md file:border-0 file:bg-slate-100 dark:file:bg-slate-800 file:text-slate-700 dark:file:text-slate-200"
                />
              </label>
            </div>
            {newAttachmentDataUrl && (
              <p className="text-[11px] text-teal-700 dark:text-teal-400 font-medium">
                Attached downloadable file ready: {newAttachmentName}
              </p>
            )}
            {isTeacherOrAdmin && (
              <label className="inline-flex items-center gap-2 font-medium text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={newAntiRep}
                  onChange={(e) => setNewAntiRep(e.target.checked)}
                />
                Enable Teacher Anti-Repetition Lock
              </label>
            )}
          </div>

          {/* Multi-Question Builder */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Questions Builder ({draftQuestions.length} Total)
              </h3>
              <button
                type="button"
                onClick={() =>
                  setDraftQuestions((prev) => [...prev, makeBlankQuestion(newSubject, prev.length + 1)])
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-sky-700 text-white rounded-lg hover:bg-sky-800 whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Another Question
              </button>
            </div>

            {draftQuestions.map((dq, qIdx) => (
              <div
                key={dq.id}
                className="p-4 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    Question {qIdx + 1} · NECTA ACSEE Mapped
                  </span>
                  {draftQuestions.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setDraftQuestions((prev) => prev.filter((_, idx) => idx !== qIdx))
                      }
                      className="inline-flex items-center gap-1 text-xs text-rose-700 dark:text-rose-400 hover:underline"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Remove
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Question Format
                    </label>
                    <select
                      value={dq.questionType}
                      onChange={(e) =>
                        updateDraftQuestion(qIdx, {
                          questionType: e.target.value as ExamQuestionType,
                        })
                      }
                      className="w-full px-2.5 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                    >
                      <option value="mcq">Multiple Choice (MCQ)</option>
                      <option value="short_answer">Non-MCQ: Structured Solution</option>
                      <option value="explanation">Non-MCQ: Explanation Question</option>
                      <option value="proof">Non-MCQ: Formal Proof</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                      ACSEE Section
                    </label>
                    <select
                      value={dq.section}
                      onChange={(e) => {
                        const sec = e.target.value as 'Section A' | 'Section B';
                        updateDraftQuestion(qIdx, {
                          section: sec,
                          marks: sec === 'Section B' ? 15 : 10,
                        });
                      }}
                      className="w-full px-2.5 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                    >
                      <option value="Section A">Section A (10 Marks)</option>
                      <option value="Section B">Section B (15 Marks)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Syllabus Topic
                    </label>
                    <select
                      value={dq.topic}
                      onChange={(e) => updateDraftQuestion(qIdx, { topic: e.target.value })}
                      className="w-full px-2.5 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                    >
                      {ACSEE_SYLLABUS[newSubject].topics.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Max Marks
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={dq.marks}
                      onChange={(e) => updateDraftQuestion(qIdx, { marks: Number(e.target.value) })}
                      className="w-full px-2.5 py-2 text-xs font-mono border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                    />
                  </div>
                </div>

                <textarea
                  required
                  rows={2}
                  value={dq.prompt}
                  onChange={(e) => updateDraftQuestion(qIdx, { prompt: e.target.value })}
                  placeholder={
                    dq.questionType === 'proof'
                      ? 'Enter proof prompt (e.g. Prove by mathematical induction that...)'
                      : dq.questionType === 'explanation'
                        ? 'Enter explanation prompt (e.g. Explain why escape velocity depends on...)'
                        : 'Enter Physics or Mathematics question prompt...'
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-lg"
                />

                {dq.questionType === 'mcq' ? (
                  <div className="space-y-2.5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {dq.options.map((val, oIdx) => (
                        <input
                          key={oIdx}
                          required
                          type="text"
                          value={val}
                          onChange={(e) =>
                            updateDraftQuestion(qIdx, {
                              options: dq.options.map((x, idx) =>
                                idx === oIdx ? e.target.value : x
                              ),
                            })
                          }
                          placeholder={`Option ${String.fromCharCode(65 + oIdx)}`}
                          className="px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-lg"
                        />
                      ))}
                    </div>
                    <select
                      value={dq.correctIndex}
                      onChange={(e) =>
                        updateDraftQuestion(qIdx, { correctIndex: Number(e.target.value) })
                      }
                      className="px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                    >
                      <option value={0}>Correct Option: A</option>
                      <option value={1}>Correct Option: B</option>
                      <option value={2}>Correct Option: C</option>
                      <option value={3}>Correct Option: D</option>
                    </select>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                        Expected Final Answer / Key Conclusion
                      </label>
                      <input
                        type="text"
                        value={dq.expectedAnswer}
                        onChange={(e) =>
                          updateDraftQuestion(qIdx, { expectedAnswer: e.target.value })
                        }
                        placeholder="e.g. v = sqrt(2GM/R) or Q.E.D. by inductive step for n = k + 1"
                        className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                        NECTA Marking Rubric Points (one criterion per line for Gemini & offline grading)
                      </label>
                      <textarea
                        rows={3}
                        value={dq.markingPointsText}
                        onChange={(e) =>
                          updateDraftQuestion(qIdx, { markingPointsText: e.target.value })
                        }
                        placeholder={`Base case verified for n = 1 (2 marks)\nInductive hypothesis stated for n = k (3 marks)\nInductive step proved for n = k + 1 (5 marks)`}
                        className="w-full px-3 py-2 text-xs font-mono border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-lg"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Worked Solution / Full Proof (shown in Correction Door)
                  </label>
                  <textarea
                    rows={2}
                    value={dq.explanation}
                    onChange={(e) => updateDraftQuestion(qIdx, { explanation: e.target.value })}
                    placeholder="Step-by-step worked solution or full formal proof..."
                    className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-lg"
                  />
                </div>
              </div>
            ))}
          </div>

          <button
            type="submit"
            disabled={creatingExam}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 text-xs font-medium bg-slate-900 dark:bg-sky-600 text-white rounded-lg hover:bg-slate-800 dark:hover:bg-sky-700 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            {creatingExam ? 'Publishing...' : `Publish ${newSubject} (${newPaperCode})`}
          </button>
        </form>
      )}
    </div>
  );
};
