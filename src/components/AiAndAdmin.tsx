import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  BrainCircuit,
  CheckCircle2,
  ExternalLink,
  ImagePlus,
  Lock,
  MailCheck,
  MessageCircle,
  Settings,
  ShieldCheck,
  Trash2,
  Video,
  Wrench,
} from 'lucide-react';
import type {
  AppConfig,
  EmailDispatchLog,
  ErrorReport,
  ExamAttempt,
  Subject,
  UserProfile,
} from '../types';
import { getYouTubeEmbedUrl, isDirectPlayableVideo } from '../utils/media';

interface TutorPlan {
  diagnosisSummary: string;
  weakAreas: Array<{
    topic: string;
    mistakePattern: string;
    whatToDo: string;
    practiceExercise: string;
    solutionGuide: string;
  }>;
  nextStudyPlan: string;
}

type ErrorCategory = NonNullable<ErrorReport['category']>;

interface Props {
  config: AppConfig;
  currentUser: UserProfile;
  users: UserProfile[];
  attempts: ExamAttempt[];
  errorReports: ErrorReport[];
  emailDispatches: EmailDispatchLog[];
  onRunTutor: (customQuestion?: string) => Promise<TutorPlan>;
  onRunAiHub: (subject: Subject, query: string) => Promise<string>;
  onSubmitErrorReport: (data: {
    target: 'admin' | 'teacher';
    subject: Subject | 'System';
    category: ErrorCategory;
    title: string;
    description: string;
  }) => Promise<void>;
  onRunFixAgent: (reportId: string) => Promise<void>;
  onResolveErrorReport: (reportId: string, resolutionNote: string) => Promise<void>;
  onUpdateConfig: (data: Partial<AppConfig>) => Promise<void>;
  onSetAdminPasskey: (passkey: string) => Promise<void>;
  onTriggerDigest: (confirmed: boolean) => Promise<void>;
  onSendAdminEmail: (data: { confirmed: boolean; subject: string; message: string }) => Promise<void>;
  onCreateAd: (data: {
    title: string;
    subtitle: string;
    mediaType?: 'image' | 'video';
    imageUrl?: string;
    videoUrl?: string;
    ctaLabel?: string;
    ctaSection?: 'workspace' | 'exams' | 'library' | 'lab' | 'ai';
    externalUrl?: string;
    placement: 'workspace' | 'library' | 'all';
  }) => Promise<void>;
  onToggleAd: (id: string) => Promise<void>;
  onDeleteAd: (id: string) => Promise<void>;
}

const MAJOR_AI_LINKS = [
  { name: 'WolframAlpha', focus: 'Symbolic Calculus, ODEs & Physics Constants', url: 'https://www.wolframalpha.com/' },
  { name: 'Perplexity AI', focus: 'Cited Scientific & ACSEE Literature Search', url: 'https://www.perplexity.ai/' },
  { name: 'GeoGebra', focus: '3D Vectors, Conics & Function Plotting', url: 'https://www.geogebra.org/calculator' },
  { name: 'Desmos Graphing', focus: 'Interactive Calculus & Curve Analysis', url: 'https://www.desmos.com/calculator' },
  { name: 'PhET Simulations', focus: 'University of Colorado Physics Experiments', url: 'https://phet.colorado.edu/en/simulations/filter?subjects=physics' },
  { name: 'ChatGPT', focus: 'General Conversational STEM Research', url: 'https://chatgpt.com/' },
];

export const AiAndAdmin: React.FC<Props> = ({
  config,
  currentUser,
  users,
  attempts,
  errorReports,
  emailDispatches,
  onRunTutor,
  onRunAiHub,
  onSubmitErrorReport,
  onRunFixAgent,
  onResolveErrorReport,
  onUpdateConfig,
  onSetAdminPasskey,
  onTriggerDigest,
  onSendAdminEmail,
  onCreateAd,
  onToggleAd,
  onDeleteAd,
}) => {
  const isTeacher = currentUser.role === 'teacher';
  const isAdmin = currentUser.role === 'admin';
  const isTeacherOrAdmin = isTeacher || isAdmin;
  const isParent = currentUser.role === 'parent';

  const defaultTab: 'tutor' | 'hub' | 'errors' | 'rename' = isParent
    ? 'errors'
    : isAdmin
      ? 'rename'
      : isTeacher
        ? 'errors'
        : 'tutor';

  const [subTab, setSubTab] = useState<'tutor' | 'hub' | 'errors' | 'rename'>(defaultTab);

  // AI Teacher state
  const [tutorQuestion, setTutorQuestion] = useState('');
  const [tutorLoading, setTutorLoading] = useState(false);
  const [tutorPlan, setTutorPlan] = useState<TutorPlan | null>(null);
  const [tutorError, setTutorError] = useState<string | null>(null);

  // AI Research Hub state
  const [hubSubject, setHubSubject] = useState<Subject>('Physics');
  const [hubQuery, setHubQuery] = useState('');
  const [hubLoading, setHubLoading] = useState(false);
  const [hubAnswer, setHubAnswer] = useState<string | null>(null);

  // Error reports state
  const [errTarget, setErrTarget] = useState<'admin' | 'teacher'>('teacher');
  const [errSubject, setErrSubject] = useState<Subject | 'System'>('Physics');
  const [errCategory, setErrCategory] = useState<ErrorCategory>('Exam Question');
  const [errTitle, setErrTitle] = useState('');
  const [errDesc, setErrDesc] = useState('');
  const [errSubmittedMsg, setErrSubmittedMsg] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'ai_diagnosed' | 'resolved'>('all');
  const [resolutionDrafts, setResolutionDrafts] = useState<Record<string, string>>({});
  const [fixingId, setFixingId] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  // Rename / Admin Config state
  const [appNameInput, setAppNameInput] = useState(config.appName);
  const [waChannelInput, setWaChannelInput] = useState(config.whatsappChannelUrl);
  const [waPhoneInput, setWaPhoneInput] = useState(config.supportTeacherPhone);
  const [bannerTitleInput, setBannerTitleInput] = useState(config.featuredBannerTitle);
  const [bannerSubInput, setBannerSubInput] = useState(config.featuredBannerSubtitle);
  const [configSaved, setConfigSaved] = useState(false);
  const [passkeyInput, setPasskeyInput] = useState('');
  const [passkeySaving, setPasskeySaving] = useState(false);
  const [passkeyNotice, setPasskeyNotice] = useState<string | null>(null);

  // Image & Video Ads Manager state (Admin only)
  const [adTitle, setAdTitle] = useState('');
  const [adSubtitle, setAdSubtitle] = useState('');
  const [adMediaType, setAdMediaType] = useState<'image' | 'video'>('image');
  const [adImageUrl, setAdImageUrl] = useState('');
  const [adVideoUrl, setAdVideoUrl] = useState('');
  const [adPlacement, setAdPlacement] = useState<'all' | 'workspace' | 'library'>('all');
  const [adCtaLabel, setAdCtaLabel] = useState('Open Book Store');
  const [adCtaSection, setAdCtaSection] = useState<'library' | 'exams' | 'lab' | 'workspace' | 'ai'>('library');
  const [adExternalUrl, setAdExternalUrl] = useState('');
  const [adSaving, setAdSaving] = useState(false);
  const [adNotice, setAdNotice] = useState<string | null>(null);
  const [brokenAdThumbs, setBrokenAdThumbs] = useState<Record<string, boolean>>({});

  // All-Users Email Confirmation state (Admin only)
  const [emailMode, setEmailMode] = useState<'broadcast' | 'digest'>('broadcast');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailMessage, setEmailMessage] = useState('');
  const [emailConfirmed, setEmailConfirmed] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [emailNotice, setEmailNotice] = useState<string | null>(null);

  const recipientUsers = useMemo(
    () => users.filter((u) => u.email && u.email.includes('@') && u.email !== 'restricted@owner'),
    [users]
  );

  const myWeakTopics = attempts
    .filter((a) => a.studentUsername === currentUser.username)
    .flatMap((a) => a.questionResults.filter((qr) => !qr.isCorrect).map((qr) => `${a.subject}: ${qr.topic}`));

  const filteredReports = useMemo(() => {
    return errorReports.filter((r) => statusFilter === 'all' || r.status === statusFilter);
  }, [errorReports, statusFilter]);

  const reportCounts = useMemo(() => {
    return {
      all: errorReports.length,
      open: errorReports.filter((r) => r.status === 'open').length,
      ai_diagnosed: errorReports.filter((r) => r.status === 'ai_diagnosed').length,
      resolved: errorReports.filter((r) => r.status === 'resolved').length,
    };
  }, [errorReports]);

  const handleAnalyze = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setTutorLoading(true);
    setTutorError(null);
    try {
      const plan = await onRunTutor(tutorQuestion.trim() || undefined);
      setTutorPlan(plan);
    } catch (err: any) {
      setTutorError(err?.message || 'Unable to run AI Teacher analysis.');
    } finally {
      setTutorLoading(false);
    }
  };

  const handleHubSolve = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hubQuery.trim()) return;
    setHubLoading(true);
    setTutorError(null);
    try {
      const ans = await onRunAiHub(hubSubject, hubQuery.trim());
      setHubAnswer(ans);
    } catch (err: any) {
      setTutorError(err?.message || 'AI Hub solver failed.');
    } finally {
      setHubLoading(false);
    }
  };

  const handleCreateReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!errTitle.trim() || !errDesc.trim()) return;
    setTutorError(null);
    try {
      await onSubmitErrorReport({
        target: errTarget,
        subject: errSubject,
        category: errCategory,
        title: errTitle.trim(),
        description: errDesc.trim(),
      });
      setErrTitle('');
      setErrDesc('');
      setErrSubmittedMsg(`Error report sent to ${errTarget === 'admin' ? 'Platform Admin' : 'Class Teacher'}.`);
      setTimeout(() => setErrSubmittedMsg(null), 4000);
    } catch (err: any) {
      setTutorError(err?.message || 'Unable to submit error report.');
    }
  };

  const handleFixError = async (id: string) => {
    setFixingId(id);
    setTutorError(null);
    try {
      await onRunFixAgent(id);
    } catch (err: any) {
      setTutorError(err?.message || 'AI Fix Agent failed.');
    } finally {
      setFixingId(null);
    }
  };

  const handleResolveError = async (id: string) => {
    setResolvingId(id);
    setTutorError(null);
    try {
      await onResolveErrorReport(
        id,
        resolutionDrafts[id]?.trim() || 'Issue verified, patched, and confirmed in ACSEE syllabus.'
      );
      setResolutionDrafts((prev) => ({ ...prev, [id]: '' }));
    } catch (err: any) {
      setTutorError(err?.message || 'Unable to resolve error report.');
    } finally {
      setResolvingId(null);
    }
  };

  const handleAdFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (adMediaType === 'video' && file.size > 25 * 1024 * 1024) {
      setTutorError('Video ad upload must be under 25 MB (or paste a YouTube / MP4 URL below).');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        if (adMediaType === 'video') {
          setAdVideoUrl(reader.result);
        } else {
          setAdImageUrl(reader.result);
        }
      }
    };
    reader.readAsDataURL(file);
  };

  const handleCreateAdSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const hasMedia = adMediaType === 'video' ? adVideoUrl.trim() : adImageUrl.trim();
    if (!adTitle.trim() || !hasMedia) {
      setTutorError(
        adMediaType === 'video'
          ? 'Ad headline and an uploaded video or video/YouTube URL are required.'
          : 'Ad headline and an uploaded image or valid image URL are required.'
      );
      return;
    }
    setAdSaving(true);
    setTutorError(null);
    setAdNotice(null);
    try {
      await onCreateAd({
        title: adTitle.trim(),
        subtitle: adSubtitle.trim(),
        mediaType: adMediaType,
        imageUrl: adMediaType === 'image' ? adImageUrl.trim() : undefined,
        videoUrl: adMediaType === 'video' ? adVideoUrl.trim() : undefined,
        ctaLabel: adCtaLabel.trim() || undefined,
        ctaSection: adCtaSection,
        externalUrl: adExternalUrl.trim() || undefined,
        placement: adPlacement,
      });
      setAdTitle('');
      setAdSubtitle('');
      setAdImageUrl('');
      setAdVideoUrl('');
      setAdExternalUrl('');
      setAdNotice(`${adMediaType === 'video' ? 'Video' : 'Image'} ad uploaded and live on the selected placement.`);
    } catch (err: any) {
      setTutorError(err?.message || 'Unable to publish ad.');
    } finally {
      setAdSaving(false);
    }
  };

  const handleConfirmedEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailConfirmed) {
      setTutorError('Check the Admin Confirmation box before dispatching emails to all registered users.');
      return;
    }
    setEmailSending(true);
    setTutorError(null);
    setEmailNotice(null);
    try {
      if (emailMode === 'digest') {
        await onTriggerDigest(true);
        setEmailNotice(`Confirmed and dispatched queued digest emails to ${recipientUsers.length} registered users.`);
      } else {
        await onSendAdminEmail({
          confirmed: true,
          subject: emailSubject.trim(),
          message: emailMessage.trim(),
        });
        setEmailSubject('');
        setEmailMessage('');
        setEmailNotice(`Admin confirmed and dispatched broadcast email to all ${recipientUsers.length} registered users.`);
      }
      setEmailConfirmed(false);
    } catch (err: any) {
      setTutorError(err?.message || 'Failed to dispatch emails.');
    } finally {
      setEmailSending(false);
    }
  };

  const visibleSubTabs: Array<[typeof subTab, string]> = isParent
    ? [
        ['errors', 'Report Issue & Support'],
        ['hub', 'STEM Research Links'],
      ]
    : isAdmin
      ? [
          ['rename', 'Admin, Video/Image Ads & Email Confirm'],
          ['errors', 'Error Reports & AI Agent'],
          ['hub', 'AI Research & Solving Hub'],
          ['tutor', 'AI Teacher & Analyser'],
        ]
      : isTeacher
        ? [
            ['errors', 'Error Reports & AI Agent'],
            ['tutor', 'AI Teacher & Weakness Analyser'],
            ['hub', 'AI Research & Solving Hub'],
          ]
        : [
            ['tutor', 'AI Teacher & Weakness Analyser'],
            ['hub', 'AI Research & Solving Hub'],
            ['errors', 'Error Reports'],
          ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div className="flex flex-wrap items-center gap-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-lg">
          {visibleSubTabs.map(([id, label]) => (
            <button
              key={id}
              onClick={() => setSubTab(id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                subTab === id
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400">
          ACSEE Physics (131) & Mathematics (142) · {currentUser.role.toUpperCase()} Access
        </p>
      </div>

      {tutorError && (
        <div className="px-4 py-3 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-100 text-sm rounded-lg">
          {tutorError}
        </div>
      )}

      {subTab === 'tutor' && !isParent && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-2">
              <BrainCircuit className="w-5 h-5 text-sky-700 dark:text-sky-400" />
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">AI Teacher & Mistake Analyser</h2>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Automatically inspects your past exam mistakes, identifies weak ACSEE Physics & Mathematics topics, tells you exactly what to do, and generates topic-by-topic remediation drills.
            </p>

            <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg space-y-1">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Detected Missed Topics from History</p>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                {myWeakTopics.length > 0 ? myWeakTopics.join(' · ') : 'No missed topics recorded yet — run a general ACSEE diagnostic.'}
              </p>
            </div>

            <form onSubmit={handleAnalyze} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Optional Specific Topic or Mistake Question
                </label>
                <textarea
                  rows={3}
                  value={tutorQuestion}
                  onChange={(e) => setTutorQuestion(e.target.value)}
                  placeholder="e.g. Why did I miss Young's double-slit fringe spacing or 3D vector dot product?"
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                />
              </div>
              <button
                type="submit"
                disabled={tutorLoading}
                className="w-full px-4 py-2.5 text-xs font-medium bg-slate-900 dark:bg-sky-600 text-white rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 disabled:opacity-50"
              >
                {tutorLoading ? 'Analysing Mistakes & Building Plan...' : 'Diagnose Weaknesses & Generate Exercises'}
              </button>
            </form>
          </div>

          <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">Topic-by-Topic Remediation Report</h3>
            {!tutorPlan ? (
              <p className="text-sm text-slate-500 dark:text-slate-400 py-12">
                Click "Diagnose Weaknesses & Generate Exercises" to get an AI Teacher breakdown tailored to your Physics & Math exam performance.
              </p>
            ) : (
              <div className="space-y-4">
                <div className="p-4 bg-sky-50 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-800 rounded-lg text-sm text-sky-950 dark:text-sky-100">
                  <p className="font-semibold mb-1">Diagnosis Summary</p>
                  <p className="text-xs leading-relaxed">{tutorPlan.diagnosisSummary}</p>
                </div>

                <div className="space-y-3">
                  {tutorPlan.weakAreas?.map((w, idx) => (
                    <div key={idx} className="p-4 border border-slate-200 dark:border-slate-800 rounded-lg space-y-2">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        {idx + 1}. {w.topic}
                      </p>
                      <p className="text-xs text-rose-700 dark:text-rose-400">
                        <strong>Mistake Pattern:</strong> {w.mistakePattern}
                      </p>
                      <p className="text-xs text-slate-700 dark:text-slate-300">
                        <strong>What To Do:</strong> {w.whatToDo}
                      </p>
                      <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-md text-xs space-y-1">
                        <p className="font-semibold text-slate-900 dark:text-white">Practice Exercise:</p>
                        <p className="text-slate-700 dark:text-slate-300">{w.practiceExercise}</p>
                        <details className="pt-1">
                          <summary className="cursor-pointer font-medium text-sky-700 dark:text-sky-400">View Worked Solution</summary>
                          <p className="mt-1 text-slate-600 dark:text-slate-300">{w.solutionGuide}</p>
                        </details>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="p-4 bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 rounded-lg text-xs text-teal-950 dark:text-teal-100">
                  <strong>Recommended Next Study Plan:</strong> {tutorPlan.nextStudyPlan}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {subTab === 'hub' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Major AI & STEM Research Links</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Quick gateway linking all major AI and mathematical research tools used for ACSEE problem solving.
            </p>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
              {MAJOR_AI_LINKS.map((item) => (
                <a
                  key={item.name}
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="p-3.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">{item.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{item.focus}</p>
                  </div>
                  <ExternalLink className="w-4 h-4 text-slate-400" />
                </a>
              ))}
            </div>
          </div>

          <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-sky-700 dark:text-sky-400" />
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">In-App STEM Solver & Research Assistant</h2>
            </div>
            <form onSubmit={handleHubSolve} className="space-y-3">
              <div className="flex gap-2">
                <select
                  value={hubSubject}
                  onChange={(e) => setHubSubject(e.target.value as Subject)}
                  className="px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                >
                  <option value="Physics">Physics</option>
                  <option value="Mathematics">Mathematics</option>
                </select>
                <input
                  type="text"
                  required
                  value={hubQuery}
                  onChange={(e) => setHubQuery(e.target.value)}
                  placeholder="Ask a Physics derivation or Pure Math integration problem..."
                  className="flex-1 px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                />
                <button
                  type="submit"
                  disabled={hubLoading}
                  className="px-4 py-2 text-xs font-medium bg-slate-900 dark:bg-sky-600 text-white rounded-lg hover:bg-slate-800 whitespace-nowrap shrink-0 disabled:opacity-50"
                >
                  {hubLoading ? 'Solving...' : 'Solve'}
                </button>
              </div>
            </form>

            <div className="min-h-[260px] p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
              {hubAnswer || 'Enter any ACSEE Physics or Mathematics equation, proof, or research question above for a step-by-step solution.'}
            </div>
          </div>
        </div>
      )}

      {subTab === 'errors' && (
        <div className="space-y-5">
          <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-0.5">
              <p className="text-sm font-semibold text-rose-950 dark:text-rose-100">
                Severe Issues Direct WhatsApp Escalation: <span className="font-mono">{config.supportTeacherPhone}</span>
              </p>
              <p className="text-xs text-rose-800 dark:text-rose-200">
                For urgent exam timer locks, critical Physics/Math bugs, or severe technical emergencies, message support directly on WhatsApp.
              </p>
            </div>
            <a
              href={`https://wa.me/${config.supportTeacherPhone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                `Hello ${config.appName} Support (${config.supportTeacherPhone}), I am reporting a severe issue from account ${currentUser.realName} (@${currentUser.username}).`
              )}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-rose-700 text-white rounded-lg hover:bg-rose-800 whitespace-nowrap shrink-0"
            >
              <MessageCircle className="w-4 h-4" />
              Report Severe Issue ({config.supportTeacherPhone})
            </a>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <form onSubmit={handleCreateReport} className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">Report Error to Admin or Teacher</h2>
              </div>

            {errSubmittedMsg && (
              <div className="px-3.5 py-2 bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 text-teal-900 dark:text-teal-100 text-xs rounded-lg">
                {errSubmittedMsg}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Send Report To</label>
                <select
                  value={errTarget}
                  onChange={(e) => setErrTarget(e.target.value as 'admin' | 'teacher')}
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                >
                  <option value="teacher">Class Teacher</option>
                  <option value="admin">Platform Admin</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Subject Area</label>
                <select
                  value={errSubject}
                  onChange={(e) => setErrSubject(e.target.value as any)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                >
                  <option value="Physics">Physics (131)</option>
                  <option value="Mathematics">Mathematics (142)</option>
                  <option value="System">System / App Bug</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Error Category</label>
              <select
                value={errCategory}
                onChange={(e) => setErrCategory(e.target.value as ErrorCategory)}
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
              >
                <option value="Exam Question">Exam Question / Marking Key</option>
                <option value="Practical Apparatus">Practical Lab Apparatus / Simulation</option>
                <option value="ACSEE Grading">ACSEE Grading / Points Calculation</option>
                <option value="Technical Bug">Technical / Offline Sync Bug</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Issue Title</label>
              <input
                type="text"
                required
                value={errTitle}
                onChange={(e) => setErrTitle(e.target.value)}
                placeholder="e.g. Question 4 option typo or metre bridge reading issue"
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Details</label>
              <textarea
                rows={3}
                required
                value={errDesc}
                onChange={(e) => setErrDesc(e.target.value)}
                placeholder="Describe the step, question number, or device error clearly..."
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
              />
            </div>
            <button
              type="submit"
              className="w-full px-4 py-2 text-xs font-medium bg-slate-900 dark:bg-sky-600 text-white rounded-lg hover:bg-slate-800"
            >
              Submit Error Report
            </button>
          </form>

          <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Reported Issues & Errors Fixing AI Agent
              </h2>
              <div className="flex flex-wrap items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                {(
                  [
                    ['all', `All (${reportCounts.all})`],
                    ['open', `Open (${reportCounts.open})`],
                    ['ai_diagnosed', `AI Diagnosed (${reportCounts.ai_diagnosed})`],
                    ['resolved', `Resolved (${reportCounts.resolved})`],
                  ] as const
                ).map(([st, label]) => (
                  <button
                    key={st}
                    onClick={() => setStatusFilter(st)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md tabular-nums whitespace-nowrap shrink-0 ${
                      statusFilter === st
                        ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {filteredReports.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 py-8">No error reports match this status filter.</p>
            ) : (
              <div className="space-y-3">
                {filteredReports.map((rep) => (
                  <div key={rep.id} className="p-4 border border-slate-200 dark:border-slate-800 rounded-lg space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">{rep.title}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          By {rep.reporterName} · To {rep.target} · {rep.subject}
                          {rep.category ? ` · ${rep.category}` : ''} ·{' '}
                          <span
                            className={`font-medium ${
                              rep.status === 'resolved'
                                ? 'text-teal-700 dark:text-teal-400'
                                : rep.status === 'ai_diagnosed'
                                  ? 'text-sky-700 dark:text-sky-400'
                                  : 'text-amber-700 dark:text-amber-400'
                            }`}
                          >
                            {rep.status.replace('_', ' ')}
                          </span>
                        </p>
                      </div>

                      {isTeacherOrAdmin && rep.status !== 'resolved' && (
                        <button
                          onClick={() => handleFixError(rep.id)}
                          disabled={fixingId === rep.id}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-sky-700 text-white rounded-lg hover:bg-sky-800 disabled:opacity-50 whitespace-nowrap shrink-0"
                        >
                          <Wrench className="w-3.5 h-3.5" />
                          {fixingId === rep.id ? 'AI Agent Diagnosing...' : 'Run Errors Fixing AI Agent'}
                        </button>
                      )}
                    </div>

                    <p className="text-xs text-slate-700 dark:text-slate-300">{rep.description}</p>

                    {rep.aiFixSuggestion && (
                      <div className="p-3 bg-sky-50 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-800 rounded-md text-xs text-sky-950 dark:text-sky-100 whitespace-pre-wrap">
                        <strong>AI Fixing Agent Diagnosis:</strong>
                        <div className="mt-1">{rep.aiFixSuggestion}</div>
                      </div>
                    )}

                    {rep.status === 'resolved' && rep.resolutionNote && (
                      <div className="p-3 bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 rounded-md text-xs text-teal-950 dark:text-teal-100 flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-teal-700 dark:text-teal-400 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-semibold">
                            Resolved by {rep.resolvedBy || 'Staff'}
                            {rep.resolvedAt ? ` · ${new Date(rep.resolvedAt).toLocaleDateString()}` : ''}
                          </p>
                          <p className="mt-0.5">{rep.resolutionNote}</p>
                        </div>
                      </div>
                    )}

                    {isTeacherOrAdmin && rep.status !== 'resolved' && (
                      <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap gap-2">
                        <input
                          type="text"
                          value={resolutionDrafts[rep.id] || ''}
                          onChange={(e) =>
                            setResolutionDrafts((prev) => ({ ...prev, [rep.id]: e.target.value }))
                          }
                          placeholder="Enter resolution summary or corrective action taken..."
                          className="flex-1 min-w-[200px] px-3 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                        />
                        <button
                          onClick={() => handleResolveError(rep.id)}
                          disabled={resolvingId === rep.id}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-teal-700 text-white rounded-lg hover:bg-teal-800 disabled:opacity-50 whitespace-nowrap shrink-0"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {resolvingId === rep.id ? 'Resolving...' : 'Mark Resolved'}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        </div>
      )}

      {subTab === 'rename' && isAdmin && (
        <div className="space-y-6">
          {/* Row 1: Platform Config & Owner Passkey */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await onUpdateConfig({
                  appName: appNameInput,
                  whatsappChannelUrl: waChannelInput,
                  supportTeacherPhone: waPhoneInput,
                  featuredBannerTitle: bannerTitleInput,
                  featuredBannerSubtitle: bannerSubInput,
                });
                setConfigSaved(true);
                setTimeout(() => setConfigSaved(false), 3000);
              }}
              className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4"
            >
              <div className="flex items-center gap-2">
                <Settings className="w-4 h-4 text-slate-700 dark:text-slate-300" />
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">App Renaming & Platform Configuration</h2>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Admin-only controls: rename the platform wordmark, PDF watermark title, WhatsApp support routes, and feature headline.
              </p>

              {configSaved && (
                <div className="px-4 py-2 bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 text-teal-900 dark:text-teal-100 text-xs rounded-lg">
                  Platform configuration saved and updated live.
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Platform / App Display Name</label>
                  <input
                    type="text"
                    required
                    value={appNameInput}
                    onChange={(e) => setAppNameInput(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg font-semibold text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">WhatsApp Channel URL</label>
                  <input
                    type="url"
                    required
                    value={waChannelInput}
                    onChange={(e) => setWaChannelInput(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Severe-Problem Teacher WhatsApp Phone
                  </label>
                  <input
                    type="text"
                    required
                    value={waPhoneInput}
                    onChange={(e) => setWaPhoneInput(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg font-mono text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Featured Banner Headline</label>
                  <input
                    type="text"
                    required
                    value={bannerTitleInput}
                    onChange={(e) => setBannerTitleInput(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Featured Banner Subtitle</label>
                  <textarea
                    rows={2}
                    required
                    value={bannerSubInput}
                    onChange={(e) => setBannerSubInput(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="px-5 py-2.5 text-xs font-medium bg-slate-900 dark:bg-sky-600 text-white rounded-lg hover:bg-slate-800"
              >
                Save & Apply Platform Name
              </button>
            </form>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!passkeyInput.trim()) return;
                setPasskeySaving(true);
                setPasskeyNotice(null);
                setTutorError(null);
                try {
                  await onSetAdminPasskey(passkeyInput.trim());
                  setPasskeyInput('');
                  setPasskeyNotice('Owner Admin Passkey updated and encrypted on the server.');
                } catch (err: any) {
                  setTutorError(err?.message || 'Failed to update Owner Passkey.');
                } finally {
                  setPasskeySaving(false);
                }
              }}
              className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4"
            >
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-slate-700 dark:text-slate-300" />
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">Owner Email Verification & Passkey</h2>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Admin access is permanently verified via your authorized owner email address (<strong>{currentUser.email}</strong>) using a 6-digit OTP login code. Set an optional extra Passkey below if desired.
              </p>

              <div className="p-3.5 bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 rounded-lg space-y-1 text-xs">
                <div className="flex items-center gap-2 font-medium text-teal-900 dark:text-teal-200">
                  <MailCheck className="w-4 h-4 shrink-0" />
                  <span>Owner Email Address Verification Enforced ({currentUser.email})</span>
                </div>
                <p className="text-teal-800 dark:text-teal-300">
                  {config.hasEmailTransport
                    ? 'Live email delivery transport active (RESEND_API_KEY configured) — OTP codes are delivered directly to your inbox.'
                    : 'Local preview OTP mode — OTP code is generated on request; configure RESEND_API_KEY in environment to deliver straight to inbox.'}
                </p>
              </div>

              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg flex items-center gap-2.5 text-xs">
                <ShieldCheck className={`w-4 h-4 shrink-0 ${config.hasAdminPasskey ? 'text-teal-700 dark:text-teal-400' : 'text-amber-600'}`} />
                <span className="font-medium text-slate-800 dark:text-slate-200">
                  {config.hasAdminPasskey
                    ? 'Extra Passkey Active — Required alongside Email OTP.'
                    : 'Email OTP Verification Only — No extra passkey required.'}
                </span>
              </div>

              {passkeyNotice && (
                <div className="px-3.5 py-2 bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 text-teal-900 dark:text-teal-100 text-xs rounded-lg">
                  {passkeyNotice}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  {config.hasAdminPasskey ? 'Update Owner Passkey' : 'Set New Owner Passkey'}
                </label>
                <input
                  type="password"
                  required
                  value={passkeyInput}
                  onChange={(e) => setPasskeyInput(e.target.value)}
                  placeholder="Enter a secret owner passkey..."
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="submit"
                  disabled={passkeySaving}
                  className="px-4 py-2 text-xs font-medium bg-slate-900 dark:bg-sky-600 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50"
                >
                  {passkeySaving ? 'Saving...' : 'Save Owner Passkey'}
                </button>
                {config.hasAdminPasskey && (
                  <button
                    type="button"
                    disabled={passkeySaving}
                    onClick={async () => {
                      setPasskeySaving(true);
                      setPasskeyNotice(null);
                      setTutorError(null);
                      try {
                        await onSetAdminPasskey('');
                        setPasskeyNotice('Owner Passkey cleared. Email verification remains enforced.');
                      } catch (err: any) {
                        setTutorError(err?.message || 'Failed to clear Owner Passkey.');
                      } finally {
                        setPasskeySaving(false);
                      }
                    }}
                    className="px-4 py-2 text-xs font-medium text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 rounded-lg hover:bg-rose-100 disabled:opacity-50"
                  >
                    Clear Passkey
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Row 2: Video & Image Ads Uploaded by Admin */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <form
              onSubmit={handleCreateAdSubmit}
              className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4"
            >
              <div className="flex items-center gap-2">
                {adMediaType === 'video' ? (
                  <Video className="w-4 h-4 text-sky-700 dark:text-sky-400" />
                ) : (
                  <ImagePlus className="w-4 h-4 text-sky-700 dark:text-sky-400" />
                )}
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                  Upload Video or Image Ad (Admin Only)
                </h2>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Upload promotional image banners or video announcements (MP4/YouTube) displayed across Workspace & Library.
              </p>

              {adNotice && (
                <div className="px-3.5 py-2 bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 text-teal-900 dark:text-teal-100 text-xs rounded-lg">
                  {adNotice}
                </div>
              )}

              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg w-fit">
                <button
                  type="button"
                  onClick={() => setAdMediaType('image')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md ${
                    adMediaType === 'image'
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  <ImagePlus className="w-3.5 h-3.5" />
                  Image Ad
                </button>
                <button
                  type="button"
                  onClick={() => setAdMediaType('video')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md ${
                    adMediaType === 'video'
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  <Video className="w-3.5 h-3.5" />
                  Video Ad
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {adMediaType === 'video' ? 'Upload Ad Video File (MP4/WebM, max 25 MB)' : 'Upload Ad Image File'}
                  </label>
                  <input
                    type="file"
                    accept={adMediaType === 'video' ? 'video/*' : 'image/*'}
                    onChange={handleAdFileUpload}
                    className="w-full text-xs text-slate-600 dark:text-slate-300 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-slate-100 dark:file:bg-slate-800 file:text-slate-700 dark:file:text-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {adMediaType === 'video' ? 'Or Video URL / YouTube Link' : 'Or Image URL / Asset Path'}
                  </label>
                  <input
                    type="text"
                    value={adMediaType === 'video' ? adVideoUrl : adImageUrl}
                    onChange={(e) =>
                      adMediaType === 'video' ? setAdVideoUrl(e.target.value) : setAdImageUrl(e.target.value)
                    }
                    placeholder={
                      adMediaType === 'video'
                        ? 'https://www.youtube.com/watch?v=... or https://.../promo.mp4'
                        : 'https://... or /assets/...'
                    }
                    className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                  />
                </div>

                {adMediaType === 'image' && adImageUrl && (
                  <div className="h-32 rounded-lg overflow-hidden bg-slate-900 border border-slate-200 dark:border-slate-700">
                    <img
                      src={adImageUrl}
                      alt="Ad preview"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}

                {adMediaType === 'video' && adVideoUrl && (
                  <div className="h-40 rounded-lg overflow-hidden bg-slate-950 border border-slate-200 dark:border-slate-700">
                    {getYouTubeEmbedUrl(adVideoUrl) ? (
                      <iframe
                        src={getYouTubeEmbedUrl(adVideoUrl)!}
                        title="Video Ad Preview"
                        className="w-full h-full"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    ) : isDirectPlayableVideo(adVideoUrl) ? (
                      <video src={adVideoUrl} controls className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs text-slate-300 p-3 text-center">
                        Video URL linked: {adVideoUrl.slice(0, 60)}
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Ad Headline</label>
                  <input
                    type="text"
                    required
                    value={adTitle}
                    onChange={(e) => setAdTitle(e.target.value)}
                    placeholder="e.g. ACSEE Pure Mathematics Revision Bundle"
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Ad Subtitle</label>
                  <textarea
                    rows={2}
                    value={adSubtitle}
                    onChange={(e) => setAdSubtitle(e.target.value)}
                    placeholder="Describe the book offer, exam event, or announcement..."
                    className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Placement</label>
                    <select
                      value={adPlacement}
                      onChange={(e) => setAdPlacement(e.target.value as any)}
                      className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                    >
                      <option value="all">Workspace & Library</option>
                      <option value="workspace">Workspace Only</option>
                      <option value="library">Library & Store Only</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">CTA Destination</label>
                    <select
                      value={adCtaSection}
                      onChange={(e) => setAdCtaSection(e.target.value as any)}
                      className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                    >
                      <option value="library">Library & Store</option>
                      <option value="exams">Exams & Past Papers</option>
                      <option value="lab">Physics Emulation Lab</option>
                      <option value="ai">AI & Support</option>
                      <option value="workspace">Workspace</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">CTA Button Label</label>
                    <input
                      type="text"
                      value={adCtaLabel}
                      onChange={(e) => setAdCtaLabel(e.target.value)}
                      placeholder="Open Store"
                      className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Optional External URL</label>
                    <input
                      type="url"
                      value={adExternalUrl}
                      onChange={(e) => setAdExternalUrl(e.target.value)}
                      placeholder="https://..."
                      className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={adSaving}
                className="w-full px-4 py-2.5 text-xs font-medium bg-slate-900 dark:bg-sky-600 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50"
              >
                {adSaving
                  ? `Publishing ${adMediaType === 'video' ? 'Video' : 'Image'} Ad...`
                  : `Publish ${adMediaType === 'video' ? 'Video' : 'Image'} Ad`}
              </button>
            </form>

            <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                Published Video & Image Ads ({config.imageAds?.length || 0})
              </h3>
              {!config.imageAds || config.imageAds.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 py-8">
                  No video or image ads uploaded yet. Upload your first ad using the form on the left.
                </p>
              ) : (
                <div className="space-y-3">
                  {config.imageAds.map((ad) => {
                    const isVideo = ad.mediaType === 'video' || Boolean(ad.videoUrl && !ad.imageUrl);
                    return (
                      <div
                        key={ad.id}
                        className="p-3.5 border border-slate-200 dark:border-slate-800 rounded-lg flex flex-wrap sm:flex-nowrap items-center justify-between gap-4"
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          <div className="w-20 h-14 rounded-md bg-slate-900 overflow-hidden shrink-0 flex items-center justify-center">
                            {isVideo ? (
                              <Video className="w-5 h-5 text-sky-400" />
                            ) : ad.imageUrl && !brokenAdThumbs[ad.id] ? (
                              <img
                                src={ad.imageUrl}
                                alt={ad.title}
                                referrerPolicy="no-referrer"
                                onError={() => setBrokenAdThumbs((p) => ({ ...p, [ad.id]: true }))}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <span className="text-[10px] text-slate-400">Image</span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{ad.title}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                              {isVideo ? 'Video Ad' : 'Image Ad'} · Placement: {ad.placement} · {ad.active ? 'Active' : 'Paused'} · {ad.ctaLabel || 'No CTA'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => onToggleAd(ad.id)}
                            className={`px-3 py-1.5 text-xs font-medium rounded-lg border whitespace-nowrap ${
                              ad.active
                                ? 'border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300'
                                : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                            }`}
                          >
                            {ad.active ? 'Active' : 'Paused'}
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteAd(ad.id)}
                            className="p-1.5 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/50"
                            title="Delete Ad"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Row 3: All Users Emails Sent by Admin Confirmation */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <form
              onSubmit={handleConfirmedEmailSubmit}
              className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4"
            >
              <div className="flex items-center gap-2">
                <MailCheck className="w-4 h-4 text-teal-700 dark:text-teal-400" />
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                  All Users Emails — Admin Confirmation Dispatch
                </h2>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Every all-users email (notification digest or custom announcement) requires explicit verification of recipients and confirmation by Platform Admin ({currentUser.email}).
              </p>

              {emailNotice && (
                <div className="px-3.5 py-2 bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 text-teal-900 dark:text-teal-100 text-xs rounded-lg">
                  {emailNotice}
                </div>
              )}

              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg w-fit">
                <button
                  type="button"
                  onClick={() => setEmailMode('broadcast')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md ${
                    emailMode === 'broadcast'
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  Custom All-Users Broadcast
                </button>
                <button
                  type="button"
                  onClick={() => setEmailMode('digest')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md ${
                    emailMode === 'digest'
                      ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  Pending Activity Digest
                </button>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg space-y-1.5">
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Verified Recipients ({recipientUsers.length} Registered User Emails):
                </p>
                <div className="max-h-24 overflow-y-auto text-[11px] font-mono text-slate-600 dark:text-slate-300 space-y-0.5">
                  {recipientUsers.map((u) => (
                    <p key={u.id}>
                      {u.realName} ({u.role}) · {u.email}
                    </p>
                  ))}
                </div>
              </div>

              {emailMode === 'broadcast' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Email Subject</label>
                    <input
                      type="text"
                      required
                      value={emailSubject}
                      onChange={(e) => setEmailSubject(e.target.value)}
                      placeholder="e.g. ACSEE November Mock Timetable & New Practical Packs"
                      className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Message Body</label>
                    <textarea
                      rows={3}
                      required
                      value={emailMessage}
                      onChange={(e) => setEmailMessage(e.target.value)}
                      placeholder="Write the official announcement sent to all students, teachers, and parents..."
                      className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                    />
                  </div>
                </div>
              )}

              <label className="flex items-start gap-2.5 p-3 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-950 dark:text-amber-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={emailConfirmed}
                  onChange={(e) => setEmailConfirmed(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  I confirm sending this email as Platform Owner Admin ({currentUser.email}) to all {recipientUsers.length} registered users.
                </span>
              </label>

              <button
                type="submit"
                disabled={emailSending || !emailConfirmed}
                className="w-full px-4 py-2.5 text-xs font-medium bg-slate-900 dark:bg-sky-600 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50"
              >
                {emailSending
                  ? 'Confirming & Dispatching Emails...'
                  : emailMode === 'digest'
                    ? `Confirm & Send Digest to ${recipientUsers.length} Users`
                    : `Confirm & Send Broadcast to ${recipientUsers.length} Users`}
              </button>
            </form>

            <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                Confirmed All-Users Email Dispatch Audit Log ({emailDispatches.length})
              </h3>
              {emailDispatches.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 py-8">No email broadcasts confirmed yet.</p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[380px] overflow-y-auto">
                  {emailDispatches.map((log) => (
                    <div key={log.id} className="py-3 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">{log.subject}</p>
                        <span className="font-mono text-xs text-teal-700 dark:text-teal-400 shrink-0">
                          {log.recipientCount} sent
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300">{log.bodyPreview}</p>
                      <p className="text-[11px] text-slate-400 dark:text-slate-500">
                        Confirmed by {log.confirmedBy} · {log.kind} · {new Date(log.sentAt).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
