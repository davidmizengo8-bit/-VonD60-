import React, { useMemo, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  Award,
  Bell,
  BookOpen,
  Check,
  CheckCheck,
  CornerUpLeft,
  ExternalLink,
  FileText,
  Mail,
  MessageSquare,
  Moon,
  Paperclip,
  PhoneCall,
  Plus,
  QrCode,
  Search,
  Send,
  Sun,
  Trophy,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import type {
  AppConfig,
  AppPerformanceSummary,
  ChatMessage,
  ClassGroup,
  CommunityGroup,
  ExamAttempt,
  ExamItem,
  LibraryResource,
  NotificationItem,
  UserProfile,
} from '../types';
import { ACSEE_SYLLABUS, calculateAcseeGrade, calculateProjectedDivision } from '../utils/acsee';
import { getYouTubeEmbedUrl, isDirectPlayableVideo } from '../utils/media';
import { downloadMonthlyCertificatePdf } from '../utils/pdf';

export interface RichChatPayload {
  text: string;
  replyToId?: string;
  replyPreview?: string;
  attachmentName?: string;
  attachmentDataUrl?: string;
  attachmentType?: 'image' | 'file';
}

interface Props {
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  config: AppConfig;
  currentUser: UserProfile;
  users: UserProfile[];
  classes: ClassGroup[];
  exams: ExamItem[];
  attempts: ExamAttempt[];
  resources: LibraryResource[];
  messages: ChatMessage[];
  communities: CommunityGroup[];
  notifications: NotificationItem[];
  appPerformance?: AppPerformanceSummary;
  onSwitchUser: (username: string) => void;
  onAddFriend: (targetUsername: string) => Promise<void>;
  onCreateClass: (data: { name: string; school: string; adminPhone: string }) => Promise<void>;
  onJoinClass: (code: string) => Promise<void>;
  onCreateCompetition: (examId: string, scope: 'class_to_class' | 'school_to_school') => Promise<{ code: string }>;
  onJoinCompetition: (code: string) => Promise<{ exam: ExamItem; participantLabel: string }>;
  onSendChat: (roomId: string, payload: string | RichChatPayload) => void;
  onCreateCommunity: (data: { name: string; subject: 'Physics' | 'Mathematics' | 'Physics & Math'; description: string }) => Promise<void>;
  onJoinCommunity: (id: string) => Promise<void>;
  onTriggerDigest: (confirmed: boolean) => Promise<void>;
  onNavigateTab: (section: 'workspace' | 'exams' | 'library' | 'lab' | 'ai') => void;
}

const QUICK_SYMBOLS = ['👍', '📚', '🔬', '√', 'π', '∑', '∫', 'Δ', '⇒', '∴'];

export const WorkspaceOverview: React.FC<Props> = ({
  theme,
  onToggleTheme,
  config,
  currentUser,
  users,
  classes,
  exams,
  attempts,
  resources,
  messages,
  communities,
  notifications,
  appPerformance,
  onAddFriend,
  onCreateClass,
  onJoinClass,
  onCreateCompetition,
  onJoinCompetition,
  onSendChat,
  onCreateCommunity,
  onJoinCommunity,
  onTriggerDigest,
  onNavigateTab,
}) => {
  const isTeacher = currentUser.role === 'teacher';
  const isAdmin = currentUser.role === 'admin';
  const isTeacherOrAdmin = isTeacher || isAdmin;
  const isParent = currentUser.role === 'parent';

  const [subTab, setSubTab] = useState<'overview' | 'search' | 'classes' | 'chat' | 'parents' | 'profile'>(
    isParent ? 'parents' : 'overview'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [compJoinCode, setCompJoinCode] = useState('');
  const [compExamId, setCompExamId] = useState(exams[0]?.id || '');
  const [compScope, setCompScope] = useState<'class_to_class' | 'school_to_school'>('class_to_class');

  const [newClassName, setNewClassName] = useState('');
  const [newClassSchool, setNewClassSchool] = useState(currentUser.schoolName);
  const [newClassPhone, setNewClassPhone] = useState(currentUser.phone);

  // WhatsApp-style chat state
  const [activeChatRoom, setActiveChatRoom] = useState<string>(() => {
    const firstFriend = currentUser.friends[0];
    if (firstFriend) {
      const pair = [currentUser.username, firstFriend].sort().join(':');
      return `friend:${pair}`;
    }
    return communities[0] ? `community:${communities[0].id}` : '';
  });
  const [chatSearch, setChatSearch] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [chatAttachment, setChatAttachment] = useState<{
    name: string;
    dataUrl: string;
    type: 'image' | 'file';
  } | null>(null);
  const [showNewCommForm, setShowNewCommForm] = useState(false);
  const [commName, setCommName] = useState('');
  const [commSubject, setCommSubject] = useState<'Physics' | 'Mathematics' | 'Physics & Math'>('Physics & Math');
  const [commDesc, setCommDesc] = useState('');
  const chatFileInputRef = useRef<HTMLInputElement | null>(null);

  // Overview digest confirmation
  const [digestConfirmOpen, setDigestConfirmOpen] = useState(false);
  const [digestSending, setDigestSending] = useState(false);

  const [showQrModal, setShowQrModal] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [adBrokenIds, setAdBrokenIds] = useState<Record<string, boolean>>({});

  const teacherClasses = useMemo(() => {
    if (!isTeacher) return [];
    return classes.filter(
      (c) =>
        c.teacherUsername === currentUser.username ||
        (currentUser.classCode && c.classCode.toUpperCase() === currentUser.classCode.toUpperCase())
    );
  }, [classes, currentUser, isTeacher]);

  const teacherStudentUsernames = useMemo(() => {
    const set = new Set<string>();
    if (!isTeacher) return set;
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
  }, [isTeacher, teacherClasses, users, currentUser.classCode]);

  const linkedChildUsername = isParent ? currentUser.connectedChildUsername || '' : '';

  const myAttempts = useMemo(() => {
    if (isParent) {
      return linkedChildUsername ? attempts.filter((a) => a.studentUsername === linkedChildUsername) : [];
    }
    if (isTeacher) {
      return attempts.filter((a) => teacherStudentUsernames.has(a.studentUsername));
    }
    if (isAdmin) {
      return [];
    }
    return attempts.filter((a) => a.studentUsername === currentUser.username);
  }, [attempts, currentUser.username, isParent, isTeacher, isAdmin, linkedChildUsername, teacherStudentUsernames]);

  const releasedPhysics = myAttempts.filter((a) => a.subject === 'Physics' && a.status === 'released');
  const releasedMath = myAttempts.filter((a) => a.subject === 'Mathematics' && a.status === 'released');

  const avgPhysics = releasedPhysics.length
    ? Math.round(releasedPhysics.reduce((s, a) => s + a.percentage, 0) / releasedPhysics.length)
    : 0;
  const avgMath = releasedMath.length
    ? Math.round(releasedMath.reduce((s, a) => s + a.percentage, 0) / releasedMath.length)
    : 0;

  const physAcsee = calculateAcseeGrade(avgPhysics);
  const mathAcsee = calculateAcseeGrade(avgMath);

  const monthlyLeaderboard = useMemo(() => {
    const map = new Map<string, { user: UserProfile; totalPct: number; count: number }>();
    for (const att of myAttempts) {
      if (att.status !== 'released') continue;
      const u = users.find((x) => x.username === att.studentUsername);
      if (!u) continue;
      const entry = map.get(u.username) || { user: u, totalPct: 0, count: 0 };
      entry.totalPct += att.percentage;
      entry.count += 1;
      map.set(u.username, entry);
    }
    return Array.from(map.values())
      .map((e) => ({
        user: e.user,
        average: Math.round(e.totalPct / e.count),
        attemptsCount: e.count,
      }))
      .sort((a, b) => b.average - a.average);
  }, [myAttempts, users]);

  const topMonthlyWinner = monthlyLeaderboard[0];

  const visibleUsers = useMemo(
    () => (currentUser.role === 'admin' ? users : users.filter((u) => u.role !== 'admin')),
    [users, currentUser.role]
  );

  const validRecipientCount = useMemo(
    () =>
      new Set(
        users
          .map((u) => u.email)
          .filter((e) => Boolean(e) && e.includes('@') && e !== 'restricted@owner')
      ).size,
    [users]
  );

  const activeWorkspaceAds = useMemo(
    () =>
      (config.imageAds || []).filter(
        (ad) => ad.active && (ad.placement === 'workspace' || ad.placement === 'all')
      ),
    [config.imageAds]
  );

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      return {
        accounts: visibleUsers.slice(0, 4),
        exams: exams.slice(0, 4),
        resources: resources.slice(0, 4),
        classes,
      };
    }
    return {
      accounts: visibleUsers.filter(
        (u) =>
          u.realName.toLowerCase().includes(q) ||
          u.username.toLowerCase().includes(q) ||
          u.schoolName.toLowerCase().includes(q) ||
          u.region.toLowerCase().includes(q)
      ),
      exams: exams.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          e.subject.toLowerCase().includes(q) ||
          e.paperCode.toLowerCase().includes(q)
      ),
      resources: resources.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.topic.toLowerCase().includes(q) ||
          r.subject.toLowerCase().includes(q)
      ),
      classes: classes.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.school.toLowerCase().includes(q) ||
          c.classCode.toLowerCase().includes(q)
      ),
    };
  }, [searchQuery, visibleUsers, exams, resources, classes]);

  const chatContacts = useMemo(() => {
    const others = visibleUsers.filter((u) => u.username !== currentUser.username);
    const q = chatSearch.trim().toLowerCase();
    const sorted = [...others].sort((a, b) => {
      const aFriend = currentUser.friends.includes(a.username) ? 0 : 1;
      const bFriend = currentUser.friends.includes(b.username) ? 0 : 1;
      if (aFriend !== bFriend) return aFriend - bFriend;
      return a.realName.localeCompare(b.realName);
    });
    if (!q) return sorted;
    return sorted.filter(
      (u) =>
        u.realName.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q) ||
        u.schoolName.toLowerCase().includes(q)
    );
  }, [visibleUsers, currentUser.username, currentUser.friends, chatSearch]);

  const filteredCommunities = useMemo(() => {
    const q = chatSearch.trim().toLowerCase();
    if (!q) return communities;
    return communities.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.subject.toLowerCase().includes(q)
    );
  }, [communities, chatSearch]);

  const getRoomLastMessage = (roomId: string) => {
    const msgs = messages.filter((m) => m.roomId === roomId);
    return msgs[msgs.length - 1];
  };

  const activeChatMeta = useMemo(() => {
    if (!activeChatRoom) {
      return { title: 'Select a chat', subtitle: 'Choose a classmate, teacher, or community' };
    }
    if (activeChatRoom.startsWith('friend:')) {
      const parts = activeChatRoom.replace('friend:', '').split(':');
      const otherUsername = parts.find((p) => p !== currentUser.username) || parts[0];
      const otherUser = users.find((u) => u.username === otherUsername);
      return {
        title: otherUser?.realName || `@${otherUsername}`,
        subtitle: otherUser
          ? `${otherUser.role} · ${otherUser.schoolName} · ${otherUser.classCode}`
          : 'Direct Message',
        avatarText: (otherUser?.realName || otherUsername).slice(0, 2).toUpperCase(),
        avatarPhoto: otherUser?.profilePhoto,
      };
    }
    const commId = activeChatRoom.replace('community:', '');
    const comm = communities.find((c) => c.id === commId);
    return {
      title: comm?.name || 'Study Community',
      subtitle: comm ? `${comm.subject} · ${comm.members.length} members` : 'Student Community',
      avatarText: (comm?.name || 'EF').slice(0, 2).toUpperCase(),
      avatarPhoto: undefined,
    };
  }, [activeChatRoom, currentUser.username, users, communities]);

  const roomMessages = useMemo(
    () => messages.filter((m) => m.roomId === activeChatRoom),
    [messages, activeChatRoom]
  );

  const availableTabs = useMemo(() => {
    if (isParent) {
      return [
        ['parents', 'Parents Portal'],
        ['overview', 'Leaderboard & Alerts'],
        ['chat', 'Message Teacher'],
        ['profile', 'Parent Profile'],
      ] as const;
    }
    if (isTeacherOrAdmin) {
      return [
        ['overview', 'Staff Overview'],
        ['classes', 'Classes & Competition Codes'],
        ['search', 'Smart Search'],
        ['chat', 'Chatting Centre'],
        ['profile', 'Profile & QR'],
      ] as const;
    }
    return [
      ['overview', 'Student Dashboard'],
      ['classes', 'Join Class & Competitions'],
      ['search', 'Smart Search'],
      ['chat', 'Chatting Centre'],
      ['profile', 'Profile & QR'],
    ] as const;
  }, [isParent, isTeacherOrAdmin]);

  const handleJoinClassSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    setErrorMsg(null);
    try {
      await onJoinClass(joinCode.trim());
      setJoinCode('');
      setFeedbackMsg('Joined class successfully.');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to join class.');
    }
  };

  const handleCreateClassSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClassName.trim() || !newClassSchool.trim() || !newClassPhone.trim()) return;
    setErrorMsg(null);
    try {
      await onCreateClass({ name: newClassName.trim(), school: newClassSchool.trim(), adminPhone: newClassPhone.trim() });
      setNewClassName('');
      setFeedbackMsg('Class created with shareable join code.');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to create class.');
    }
  };

  const handleCreateCompSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!compExamId) return;
    setErrorMsg(null);
    try {
      const res = await onCreateCompetition(compExamId, compScope);
      setFeedbackMsg(`Competition code ${res.code} generated and published!`);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to generate competition code.');
    }
  };

  const handleJoinCompSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!compJoinCode.trim()) return;
    setErrorMsg(null);
    try {
      const res = await onJoinCompetition(compJoinCode.trim());
      setCompJoinCode('');
      setFeedbackMsg(
        `Registered ${res.participantLabel} in competition "${res.exam.title}". Open Exams to compete!`
      );
    } catch (err: any) {
      setErrorMsg(err?.message || 'Competition code not found.');
    }
  };

  const handleChatAttachmentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isImg = file.type.startsWith('image/');
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setChatAttachment({
          name: file.name,
          dataUrl: reader.result,
          type: isImg ? 'image' : 'file',
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if ((!chatInput.trim() && !chatAttachment) || !activeChatRoom) return;
    onSendChat(activeChatRoom, {
      text: chatInput.trim() || (chatAttachment ? `Shared ${chatAttachment.name}` : ''),
      replyToId: replyingTo?.id,
      replyPreview: replyingTo ? `${replyingTo.senderName}: ${replyingTo.text.slice(0, 80)}` : undefined,
      attachmentName: chatAttachment?.name,
      attachmentDataUrl: chatAttachment?.dataUrl,
      attachmentType: chatAttachment?.type,
    });
    setChatInput('');
    setReplyingTo(null);
    setChatAttachment(null);
  };

  const childUser = isParent && linkedChildUsername ? users.find((u) => u.username === linkedChildUsername) : undefined;
  const childAttempts = isParent && linkedChildUsername
    ? attempts.filter((a) => a.studentUsername === linkedChildUsername)
    : [];

  const profileSharePayload = JSON.stringify({
    app: config.appName,
    username: currentUser.username,
    realName: currentUser.realName,
    school: currentUser.schoolName,
    classCode: currentUser.classCode,
    region: currentUser.region,
  });

  const severeWhatsappUrl = `https://wa.me/${config.supportTeacherPhone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
    `Hello Teacher, this is ${currentUser.realName} (${currentUser.className}, ${currentUser.schoolName}) reporting a severe academic/exam issue on ${config.appName}.`
  )}`;

  const competitionExams = exams.filter((e) => e.competitionScope && e.competitionScope !== 'individual');

  return (
    <div className="space-y-6">
      {/* Role-separated Sub-navigation bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div className="flex flex-wrap items-center gap-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-lg">
          {availableTabs.map(([id, label]) => (
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

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={onToggleTheme}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            {theme === 'dark' ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5" />}
            {theme === 'dark' ? 'Light Theme' : 'Dark Theme'}
          </button>
          <a
            href={config.whatsappChannelUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition-colors whitespace-nowrap shrink-0"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            WhatsApp Channel
          </a>
          {currentUser.role !== 'admin' && (
            <a
              href={severeWhatsappUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-800 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-900/60 transition-colors whitespace-nowrap shrink-0"
            >
              <PhoneCall className="w-3.5 h-3.5" />
              Report Severe Issue ({config.supportTeacherPhone})
            </a>
          )}
        </div>
      </div>

      {feedbackMsg && (
        <div className="flex items-center justify-between px-4 py-2.5 bg-sky-50 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-800 text-sky-900 dark:text-sky-100 text-sm rounded-lg">
          <span>{feedbackMsg}</span>
          <button onClick={() => setFeedbackMsg(null)} className="text-xs font-medium underline">
            Dismiss
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="flex items-center justify-between px-4 py-2.5 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-100 text-sm rounded-lg">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="text-xs font-medium underline">
            Dismiss
          </button>
        </div>
      )}

      {subTab === 'overview' && (
        <div className="space-y-6">
          {/* Role-Specific Hero Showcase */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 flex flex-col justify-between">
              <div className="space-y-3">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {currentUser.role.toUpperCase()} WORKSPACE · ACSEE Physics (131) & Math (142) · {currentUser.schoolName}
                </p>
                <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900 dark:text-white [text-wrap:balance]">
                  Welcome, {currentUser.realName}
                </h1>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
                  {isAdmin
                    ? 'Monitor platform-wide ACSEE Physics & Mathematics general performance, confirm email dispatches, publish image ads, and oversee school cohort growth.'
                    : isTeacher
                      ? 'Manage your assigned ACSEE classes, generate competition codes, track live exam takers in your cohorts, and confirm & release your students’ verified results.'
                      : isParent
                        ? 'Review your connected child’s ACSEE Physics & Mathematics scores, projected division, and teacher feedback.'
                        : config.featuredBannerSubtitle}
                </p>
              </div>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                {!isParent && (
                  <>
                    <button
                      onClick={() => onNavigateTab('exams')}
                      className="px-4 py-2 text-xs font-medium bg-slate-900 dark:bg-sky-600 text-white rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 transition-colors whitespace-nowrap shrink-0"
                    >
                      {isTeacherOrAdmin ? 'Manage Exams & Marking' : 'Open Exam Center'}
                    </button>
                    <button
                      onClick={() => onNavigateTab('lab')}
                      className="px-4 py-2 text-xs font-medium bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0"
                    >
                      Custom Practicals & Lab
                    </button>
                  </>
                )}
                {currentUser.role === 'student' && (
                  <button
                    onClick={() => onNavigateTab('ai')}
                    className="px-4 py-2 text-xs font-medium bg-white dark:bg-slate-800 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 rounded-lg hover:bg-sky-50 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0"
                  >
                    AI Weakness Analyser
                  </button>
                )}
                {isTeacherOrAdmin && (
                  <button
                    onClick={() => setSubTab('classes')}
                    className="px-4 py-2 text-xs font-medium bg-white dark:bg-slate-800 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 rounded-lg hover:bg-sky-50 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0"
                  >
                    Create Class / Competition Code
                  </button>
                )}
              </div>
            </div>

            <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden flex flex-col">
              <div className="relative h-48 lg:h-full min-h-[200px] bg-slate-900">
                <img
                  src="/src/assets/images/hero_physics_lab_1794824911788.jpg"
                  alt="Physics and Mathematics study bench"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-900/35 to-transparent flex flex-col justify-end p-5">
                  <p className="text-xs font-medium text-sky-300">NECTA ACSEE Format · {config.monthlyCertificateMonth}</p>
                  <p className="text-base font-semibold text-white mt-0.5">{config.featuredBannerTitle}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Admin-Uploaded Image & Video Ads Showcase */}
          {activeWorkspaceAds.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {activeWorkspaceAds.map((ad) => {
                const ytEmbed = ad.videoUrl ? getYouTubeEmbedUrl(ad.videoUrl) : null;
                const directVideo = ad.videoUrl ? isDirectPlayableVideo(ad.videoUrl) : false;
                const isVideoAd = ad.mediaType === 'video' || Boolean(ad.videoUrl);
                return (
                  <div
                    key={ad.id}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden flex flex-col sm:flex-row"
                  >
                    <div className="sm:w-52 h-44 sm:h-auto bg-slate-900 shrink-0 flex items-center justify-center overflow-hidden">
                      {isVideoAd && ytEmbed ? (
                        <iframe
                          src={ytEmbed}
                          title={ad.title}
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                          className="w-full h-full min-h-[160px]"
                        />
                      ) : isVideoAd && directVideo && ad.videoUrl ? (
                        <video
                          src={ad.videoUrl}
                          controls
                          playsInline
                          className="w-full h-full object-cover max-h-52"
                        />
                      ) : isVideoAd && ad.videoUrl ? (
                        <a
                          href={ad.videoUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-medium text-sky-300 hover:underline px-3 text-center"
                        >
                          Watch Video Ad
                        </a>
                      ) : !adBrokenIds[ad.id] && ad.imageUrl ? (
                        <img
                          src={ad.imageUrl}
                          alt={ad.title}
                          referrerPolicy="no-referrer"
                          onError={() => setAdBrokenIds((prev) => ({ ...prev, [ad.id]: true }))}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-xs font-mono text-slate-400 px-3 text-center">Sponsored Feature</span>
                      )}
                    </div>
                    <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                      <div className="space-y-1">
                        <p className="text-[11px] font-medium text-sky-700 dark:text-sky-400">
                          {isVideoAd ? 'Sponsored Video Ad' : 'Sponsored Image Ad'} · Published by Platform Admin
                        </p>
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{ad.title}</h3>
                        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{ad.subtitle}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {ad.ctaSection && (
                          <button
                            onClick={() => onNavigateTab(ad.ctaSection!)}
                            className="px-3 py-1.5 text-xs font-medium bg-slate-900 dark:bg-sky-600 text-white rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 whitespace-nowrap shrink-0"
                          >
                            {ad.ctaLabel || 'Explore'}
                          </button>
                        )}
                        {ad.externalUrl && (
                          <a
                            href={ad.externalUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            {ad.ctaLabel || 'Learn More'}
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* 4-Column Role-Aware Metrics Strip */}
          {isAdmin ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">App Overall Average Score</p>
                <p className="text-2xl font-semibold text-slate-900 dark:text-white mt-1 tabular-nums">
                  {appPerformance ? `${appPerformance.overallAveragePct}%` : '—'}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
                  {appPerformance
                    ? `Pass Rate: ${appPerformance.overallPassRatePct}% across platform`
                    : 'Computing platform metrics'}
                </p>
              </div>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Platform Assessments</p>
                <p className="text-2xl font-semibold text-slate-900 dark:text-white mt-1 tabular-nums">
                  {appPerformance?.totalAttempts ?? 0}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
                  {appPerformance
                    ? `${appPerformance.releasedAttempts} Released · ${appPerformance.pendingReviewAttempts} Pending`
                    : 'Across Physics 131 & Math 142'}
                </p>
              </div>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Registered Users & Cohorts</p>
                <p className="text-2xl font-semibold text-slate-900 dark:text-white mt-1 tabular-nums">
                  {appPerformance?.totalUsers ?? users.length} Users
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
                  {appPerformance
                    ? `${appPerformance.roleCounts.students} Students · ${appPerformance.roleCounts.teachers} Teachers · ${appPerformance.totalClasses} Classes`
                    : `${classes.length} Active Classes`}
                </p>
              </div>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Live Activity & Support Health</p>
                <p className="text-2xl font-semibold text-slate-900 dark:text-white mt-1 tabular-nums">
                  {appPerformance?.liveExamSittingCount ?? 0} Live Sitting
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
                  {appPerformance
                    ? `${appPerformance.errorHealth.resolved} Resolved Errors · ${appPerformance.errorHealth.open} Open`
                    : `${resources.length} Library Books`}
                </p>
              </div>
            </div>
          ) : isTeacher ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">My Assigned Classes</p>
                <p className="text-2xl font-semibold text-slate-900 dark:text-white mt-1 tabular-nums">{teacherClasses.length}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {teacherStudentUsernames.size} Students in your cohorts
                </p>
              </div>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">My Students Pending Review</p>
                <p className="text-2xl font-semibold text-amber-700 dark:text-amber-400 mt-1 tabular-nums">
                  {myAttempts.filter((a) => a.status === 'pending_review').length}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Your students’ scripts awaiting release</p>
              </div>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">My Students’ Submissions</p>
                <p className="text-2xl font-semibold text-slate-900 dark:text-white mt-1 tabular-nums">{myAttempts.length}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Scoped strictly to your classes</p>
              </div>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Active Competitions</p>
                <p className="text-2xl font-semibold text-slate-900 dark:text-white mt-1 tabular-nums">{competitionExams.length}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{exams.length} Published ACSEE papers</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {isParent ? "Child's Physics (131) Avg" : 'ACSEE Physics (131) Avg'}
                </p>
                <p className="text-2xl font-semibold text-slate-900 dark:text-white mt-1 tabular-nums">
                  {releasedPhysics.length ? `${avgPhysics}%` : '—'}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {releasedPhysics.length
                    ? `Grade ${physAcsee.grade} · ${physAcsee.points} pt · ${physAcsee.remark}`
                    : 'No released Physics papers yet'}
                </p>
              </div>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {isParent ? "Child's Math (142) Avg" : 'ACSEE Math (142) Avg'}
                </p>
                <p className="text-2xl font-semibold text-slate-900 dark:text-white mt-1 tabular-nums">
                  {releasedMath.length ? `${avgMath}%` : '—'}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {releasedMath.length
                    ? `Grade ${mathAcsee.grade} · ${mathAcsee.points} pt · ${mathAcsee.remark}`
                    : 'No released Math papers yet'}
                </p>
              </div>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {isParent ? "Child's Projected Standing" : 'Projected ACSEE Standing'}
                </p>
                <p className="text-lg font-semibold text-slate-900 dark:text-white mt-1 tabular-nums">
                  {releasedPhysics.length || releasedMath.length
                    ? calculateProjectedDivision(
                        releasedPhysics.length ? physAcsee.points : mathAcsee.points,
                        releasedMath.length ? mathAcsee.points : physAcsee.points
                      )
                    : 'Pending Results'}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {isParent && childUser ? `Student: ${childUser.realName}` : `Class Code: ${currentUser.classCode}`}
                </p>
              </div>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {isParent ? "Child's Assessment Status" : 'Network & Activity'}
                </p>
                <p className="text-2xl font-semibold text-slate-900 dark:text-white mt-1 tabular-nums">
                  {isParent ? `${myAttempts.length} Exams` : `${currentUser.friends.length} Friends`}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
                  {isParent
                    ? `${myAttempts.filter((a) => a.status === 'released').length} Released · ${myAttempts.filter((a) => a.status === 'pending_review').length} Pending`
                    : `${myAttempts.length} Exams · ${currentUser.savedExamIds.length} Saved · ${currentUser.unlockedGifts.length} Gifts`}
                </p>
              </div>
            </div>
          )}

          {/* ACSEE Format Blueprint Strip */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">NECTA ACSEE Examination Format & Syllabus</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                All exams, practicals, and AI diagnostics strictly follow Tanzania ACSEE Physics (131) & Advanced Mathematics (142).
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(['Physics', 'Mathematics'] as const).map((subj) => (
                <div key={subj} className="p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg space-y-2">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    {subj} (Code {ACSEE_SYLLABUS[subj].code})
                  </p>
                  <div className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
                    {ACSEE_SYLLABUS[subj].papers.map((p) => (
                      <p key={p.code}>
                        <strong className="font-mono text-slate-900 dark:text-sky-300">{p.code}</strong> ({p.duration}): {p.format}
                      </p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Role-Scoped Performance / Certificate & Notifications Split */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {isAdmin && appPerformance ? (
              <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
                <div>
                  <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                    General Platform Performance (Subjects, Grades & Schools)
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Aggregated ACSEE performance across the entire app ({appPerformance.totalResources} library books · {appPerformance.competitionCount} competitions).
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {appPerformance.subjectStats.map((s) => (
                    <div key={s.subject} className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg space-y-1">
                      <p className="text-xs font-medium text-slate-600 dark:text-slate-300">{s.subject} Overall</p>
                      <p className="text-xl font-semibold text-slate-900 dark:text-white tabular-nums">{s.averagePct}% Avg</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                        {s.attemptsCount} Assessments · {s.passRatePct}% Pass Rate
                      </p>
                    </div>
                  ))}
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">Platform ACSEE Grade Distribution (A–F)</p>
                  <div className="grid grid-cols-7 gap-2">
                    {appPerformance.gradeDistribution.map((g) => (
                      <div key={g.grade} className="p-2 border border-slate-200 dark:border-slate-700 rounded-lg text-center">
                        <p className="font-mono text-xs font-bold text-slate-900 dark:text-white">{g.grade}</p>
                        <p className="font-mono text-sm font-semibold text-sky-700 dark:text-sky-400 tabular-nums mt-0.5">{g.count}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400">
                        <th className="py-2 pr-3 font-medium">School & Cohort</th>
                        <th className="py-2 pr-3 font-medium text-right">Students</th>
                        <th className="py-2 pr-3 font-medium text-right">Exams</th>
                        <th className="py-2 font-medium text-right">Cohort Avg</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {appPerformance.schoolCohorts.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                            No school cohorts registered yet. Live classes and students will appear here.
                          </td>
                        </tr>
                      ) : (
                        appPerformance.schoolCohorts.map((c) => (
                          <tr key={c.classCode}>
                            <td className="py-2 pr-3 font-medium text-slate-900 dark:text-slate-100">
                              {c.schoolName} <span className="font-mono text-slate-500 dark:text-slate-400">({c.classCode})</span>
                            </td>
                            <td className="py-2 pr-3 text-right font-mono tabular-nums">{c.studentCount}</td>
                            <td className="py-2 pr-3 text-right font-mono tabular-nums">{c.attemptsCount}</td>
                            <td className="py-2 text-right font-mono font-semibold text-slate-900 dark:text-white tabular-nums">
                              {c.attemptsCount ? `${c.averagePct}%` : '—'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : isTeacher ? (
              <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                      My Students’ Monthly Certificate Leaderboard
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Shows only students in your assigned classes ({config.monthlyCertificateMonth}).
                    </p>
                  </div>
                  {topMonthlyWinner && (
                    <button
                      onClick={() =>
                        downloadMonthlyCertificatePdf(
                          topMonthlyWinner.user,
                          topMonthlyWinner.average,
                          config.monthlyCertificateMonth,
                          config.appName
                        )
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-teal-700 text-white rounded-lg hover:bg-teal-800 transition-colors whitespace-nowrap shrink-0"
                    >
                      <Award className="w-3.5 h-3.5" />
                      Download Top Certificate
                    </button>
                  )}
                </div>

                {monthlyLeaderboard.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400 py-8">
                    No released exam results for your assigned students yet.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400">
                          <th className="py-2 pr-3 font-medium">Rank</th>
                          <th className="py-2 pr-3 font-medium">Student</th>
                          <th className="py-2 pr-3 font-medium">Class</th>
                          <th className="py-2 text-right font-medium">Monthly Avg</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {monthlyLeaderboard.map((row, idx) => (
                          <tr key={row.user.username} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                            <td className="py-2.5 pr-3 font-mono text-xs text-slate-600 dark:text-slate-400 tabular-nums">#{idx + 1}</td>
                            <td className="py-2.5 pr-3 font-medium text-slate-900 dark:text-slate-100">
                              {row.user.realName}
                              {idx === 0 && (
                                <span className="ml-2 text-xs font-normal text-teal-700 dark:text-teal-400">· Auto-Certified</span>
                              )}
                            </td>
                            <td className="py-2.5 pr-3 text-xs text-slate-600 dark:text-slate-400">{row.user.classCode}</td>
                            <td className="py-2.5 text-right font-mono font-semibold text-slate-900 dark:text-white tabular-nums">
                              {row.average}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : (
              <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                      {isParent ? "Linked Child's Monthly Standing" : 'My Monthly Excellence Certificate Standing'}
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {isParent
                        ? `Private ACSEE summary for ${childUser?.realName || 'your connected child'} (${config.monthlyCertificateMonth}).`
                        : `Private monthly summary for ${currentUser.realName} — other students' scores are hidden (${config.monthlyCertificateMonth}).`}
                    </p>
                  </div>
                  {topMonthlyWinner && (
                    <button
                      onClick={() =>
                        downloadMonthlyCertificatePdf(
                          topMonthlyWinner.user,
                          topMonthlyWinner.average,
                          config.monthlyCertificateMonth,
                          config.appName
                        )
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-teal-700 text-white rounded-lg hover:bg-teal-800 transition-colors whitespace-nowrap shrink-0"
                    >
                      <Award className="w-3.5 h-3.5" />
                      Download Certificate
                    </button>
                  )}
                </div>

                {topMonthlyWinner ? (
                  <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">{topMonthlyWinner.user.realName}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {topMonthlyWinner.user.schoolName} · {topMonthlyWinner.user.className}
                        </p>
                      </div>
                      <span className="font-mono text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
                        {topMonthlyWinner.average}%
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      Based on {topMonthlyWinner.attemptsCount} released ACSEE exam(s). Highest monthly average automatically receives a verified email certificate.
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 dark:text-slate-400 py-8">
                    No released exam results recorded yet. Complete an exam or await teacher verification to view standing.
                  </p>
                )}
              </div>
            )}

            <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold text-slate-900 dark:text-white">Activity & Daily Email Notifications</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Daily feature & new book email alerts dispatched to registered members.
                  </p>
                </div>
                {currentUser.role === 'admin' && (
                  <button
                    onClick={() => setDigestConfirmOpen((v) => !v)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    Send Email Digest
                  </button>
                )}
              </div>

              {currentUser.role === 'admin' && digestConfirmOpen && (
                <div className="p-3.5 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-lg space-y-2.5 text-xs">
                  <p className="font-semibold text-amber-950 dark:text-amber-200">
                    Admin Confirmation Required — Dispatch Digest to All {validRecipientCount} Users
                  </p>
                  <p className="text-amber-900 dark:text-amber-300">
                    Confirm that you want to email all queued updates to every registered Student, Teacher, and Parent account ({validRecipientCount} verified addresses).
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      disabled={digestSending}
                      onClick={async () => {
                        setDigestSending(true);
                        try {
                          await onTriggerDigest(true);
                          setDigestConfirmOpen(false);
                          setFeedbackMsg(`Admin confirmed and emailed digest to all ${validRecipientCount} registered users.`);
                        } catch (err: any) {
                          setErrorMsg(err?.message || 'Failed to send email digest.');
                        } finally {
                          setDigestSending(false);
                        }
                      }}
                      className="px-3 py-1.5 font-medium bg-slate-900 dark:bg-sky-600 text-white rounded-md hover:bg-slate-800 disabled:opacity-50"
                    >
                      {digestSending ? 'Sending...' : 'Confirm & Send to All Users'}
                    </button>
                    <button
                      onClick={() => setDigestConfirmOpen(false)}
                      className="px-3 py-1.5 font-medium border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 rounded-md"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => onNavigateTab('ai')}
                      className="px-3 py-1.5 font-medium text-sky-800 dark:text-sky-300 underline"
                    >
                      Open Custom All-Users Email Composer
                    </button>
                  </div>
                </div>
              )}

              <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-64 overflow-y-auto">
                {notifications.length === 0 ? (
                  <p className="py-8 text-xs text-slate-500 dark:text-slate-400">
                    No live alerts yet. Updates appear here as teachers and students publish classes, exams, videos, and materials.
                  </p>
                ) : (
                  notifications.map((n) => (
                    <div key={n.id} className="py-3 flex items-start justify-between gap-3">
                      <div className="space-y-0.5">
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{n.title}</p>
                        <p className="text-xs text-slate-600 dark:text-slate-300">{n.body}</p>
                        <p className="text-xs text-slate-400 dark:text-slate-500">
                          {n.category} · {new Date(n.createdAt).toLocaleDateString()} ·{' '}
                          {n.emailDigestSent ? 'Email sent' : 'Queued for daily email'}
                        </p>
                      </div>
                      <Bell className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0 mt-0.5" />
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {subTab === 'search' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-6">
          <div className="max-w-2xl">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Smart Search Across {config.appName}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Search student & teacher accounts, friends, ACSEE Physics & Math exams, classes, and library textbooks.
            </p>
            <div className="relative mt-4">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, school, region, paper code (131/1), or topic..."
                className="w-full pl-10 pr-4 py-2.5 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">People & Friends ({searchResults.accounts.length})</h3>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
                {searchResults.accounts.map((u) => {
                  const isFriend = currentUser.friends.includes(u.username);
                  return (
                    <div key={u.id} className="p-3.5 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{u.realName}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          @{u.username} · {u.role} · {u.schoolName} · {u.region}
                        </p>
                      </div>
                      {u.username !== currentUser.username && (
                        <button
                          onClick={() => onAddFriend(u.username)}
                          disabled={isFriend}
                          className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap shrink-0 ${
                            isFriend
                              ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 cursor-default'
                              : 'bg-slate-900 dark:bg-sky-600 text-white hover:bg-slate-800 dark:hover:bg-sky-500'
                          }`}
                        >
                          {isFriend ? <Check className="w-3.5 h-3.5" /> : <UserPlus className="w-3.5 h-3.5" />}
                          {isFriend ? 'Friends' : 'Add Friend'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Exams & Past Papers ({searchResults.exams.length})</h3>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
                {searchResults.exams.map((ex) => (
                  <div key={ex.id} className="p-3.5 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{ex.title}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {ex.subject} · {ex.paperCode} · {ex.creatorName}
                      </p>
                    </div>
                    <button
                      onClick={() => onNavigateTab('exams')}
                      className="px-3 py-1.5 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
                    >
                      Open
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Library & Store Books ({searchResults.resources.length})</h3>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
                {searchResults.resources.map((res) => (
                  <div key={res.id} className="p-3.5 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{res.title}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {res.subject} · {res.topic} · {res.author}
                      </p>
                    </div>
                    <button
                      onClick={() => onNavigateTab('library')}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      View
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Classes ({searchResults.classes.length})</h3>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
                {searchResults.classes.map((cls) => (
                  <div key={cls.id} className="p-3.5 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{cls.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {cls.school} · Code <span className="font-mono font-medium">{cls.classCode}</span>
                      </p>
                    </div>
                    <button
                      onClick={() => onJoinClass(cls.classCode)}
                      className="px-3 py-1.5 text-xs font-medium bg-sky-700 text-white rounded-lg hover:bg-sky-800 whitespace-nowrap shrink-0"
                    >
                      Join
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {subTab === 'classes' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 space-y-6">
            <form onSubmit={handleJoinClassSubmit} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">Join Class by Code</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Enter your class code (e.g., <span className="font-mono">PCM-2026</span> or <span className="font-mono">PGM-2026</span>) to join your cohort.
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  placeholder="Enter class code..."
                  className="flex-1 px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg font-mono uppercase text-slate-900 dark:text-slate-100"
                />
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-medium bg-slate-900 dark:bg-sky-600 text-white rounded-lg hover:bg-slate-800 whitespace-nowrap shrink-0"
                >
                  Join Class
                </button>
              </div>
            </form>

            <form onSubmit={handleJoinCompSubmit} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-600" />
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">Join Class / School Competition by Code</h2>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Enter a competition code (e.g., <span className="font-mono">CLS-PCM-PGM</span> or <span className="font-mono">SCH-ILB-KIB</span>) to enroll your class or school.
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={compJoinCode}
                  onChange={(e) => setCompJoinCode(e.target.value)}
                  placeholder="CLS-XXXX or SCH-XXXX"
                  className="flex-1 px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg font-mono uppercase text-slate-900 dark:text-slate-100"
                />
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-medium bg-teal-700 text-white rounded-lg hover:bg-teal-800 whitespace-nowrap shrink-0"
                >
                  Enter Competition
                </button>
              </div>
            </form>

            {isTeacherOrAdmin && (
              <>
                <form onSubmit={handleCreateClassSubmit} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
                  <h2 className="text-base font-semibold text-slate-900 dark:text-white">Create New Class (Teacher/Admin)</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Requires Class Name, School Name, and Admin Phone Number.
                  </p>
                  <div className="space-y-3">
                    <input
                      type="text"
                      required
                      value={newClassName}
                      onChange={(e) => setNewClassName(e.target.value)}
                      placeholder="Class Name (e.g. Form VI PCM - Gamma)"
                      className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                    />
                    <input
                      type="text"
                      required
                      value={newClassSchool}
                      onChange={(e) => setNewClassSchool(e.target.value)}
                      placeholder="School Name"
                      className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                    />
                    <input
                      type="tel"
                      required
                      value={newClassPhone}
                      onChange={(e) => setNewClassPhone(e.target.value)}
                      placeholder="Admin Phone Number"
                      className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full px-4 py-2 text-xs font-medium bg-sky-700 text-white rounded-lg hover:bg-sky-800"
                  >
                    Create Class & Generate Code
                  </button>
                </form>

                <form onSubmit={handleCreateCompSubmit} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
                  <h2 className="text-base font-semibold text-slate-900 dark:text-white">Generate Competition Code (Teacher/Admin)</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Turn any ACSEE Physics or Math exam into a Class-to-Class or School-to-School competition with a joinable code.
                  </p>
                  <select
                    value={compExamId}
                    onChange={(e) => setCompExamId(e.target.value)}
                    disabled={exams.length === 0}
                    className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 disabled:opacity-60"
                  >
                    {exams.length === 0 ? (
                      <option value="">Create an exam first in Exams tab</option>
                    ) : (
                      exams.map((ex) => (
                        <option key={ex.id} value={ex.id}>
                          {ex.paperCode} · {ex.title}
                        </option>
                      ))
                    )}
                  </select>
                  <select
                    value={compScope}
                    onChange={(e) => setCompScope(e.target.value as any)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                  >
                    <option value="class_to_class">Class-to-Class Competition (CLS-XXXX)</option>
                    <option value="school_to_school">School-to-School Competition (SCH-XXXX)</option>
                  </select>
                  <button
                    type="submit"
                    disabled={!compExamId || exams.length === 0}
                    className="w-full px-4 py-2 text-xs font-medium bg-slate-900 dark:bg-sky-600 text-white rounded-lg hover:bg-slate-800 disabled:opacity-50"
                  >
                    Generate Competition Code
                  </button>
                </form>
              </>
            )}
          </div>

          <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">Classes & Active Competition Codes</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Joined classes and schools appear below for Class-to-Class and School-to-School battles.
                </p>
              </div>
              <button
                onClick={() => onNavigateTab('exams')}
                className="px-3 py-1.5 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
              >
                Open Competition Exam
              </button>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {classes.length === 0 ? (
                <p className="py-6 text-xs text-slate-500 dark:text-slate-400">
                  No live classes created yet. Teachers or Admin can create the first class on the left.
                </p>
              ) : (
                classes.map((cls) => (
                  <div key={cls.id} className="py-3 flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">{cls.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {cls.school} · Admin {cls.adminPhone} · {cls.memberUsernames.length} Members
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs font-semibold text-sky-800 dark:text-sky-400">{cls.classCode}</span>
                      {currentUser.classCode === cls.classCode ? (
                        <span className="text-xs font-medium text-teal-700 dark:text-teal-400">Joined</span>
                      ) : (
                        <button
                          onClick={() => onJoinClass(cls.classCode)}
                          className="px-3 py-1.5 text-xs font-medium bg-slate-900 dark:bg-sky-600 text-white rounded-lg hover:bg-slate-800 whitespace-nowrap shrink-0"
                        >
                          Join
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Active Competition Exam Codes</h3>
              {competitionExams.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">No competition exam codes active yet.</p>
              ) : (
                competitionExams.map((e) => (
                  <div key={e.id} className="p-3.5 border border-slate-200 dark:border-slate-800 rounded-lg space-y-1.5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">{e.title}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {e.competitionScope === 'school_to_school' ? 'School-to-School' : 'Class-to-Class'} · {e.subject} ({e.paperCode})
                        </p>
                      </div>
                      <span className="font-mono text-xs font-semibold text-teal-800 dark:text-teal-400">{e.competitionCode}</span>
                    </div>
                    {e.joinedParticipants && e.joinedParticipants.length > 0 && (
                      <p className="text-xs text-slate-600 dark:text-slate-300">
                        Enrolled: {e.joinedParticipants.join(' vs ')}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {subTab === 'chat' && (
        <div className="bg-white dark:bg-[#111b21] border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 min-h-[600px]">
          {/* WhatsApp Left Sidebar */}
          <div className="lg:col-span-4 border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800 flex flex-col bg-white dark:bg-[#111b21]">
            <div className="px-4 py-3 bg-slate-50 dark:bg-[#202c33] border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-full bg-emerald-700 text-white flex items-center justify-center text-xs font-semibold shrink-0">
                  {currentUser.realName.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{currentUser.realName}</p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {config.appName} Chats · {currentUser.classCode}
                  </p>
                </div>
              </div>
              {!isParent && (
                <button
                  type="button"
                  onClick={() => setShowNewCommForm((v) => !v)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-emerald-700 text-white rounded-md hover:bg-emerald-800 whitespace-nowrap shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Group
                </button>
              )}
            </div>

            <div className="p-3 border-b border-slate-100 dark:border-slate-800">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={chatSearch}
                  onChange={(e) => setChatSearch(e.target.value)}
                  placeholder="Search chats, classmates or study groups..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-100 dark:bg-[#202c33] border border-transparent focus:border-emerald-600 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none"
                />
              </div>
            </div>

            {showNewCommForm && !isParent && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!commName.trim()) return;
                  await onCreateCommunity({ name: commName.trim(), subject: commSubject, description: commDesc.trim() });
                  setCommName('');
                  setCommDesc('');
                  setShowNewCommForm(false);
                }}
                className="p-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#182229] space-y-2"
              >
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">New Study Group</p>
                <input
                  type="text"
                  required
                  value={commName}
                  onChange={(e) => setCommName(e.target.value)}
                  placeholder="Group title..."
                  className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-[#202c33] border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100"
                />
                <div className="flex gap-2">
                  <select
                    value={commSubject}
                    onChange={(e) => setCommSubject(e.target.value as any)}
                    className="flex-1 px-2.5 py-1.5 text-xs bg-white dark:bg-[#202c33] border border-slate-200 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100"
                  >
                    <option value="Physics & Math">Physics & Math</option>
                    <option value="Physics">Physics</option>
                    <option value="Mathematics">Mathematics</option>
                  </select>
                  <button
                    type="submit"
                    className="px-3 py-1.5 text-xs font-medium bg-emerald-700 text-white rounded-md hover:bg-emerald-800"
                  >
                    Create
                  </button>
                </div>
              </form>
            )}

            <div className="flex-1 overflow-y-auto max-h-[470px] divide-y divide-slate-100 dark:divide-slate-800/80">
              {!isParent && filteredCommunities.length > 0 && (
                <div>
                  <p className="px-4 py-2 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 bg-slate-50/70 dark:bg-[#182229]">
                    STUDY COMMUNITIES ({filteredCommunities.length})
                  </p>
                  {filteredCommunities.map((c) => {
                    const room = `community:${c.id}`;
                    const last = getRoomLastMessage(room);
                    const joined = c.members.includes(currentUser.username);
                    const selected = activeChatRoom === room;
                    return (
                      <div
                        key={c.id}
                        className={`px-4 py-2.5 flex items-center justify-between gap-2 transition-colors ${
                          selected ? 'bg-emerald-50 dark:bg-[#2a3942]' : 'hover:bg-slate-50 dark:hover:bg-[#202c33]'
                        }`}
                      >
                        <button
                          onClick={() => setActiveChatRoom(room)}
                          className="flex items-center gap-3 flex-1 min-w-0 text-left"
                        >
                          <div className="w-10 h-10 rounded-full bg-sky-700 text-white flex items-center justify-center text-xs font-semibold shrink-0">
                            <Users className="w-4 h-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{c.name}</p>
                              {last && (
                                <span className="text-[10px] text-slate-400 tabular-nums shrink-0">
                                  {new Date(last.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                              {last ? `${last.senderName}: ${last.text}` : `${c.subject} · ${c.members.length} members`}
                            </p>
                          </div>
                        </button>
                        {!joined && (
                          <button
                            onClick={() => onJoinCommunity(c.id)}
                            className="px-2 py-1 text-[11px] font-medium bg-emerald-700 text-white rounded hover:bg-emerald-800 shrink-0"
                          >
                            Join
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <div>
                <p className="px-4 py-2 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 bg-slate-50/70 dark:bg-[#182229]">
                  DIRECT MESSAGES ({chatContacts.length})
                </p>
                {chatContacts.map((u) => {
                  const room = `friend:${[currentUser.username, u.username].sort().join(':')}`;
                  const last = getRoomLastMessage(room);
                  const selected = activeChatRoom === room;
                  const isFriend = currentUser.friends.includes(u.username);
                  return (
                    <button
                      key={u.username}
                      onClick={() => setActiveChatRoom(room)}
                      className={`w-full px-4 py-2.5 flex items-center gap-3 text-left transition-colors ${
                        selected ? 'bg-emerald-50 dark:bg-[#2a3942]' : 'hover:bg-slate-50 dark:hover:bg-[#202c33]'
                      }`}
                    >
                      {u.profilePhoto ? (
                        <img
                          src={u.profilePhoto}
                          alt={u.realName}
                          referrerPolicy="no-referrer"
                          className="w-10 h-10 rounded-full object-cover shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-slate-800 dark:bg-sky-700 text-white flex items-center justify-center text-xs font-semibold shrink-0">
                          {u.realName.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{u.realName}</p>
                          {last && (
                            <span className="text-[10px] text-slate-400 tabular-nums shrink-0">
                              {new Date(last.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {last
                            ? `${last.senderUsername === currentUser.username ? 'You: ' : ''}${last.text}`
                            : `${u.role} · ${u.schoolName}${isFriend ? '' : ' · Click to chat'}`}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* WhatsApp Right Thread Canvas */}
          <div className="lg:col-span-8 flex flex-col bg-[#efeae2] dark:bg-[#0b141a]">
            {/* Thread Top Bar */}
            <div className="px-4 py-3 bg-slate-50 dark:bg-[#202c33] border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {activeChatMeta.avatarPhoto ? (
                  <img
                    src={activeChatMeta.avatarPhoto}
                    alt={activeChatMeta.title}
                    referrerPolicy="no-referrer"
                    className="w-9 h-9 rounded-full object-cover shrink-0"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-emerald-700 text-white flex items-center justify-center text-xs font-semibold shrink-0">
                    {activeChatMeta.avatarText || <MessageSquare className="w-4 h-4" />}
                  </div>
                )}
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-white truncate">{activeChatMeta.title}</h2>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{activeChatMeta.subtitle}</p>
                </div>
              </div>
              <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 hidden sm:inline">
                Real-Time Sync · ACSEE Study Circle
              </span>
            </div>

            {/* Messages Thread */}
            <div className="flex-1 p-4 sm:p-5 space-y-2.5 overflow-y-auto max-h-[410px]">
              {roomMessages.length === 0 ? (
                <div className="mx-auto max-w-sm mt-12 px-4 py-3 rounded-lg bg-white/90 dark:bg-[#202c33] text-center shadow-sm">
                  <p className="text-xs font-medium text-slate-800 dark:text-slate-200">
                    Start messaging {activeChatMeta.title}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    Share ACSEE Physics derivations, Math proofs, photos of working sheets, or offline-queued notes.
                  </p>
                </div>
              ) : (
                roomMessages.map((m) => {
                  const mine = m.senderUsername === currentUser.username;
                  return (
                    <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`group relative max-w-[82%] sm:max-w-md px-3.5 py-2 rounded-xl shadow-sm text-sm ${
                          mine
                            ? 'bg-[#d9fdd3] dark:bg-[#005c4b] text-slate-900 dark:text-slate-50 rounded-tr-none'
                            : 'bg-white dark:bg-[#202c33] text-slate-900 dark:text-slate-100 rounded-tl-none'
                        }`}
                      >
                        {!mine && (
                          <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 mb-0.5">
                            {m.senderName}
                          </p>
                        )}

                        {m.replyPreview && (
                          <div className="mb-1.5 px-2.5 py-1 rounded bg-black/5 dark:bg-black/25 text-[11px] text-slate-600 dark:text-slate-300 border-b border-emerald-600/30">
                            {m.replyPreview}
                          </div>
                        )}

                        {m.attachmentDataUrl && m.attachmentType === 'image' && (
                          <div className="mb-1.5 rounded-lg overflow-hidden bg-slate-900 max-h-56">
                            <img
                              src={m.attachmentDataUrl}
                              alt={m.attachmentName || 'Attachment'}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-contain max-h-56"
                            />
                          </div>
                        )}

                        {m.attachmentDataUrl && m.attachmentType === 'file' && (
                          <a
                            href={m.attachmentDataUrl}
                            download={m.attachmentName || 'attachment'}
                            className="mb-1.5 flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-black/5 dark:bg-black/25 text-xs font-medium hover:underline"
                          >
                            <FileText className="w-4 h-4 shrink-0" />
                            <span className="truncate">{m.attachmentName}</span>
                          </a>
                        )}

                        <p className="whitespace-pre-wrap break-words leading-relaxed">{m.text}</p>

                        <div className="mt-1 flex items-center justify-end gap-1.5 text-[10px] text-slate-500 dark:text-slate-300/80 tabular-nums">
                          <button
                            type="button"
                            onClick={() => setReplyingTo(m)}
                            title="Reply to message"
                            className="opacity-70 hover:opacity-100 inline-flex items-center gap-0.5 mr-1"
                          >
                            <CornerUpLeft className="w-3 h-3" />
                            Reply
                          </button>
                          <span>
                            {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {mine && (
                            <CheckCheck className="w-3.5 h-3.5 text-sky-600 dark:text-sky-300 shrink-0" />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Reply / Attachment Preview Strips */}
            {replyingTo && (
              <div className="mx-3 mt-1 px-3 py-2 rounded-lg bg-white dark:bg-[#202c33] border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2 text-xs">
                <div className="min-w-0">
                  <p className="font-semibold text-emerald-700 dark:text-emerald-400">
                    Replying to {replyingTo.senderName}
                  </p>
                  <p className="text-slate-600 dark:text-slate-300 truncate">{replyingTo.text}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setReplyingTo(null)}
                  className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {chatAttachment && (
              <div className="mx-3 mt-1 px-3 py-2 rounded-lg bg-white dark:bg-[#202c33] border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2 text-xs">
                <span className="truncate font-medium text-slate-700 dark:text-slate-200">
                  Attached ({chatAttachment.type}): {chatAttachment.name}
                </span>
                <button
                  type="button"
                  onClick={() => setChatAttachment(null)}
                  className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Quick STEM & Emoji Strip + Composer */}
            <div className="bg-slate-50 dark:bg-[#202c33] border-t border-slate-200 dark:border-slate-800 px-3 pt-2 pb-3 space-y-2">
              <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
                {QUICK_SYMBOLS.map((sym) => (
                  <button
                    key={sym}
                    type="button"
                    onClick={() => setChatInput((prev) => prev + sym)}
                    className="px-2 py-0.5 text-xs rounded bg-white dark:bg-[#2a3942] border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 shrink-0"
                  >
                    {sym}
                  </button>
                ))}
              </div>

              <form onSubmit={handleSendMessage} className="flex items-center gap-2">
                <input
                  ref={chatFileInputRef}
                  type="file"
                  accept="image/*,.pdf,.txt"
                  onChange={handleChatAttachmentChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => chatFileInputRef.current?.click()}
                  title="Attach photo or study sheet"
                  className="p-2 rounded-full text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#2a3942] shrink-0"
                >
                  <Paperclip className="w-4 h-4" />
                </button>
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Type a message, formula, or reply..."
                  className="flex-1 px-4 py-2 text-sm bg-white dark:bg-[#2a3942] border border-slate-200 dark:border-slate-700 rounded-full text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
                <button
                  type="submit"
                  className="w-9 h-9 rounded-full bg-[#00a884] text-white flex items-center justify-center hover:bg-emerald-700 transition-colors shrink-0"
                  aria-label="Send message"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {subTab === 'parents' && isParent && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Parents Portal — My Child’s ACSEE Results</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Strictly scoped to your connected child’s Physics (131) & Mathematics (142) scores and teacher feedback.
              </p>
            </div>
            <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Linked Student:{' '}
              <span className="font-semibold text-slate-900 dark:text-white">
                {childUser ? `${childUser.realName} (${childUser.className})` : linkedChildUsername || 'Not Linked'}
              </span>
            </div>
          </div>

          {childUser && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-y border-slate-200 dark:border-slate-800 py-4 text-sm">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Student</p>
                <p className="font-semibold text-slate-900 dark:text-white">{childUser.realName}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">School & Class</p>
                <p className="font-medium text-slate-900 dark:text-slate-100">
                  {childUser.schoolName} · {childUser.className}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Contact / Region</p>
                <p className="font-medium text-slate-900 dark:text-slate-100">
                  {childUser.phone} · {childUser.region}
                </p>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400">
                  <th className="py-2 pr-4 font-medium">Exam</th>
                  <th className="py-2 pr-4 font-medium">Subject</th>
                  <th className="py-2 pr-4 font-medium">Score</th>
                  <th className="py-2 pr-4 font-medium">ACSEE Grade</th>
                  <th className="py-2 pr-4 font-medium">Status</th>
                  <th className="py-2 font-medium">Teacher Feedback</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {childAttempts.map((a) => (
                  <tr key={a.id}>
                    <td className="py-3 pr-4 font-medium text-slate-900 dark:text-slate-100">{a.examTitle}</td>
                    <td className="py-3 pr-4 text-slate-600 dark:text-slate-300">{a.subject}</td>
                    <td className="py-3 pr-4 font-mono tabular-nums">
                      {a.score}/{a.totalMarks} ({a.percentage}%)
                    </td>
                    <td className="py-3 pr-4 font-mono font-semibold text-slate-900 dark:text-white">
                      {a.acseeGrade} ({a.acseePoints} pt)
                    </td>
                    <td className="py-3 pr-4 text-xs text-slate-600 dark:text-slate-300">
                      {a.status === 'released' ? 'Released' : 'Pending Teacher Review'}
                    </td>
                    <td className="py-3 text-xs text-slate-600 dark:text-slate-300">{a.teacherNote || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTab === 'profile' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                {currentUser.profilePhoto ? (
                  <img
                    src={currentUser.profilePhoto}
                    alt={currentUser.realName}
                    referrerPolicy="no-referrer"
                    className="w-16 h-16 rounded-xl object-cover border border-slate-200 dark:border-slate-700"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-xl bg-slate-900 dark:bg-sky-600 text-white flex items-center justify-center text-xl font-semibold">
                    {currentUser.realName.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div>
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{currentUser.realName}</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    @{currentUser.username} · {currentUser.role} · {currentUser.region}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowQrModal((v) => !v)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
              >
                <QrCode className="w-4 h-4" />
                {showQrModal ? 'Hide QR' : 'QR Share'}
              </button>
            </div>

            {showQrModal && (
              <div className="p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl flex flex-col items-center text-center space-y-2">
                <div className="p-2 bg-white rounded-lg">
                  <QRCodeSVG value={profileSharePayload} size={156} />
                </div>
                <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Scan to add @{currentUser.username} or connect to {currentUser.classCode}
                </p>
              </div>
            )}

            <dl className="grid grid-cols-2 gap-y-3 gap-x-4 text-sm border-t border-slate-200 dark:border-slate-800 pt-4">
              <div>
                <dt className="text-xs text-slate-500 dark:text-slate-400">School</dt>
                <dd className="font-medium text-slate-900 dark:text-slate-100">{currentUser.schoolName}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500 dark:text-slate-400">Class & Code</dt>
                <dd className="font-medium text-slate-900 dark:text-slate-100">
                  {currentUser.className} ({currentUser.classCode})
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500 dark:text-slate-400">WhatsApp Phone</dt>
                <dd className="font-mono text-xs text-slate-900 dark:text-slate-100">{currentUser.phone}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500 dark:text-slate-400">Email</dt>
                <dd className="text-xs text-slate-900 dark:text-slate-100 truncate">{currentUser.email}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500 dark:text-slate-400">Friends / Shares</dt>
                <dd className="font-mono text-slate-900 dark:text-slate-100 tabular-nums">
                  {currentUser.friends.length} friends · {currentUser.sharedCount} shares
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500 dark:text-slate-400">Unlocked Gifts</dt>
                <dd className="font-mono text-slate-900 dark:text-slate-100 tabular-nums">{currentUser.unlockedGifts.length} items</dd>
              </div>
            </dl>
          </div>

          <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              Exams Performed, Liked, Saved & Unlocked Gifts
            </h3>

            <div className="space-y-4">
              <div>
                <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">Exams Performed History</h4>
                {myAttempts.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">No exams performed yet.</p>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg">
                    {myAttempts.map((a) => (
                      <div key={a.id} className="p-3 flex items-center justify-between text-sm">
                        <div>
                          <p className="font-medium text-slate-900 dark:text-slate-100">{a.examTitle}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {a.subject} · {new Date(a.submittedAt).toLocaleDateString()} · {a.mode}
                          </p>
                        </div>
                        <span className="font-mono text-xs font-semibold tabular-nums">
                          {a.percentage}% (Grade {a.acseeGrade})
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                    Liked Exams ({currentUser.likedExamIds.length})
                  </h4>
                  <ul className="text-xs text-slate-700 dark:text-slate-300 space-y-1">
                    {currentUser.likedExamIds.map((id) => {
                      const ex = exams.find((x) => x.id === id);
                      return <li key={id}>• {ex?.title || id}</li>;
                    })}
                  </ul>
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                    Saved Favourites ({currentUser.savedExamIds.length})
                  </h4>
                  <ul className="text-xs text-slate-700 dark:text-slate-300 space-y-1">
                    {currentUser.savedExamIds.map((id) => {
                      const ex = exams.find((x) => x.id === id);
                      return <li key={id}>• {ex?.title || id}</li>;
                    })}
                  </ul>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">Unlocked Exclusive App Gifts</h4>
                {currentUser.unlockedGifts.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">Buy a Store book or spin the Weekly Luck Wheel to unlock gifts.</p>
                ) : (
                  <ul className="text-xs text-teal-800 dark:text-teal-300 space-y-1">
                    {currentUser.unlockedGifts.map((g, idx) => (
                      <li key={idx}>• {g}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
