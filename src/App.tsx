import { useCallback, useEffect, useRef, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import type {
  ActiveExamSession,
  AppConfig,
  ArenaRoom,
  ErrorReport,
  ExamAttempt,
  ExamQuestion,
  StoreState,
  Subject,
  UserProfile,
} from './types';
import { WorkspaceOverview } from './components/WorkspaceOverview';
import { ExamsArena } from './components/ExamsArena';
import { LibraryStore } from './components/LibraryStore';
import { PhysicsLabTools } from './components/PhysicsLabTools';
import { AiAndAdmin } from './components/AiAndAdmin';
import { AuthModal } from './components/AuthModal';
import { OfflineStatusBar, PWAInstallButton } from './components/PWAControls';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import {
  clearOfflineQueueItem,
  createOfflineExamSession,
  enqueueOfflineMutation,
  getOfflineQueue,
  gradeExamLocally,
  loadCachedState,
  runOfflineAiTutor,
  saveCachedState,
  type OfflineMutation,
} from './utils/offline';

type SectionId = 'workspace' | 'exams' | 'library' | 'lab' | 'ai';

const USERNAME_KEY = 'elimu_fasta_username';
const ADMIN_TOKEN_KEY = 'elimu_fasta_admin_token';
const THEME_KEY = 'elimu_fasta_theme';

interface FullApiState extends StoreState {
  isAdminVerified?: boolean;
  activeSessions: ActiveExamSession[];
  arenas: ArenaRoom[];
}

function getStoredAdminToken(): string {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem(ADMIN_TOKEN_KEY) || '';
}

function getStoredActiveUsername(): string {
  if (typeof window === 'undefined') return '';
  const saved = localStorage.getItem(USERNAME_KEY) || '';
  if (saved === 'admin_elimu' && !getStoredAdminToken()) {
    localStorage.setItem(USERNAME_KEY, '');
    return '';
  }
  return saved;
}

async function apiJson<T>(url: string, options?: RequestInit): Promise<T> {
  const adminToken = getStoredAdminToken();
  const activeUser = getStoredActiveUsername();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-active-user': activeUser,
    ...(adminToken ? { 'x-admin-token': adminToken } : {}),
    ...((options?.headers as Record<string, string>) || {}),
  };
  const res = await fetch(url, {
    ...options,
    headers,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || 'Request failed');
  }
  return data as T;
}

export default function App() {
  const isOnline = useOnlineStatus();
  const [activeUsername, setActiveUsername] = useState<string>(() => getStoredActiveUsername());
  const [state, setState] = useState<FullApiState | null>(() => {
    const u = getStoredActiveUsername() || 'guest';
    const cached = loadCachedState<FullApiState>(u);
    return cached ? { ...cached, activeSessions: cached.activeSessions || [], arenas: cached.arenas || [] } : null;
  });
  const [loading, setLoading] = useState(() => !loadCachedState(getStoredActiveUsername() || 'guest'));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<SectionId>('workspace');
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'switch' | 'signup' | 'admin' | undefined>(undefined);
  const [pendingQueue, setPendingQueue] = useState<OfflineMutation[]>(() => getOfflineQueue());
  const [syncing, setSyncing] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'light';
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
    return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
  });

  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const updateAndCacheState = useCallback(
    (updater: (prev: FullApiState) => FullApiState) => {
      setState((prev) => {
        if (!prev) return prev;
        const next = updater(prev);
        saveCachedState(next, getStoredActiveUsername() || 'guest');
        return next;
      });
    },
    []
  );

  const fetchState = useCallback(async (viewerOverride?: string) => {
    const viewer = viewerOverride ?? getStoredActiveUsername();
    const cacheKey = viewer || 'guest';
    try {
      const data = await apiJson<FullApiState>(`/api/state?viewer=${encodeURIComponent(viewer)}`);
      setState(data);
      saveCachedState(data, cacheKey);
      setLoadError(null);
    } catch (err: any) {
      const cached = loadCachedState<FullApiState>(cacheKey);
      if (cached) {
        setState({
          ...cached,
          activeSessions: cached.activeSessions || [],
          arenas: cached.arenas || [],
        });
        setLoadError(null);
      } else {
        setLoadError(err?.message || 'Failed to load platform state.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const flushOfflineQueue = useCallback(async () => {
    const queue = getOfflineQueue();
    if (!navigator.onLine || queue.length === 0) return;
    setSyncing(true);
    try {
      for (const item of queue) {
        try {
          if (item.url === '__WS_CHAT__') {
            if (wsRef.current?.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify({ event: 'chat:send', payload: item.body }));
              clearOfflineQueueItem(item.id);
            }
          } else {
            const adminToken = getStoredAdminToken();
            await fetch(item.url, {
              method: item.method,
              headers: {
                'Content-Type': 'application/json',
                'x-active-user': getStoredActiveUsername(),
                ...(adminToken ? { 'x-admin-token': adminToken } : {}),
              },
              body: JSON.stringify(item.body),
            });
            clearOfflineQueueItem(item.id);
          }
        } catch {
          // Stop on first network failure; remaining items stay queued
          break;
        }
      }
      setPendingQueue(getOfflineQueue());
      await fetchState();
    } finally {
      setSyncing(false);
    }
  }, [fetchState]);

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  useEffect(() => {
    if (isOnline && pendingQueue.length > 0) {
      flushOfflineQueue();
    }
  }, [isOnline, pendingQueue.length, flushOfflineQueue]);

  // Sync HTML document title whenever Admin renames the platform
  useEffect(() => {
    if (state?.config?.appName) {
      document.title = `${state.config.appName} — ACSEE Physics & Mathematics Platform`;
    }
  }, [state?.config?.appName]);

  // Real-time WebSocket connection for Chat, 1v1 Arena, Proctor Count & Notifications
  useEffect(() => {
    if (!isOnline) return;
    let closed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (!navigator.onLine) return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${window.location.host}`);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data) as { event: string; payload: any };
          setState((prev) => {
            if (!prev) return prev;
            let next = prev;
            if (parsed.event === 'init') {
              const viewer = prev.users.find((u) => u.username === getStoredActiveUsername());
              next = {
                ...prev,
                activeSessions:
                  viewer?.role === 'teacher' ? parsed.payload.activeSessions || [] : [],
                arenas: parsed.payload.arenas || [],
              };
            } else if (parsed.event === 'proctor:update') {
              const viewer = prev.users.find((u) => u.username === getStoredActiveUsername());
              next = {
                ...prev,
                activeSessions: viewer?.role === 'teacher' ? parsed.payload : [],
              };
            } else if (parsed.event === 'arena:update') {
              next = { ...prev, arenas: parsed.payload };
            } else if (parsed.event === 'chat:message') {
              const incoming = parsed.payload;
              if (prev.messages.some((m) => m.id === incoming.id)) return prev;
              next = { ...prev, messages: [...prev.messages, incoming] };
            } else if (parsed.event === 'notification:new') {
              const n = parsed.payload;
              if (prev.notifications.some((x) => x.id === n.id)) return prev;
              next = { ...prev, notifications: [n, ...prev.notifications] };
            }
            saveCachedState(next, getStoredActiveUsername());
            return next;
          });
        } catch {
          // Ignore malformed WS packets
        }
      };

      ws.onclose = () => {
        if (!closed && navigator.onLine) {
          reconnectTimer = setTimeout(connect, 3000);
        }
      };
    };

    connect();
    return () => {
      closed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, [isOnline]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6">
        <div className="w-full max-w-4xl space-y-4">
          <div className="h-12 bg-slate-200 dark:bg-slate-800 rounded-xl animate-pulse" />
          <div className="h-64 bg-slate-200 dark:bg-slate-800 rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  if (loadError || !state) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 max-w-md text-center space-y-3">
          <p className="text-base font-semibold text-slate-900 dark:text-slate-100">Unable to Connect to Server</p>
          <p className="text-xs text-slate-600 dark:text-slate-400">{loadError || 'No cached offline data found yet.'}</p>
          <button
            onClick={() => fetchState()}
            className="px-4 py-2 text-xs font-medium bg-slate-900 dark:bg-sky-600 text-white rounded-lg"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const hasVerifiedAdminSession =
    Boolean(getStoredAdminToken()) &&
    (isOnline && state.isAdminVerified !== undefined ? Boolean(state.isAdminVerified) : true);

  const matchedUser = state.users.find((u) => u.username === activeUsername);
  const nonAdminFallback = state.users.find((u) => u.role !== 'admin') || null;
  const currentUser: UserProfile | null =
    matchedUser && (matchedUser.role !== 'admin' || hasVerifiedAdminSession)
      ? matchedUser
      : hasVerifiedAdminSession
        ? state.users.find((u) => u.role === 'admin') || null
        : nonAdminFallback;

  const isParent = currentUser?.role === 'parent';
  const isTeacherOrAdmin = currentUser?.role === 'teacher' || currentUser?.role === 'admin';

  const navItems: Array<[SectionId, string]> = isParent
    ? [
        ['workspace', 'Workspace'],
        ['exams', 'Results'],
        ['library', 'Library'],
        ['ai', 'Support'],
      ]
    : [
        ['workspace', 'Workspace'],
        ['exams', 'Exams'],
        ['library', 'Library'],
        ['lab', 'Physics Lab'],
        ['ai', isTeacherOrAdmin ? 'AI & Admin' : 'AI & Support'],
      ];

  const handleSelectUser = async (username: string) => {
    const targetUser = state.users.find((u) => u.username === username);
    if (targetUser?.role === 'admin') {
      throw new Error('Admin login requires Owner Email Verification.');
    }
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    localStorage.setItem(USERNAME_KEY, username);
    setActiveUsername(username);
    if (targetUser?.role === 'parent' && activeSection === 'lab') {
      setActiveSection('workspace');
    }
    if (isOnline) {
      await fetchState(username);
    } else {
      const cached = loadCachedState<FullApiState>(username);
      if (cached) {
        setState(cached);
      } else {
        setState((prev) => (prev ? { ...prev, attempts: [], activeSessions: [], appPerformance: undefined } : prev));
      }
    }
  };

  const handleRequestAdminCode = async (payload: { email: string; passkey?: string }) => {
    if (!isOnline) {
      throw new Error('Owner Admin email verification requires an active server connection.');
    }
    return apiJson<{ ok: boolean; email: string; deliveryMode: string; previewCode?: string }>(
      '/api/auth/admin-request-code',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  };

  const handleVerifyAdminCode = async (payload: { email: string; code: string; passkey?: string }) => {
    if (!isOnline) {
      throw new Error('Owner Admin email verification requires an active server connection.');
    }
    const res = await apiJson<{ user: UserProfile; adminToken: string }>('/api/auth/admin-verify-code', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    sessionStorage.setItem(ADMIN_TOKEN_KEY, res.adminToken);
    localStorage.setItem(USERNAME_KEY, res.user.username);
    setActiveUsername(res.user.username);
    await fetchState(res.user.username);
  };

  const handleLockAdmin = async () => {
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    const nextUsername = nonAdminFallback?.username || '';
    localStorage.setItem(USERNAME_KEY, nextUsername);
    setActiveUsername(nextUsername);
    if (isOnline) {
      await fetchState(nextUsername);
    }
  };

  const handleSignup = async (payload: any) => {
    if (!isOnline) {
      throw new Error('Account registration requires an internet connection. Switch between cached accounts while offline.');
    }
    const res = await apiJson<{ user: UserProfile }>('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    localStorage.setItem(USERNAME_KEY, res.user.username);
    setActiveUsername(res.user.username);
    await fetchState(res.user.username);
  };

  const sendWs = (event: string, payload: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ event, payload }));
      return true;
    }
    return false;
  };

  const queueMutation = (item: Omit<OfflineMutation, 'id' | 'createdAt'>) => {
    const next = enqueueOfflineMutation(item);
    setPendingQueue(next);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col transition-colors">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-30">
        <div className="max-w-[1320px] mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-8">
          <button
            onClick={() => setActiveSection('workspace')}
            className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0"
          >
            {state.config.appName}
          </button>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300">
            {currentUser ? (
              navItems.map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setActiveSection(id)}
                  className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                    activeSection === id
                      ? 'text-slate-900 dark:text-white border-slate-900 dark:border-sky-400 font-semibold'
                      : 'border-transparent hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {label}
                </button>
              ))
            ) : (
              <span className="text-xs text-slate-500 dark:text-slate-400">
                ACSEE Physics (131) & Advanced Mathematics (142) · Live Platform
              </span>
            )}
          </nav>

          <div className="flex items-center gap-2.5 shrink-0">
            {currentUser?.role === 'admin' && (
              <button
                onClick={handleLockAdmin}
                className="px-3 py-2 text-xs font-medium text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-900/60 transition-colors whitespace-nowrap shrink-0"
              >
                Lock Admin
              </button>
            )}
            <button
              onClick={() => {
                setAuthModalMode(currentUser ? 'switch' : 'signup');
                setAuthModalOpen(true);
              }}
              className="px-4 py-2 text-xs font-medium text-white bg-slate-900 dark:bg-sky-600 rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 transition-colors whitespace-nowrap shrink-0"
            >
              {currentUser ? `${currentUser.realName} (${currentUser.role})` : 'Sign In / Register'}
            </button>
          </div>
        </div>

        {/* Mobile compact nav */}
        {currentUser && (
          <div className="md:hidden border-t border-slate-100 dark:border-slate-800 px-3 py-2 flex items-center gap-1 overflow-x-auto">
            {navItems.map(([id, label]) => (
              <button
                key={id}
                onClick={() => setActiveSection(id)}
                className={`px-3 py-1 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${
                  activeSection === id
                    ? 'bg-slate-900 dark:bg-sky-600 text-white'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </header>

      <OfflineStatusBar
        isOnline={isOnline}
        pendingCount={pendingQueue.length}
        syncing={syncing}
        onSyncNow={flushOfflineQueue}
      />

      <main className="flex-1 max-w-[1320px] w-full mx-auto px-4 sm:px-6 py-6">
        {!currentUser ? (
          <div className="max-w-3xl mx-auto py-8 space-y-6">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 space-y-5">
              <div className="space-y-2">
                <p className="text-xs font-medium text-sky-700 dark:text-sky-400">
                  Live Educational Workspace · Zero Demo Data
                </p>
                <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">
                  Welcome to {state.config.appName}
                </h1>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  {state.config.featuredBannerSubtitle} Register your live Student, Teacher, or Parent account or verify via Owner Admin email to start publishing ACSEE Physics (131) &amp; Mathematics (142) classes, exams, videos, and materials.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => {
                    setAuthModalMode('signup');
                    setAuthModalOpen(true);
                  }}
                  className="px-5 py-2.5 text-xs font-medium bg-slate-900 dark:bg-sky-600 text-white rounded-lg hover:bg-slate-800 dark:hover:bg-sky-500 transition-colors whitespace-nowrap shrink-0"
                >
                  Create Live Account (Student / Teacher / Parent)
                </button>
                <button
                  onClick={() => {
                    setAuthModalMode('admin');
                    setAuthModalOpen(true);
                  }}
                  className="px-4 py-2.5 text-xs font-medium bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors whitespace-nowrap shrink-0"
                >
                  Owner Admin Email Sign In
                </button>
                <button
                  onClick={toggleTheme}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
                >
                  {theme === 'dark' ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5" />}
                  {theme === 'dark' ? 'Light Theme' : 'Dark Theme'}
                </button>
              </div>

              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-400">
                <span>
                  Severe Issues WhatsApp Support:{' '}
                  <a
                    href={`https://wa.me/${state.config.supportTeacherPhone.replace(/[^0-9]/g, '')}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono font-semibold text-rose-700 dark:text-rose-400 hover:underline"
                  >
                    {state.config.supportTeacherPhone}
                  </a>
                </span>
                <a
                  href={state.config.whatsappChannelUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-emerald-700 dark:text-emerald-400 hover:underline"
                >
                  Join Official WhatsApp Channel
                </a>
              </div>
            </div>
          </div>
        ) : (
          <>
            {activeSection === 'workspace' && (
              <WorkspaceOverview
                key={currentUser.username}
                theme={theme}
                onToggleTheme={toggleTheme}
                config={state.config}
                currentUser={currentUser}
                users={state.users}
                classes={state.classes}
                exams={state.exams}
                attempts={state.attempts}
                resources={state.resources}
                messages={state.messages}
                communities={state.communities}
                notifications={state.notifications}
                appPerformance={state.appPerformance}
                onSwitchUser={handleSelectUser}
                onAddFriend={async (targetUsername) => {
                  if (!isOnline) {
                    updateAndCacheState((prev) => ({
                      ...prev,
                      users: prev.users.map((u) =>
                        u.username === currentUser.username && !u.friends.includes(targetUsername)
                          ? { ...u, friends: [...u.friends, targetUsername] }
                          : u
                      ),
                    }));
                    queueMutation({
                      url: '/api/users/friend',
                      method: 'POST',
                      body: { username: currentUser.username, targetUsername },
                      label: `Add friend @${targetUsername}`,
                    });
                    return;
                  }
                  await apiJson('/api/users/friend', {
                    method: 'POST',
                    body: JSON.stringify({ username: currentUser.username, targetUsername }),
                  });
                  await fetchState();
                }}
                onCreateClass={async (data) => {
                  if (!isOnline) {
                    throw new Error('Creating a new class code requires an internet connection.');
                  }
                  await apiJson('/api/classes', {
                    method: 'POST',
                    body: JSON.stringify({ ...data, teacherUsername: currentUser.username }),
                  });
                  await fetchState();
                }}
                onJoinClass={async (classCode) => {
                  if (!isOnline) {
                    const cls = state.classes.find((c) => c.classCode.toUpperCase() === classCode.toUpperCase());
                    if (!cls) throw new Error('Class code not found in offline cache.');
                    updateAndCacheState((prev) => ({
                      ...prev,
                      users: prev.users.map((u) =>
                        u.username === currentUser.username
                          ? { ...u, classCode: cls.classCode, className: cls.name, schoolName: cls.school }
                          : u
                      ),
                    }));
                    queueMutation({
                      url: '/api/classes/join',
                      method: 'POST',
                      body: { username: currentUser.username, classCode },
                      label: `Join class ${classCode}`,
                    });
                    return;
                  }
                  await apiJson('/api/classes/join', {
                    method: 'POST',
                    body: JSON.stringify({ username: currentUser.username, classCode }),
                  });
                  await fetchState();
                }}
                onCreateCompetition={async (examId, scope) => {
                  if (!isOnline) {
                    throw new Error('Generating a competition code requires an internet connection.');
                  }
                  const res = await apiJson<{ code: string }>('/api/competitions/create', {
                    method: 'POST',
                    body: JSON.stringify({ examId, scope, role: currentUser.role }),
                  });
                  await fetchState();
                  return { code: res.code };
                }}
                onJoinCompetition={async (code) => {
                  if (!isOnline) {
                    throw new Error('Joining a competition by code requires an internet connection.');
                  }
                  const res = await apiJson<{ exam: any; participantLabel: string }>('/api/competitions/join', {
                    method: 'POST',
                    body: JSON.stringify({ code, username: currentUser.username }),
                  });
                  await fetchState();
                  return res;
                }}
                onSendChat={(roomId, messageInput) => {
                  const rich =
                    typeof messageInput === 'string'
                      ? { text: messageInput }
                      : messageInput;
                  const payload = {
                    roomId,
                    senderUsername: currentUser.username,
                    senderName: currentUser.realName,
                    text: rich.text,
                    replyToId: rich.replyToId,
                    replyPreview: rich.replyPreview,
                    attachmentName: rich.attachmentName,
                    attachmentDataUrl: rich.attachmentDataUrl,
                    attachmentType: rich.attachmentType,
                  };
                  const sent = isOnline && sendWs('chat:send', payload);
                  if (!sent) {
                    const localMsg = {
                      id: `msg-off-${Date.now()}`,
                      roomId,
                      senderUsername: currentUser.username,
                      senderName: currentUser.realName,
                      text: rich.text,
                      replyToId: rich.replyToId,
                      replyPreview: rich.replyPreview,
                      attachmentName: rich.attachmentName,
                      attachmentDataUrl: rich.attachmentDataUrl,
                      attachmentType: rich.attachmentType,
                      status: 'sent' as const,
                      createdAt: new Date().toISOString(),
                    };
                    updateAndCacheState((prev) => ({
                      ...prev,
                      messages: [...prev.messages, localMsg],
                    }));
                    queueMutation({
                      url: '__WS_CHAT__',
                      method: 'POST',
                      body: payload,
                      label: 'Offline chat message',
                    });
                  }
                }}
                onCreateCommunity={async (data) => {
                  if (!isOnline) {
                    throw new Error('Creating a new community requires an internet connection.');
                  }
                  await apiJson('/api/communities', {
                    method: 'POST',
                    body: JSON.stringify({ ...data, creatorUsername: currentUser.username }),
                  });
                  await fetchState();
                }}
                onJoinCommunity={async (id) => {
                  if (!isOnline) {
                    updateAndCacheState((prev) => ({
                      ...prev,
                      communities: prev.communities.map((c) =>
                        c.id === id && !c.members.includes(currentUser.username)
                          ? { ...c, members: [...c.members, currentUser.username] }
                          : c
                      ),
                    }));
                    queueMutation({
                      url: `/api/communities/${id}/join`,
                      method: 'POST',
                      body: { username: currentUser.username },
                      label: 'Join community',
                    });
                    return;
                  }
                  await apiJson(`/api/communities/${id}/join`, {
                    method: 'POST',
                    body: JSON.stringify({ username: currentUser.username }),
                  });
                  await fetchState();
                }}
                onTriggerDigest={async (confirmed: boolean) => {
                  if (!isOnline) {
                    throw new Error('Sending email notifications requires an internet connection.');
                  }
                  await apiJson('/api/notifications/digest', {
                    method: 'POST',
                    body: JSON.stringify({ confirmed }),
                  });
                  await fetchState();
                }}
                onNavigateTab={(sec) => setActiveSection(sec)}
              />
            )}

            {activeSection === 'exams' && (
              <ExamsArena
                key={currentUser.username}
                config={state.config}
                currentUser={currentUser}
                exams={state.exams}
                attempts={state.attempts}
                classes={state.classes}
                users={state.users}
                appPerformance={state.appPerformance}
                activeSessions={state.activeSessions}
                arenas={state.arenas}
                onReactExam={async (examId, action) => {
                  if (!isOnline) {
                    updateAndCacheState((prev) => ({
                      ...prev,
                      exams: prev.exams.map((e) => {
                        if (e.id !== examId) return e;
                        if (action === 'like') return { ...e, likes: e.likes + 1 };
                        if (action === 'save') return { ...e, saves: e.saves + 1 };
                        return { ...e, shares: e.shares + 1 };
                      }),
                      users: prev.users.map((u) => {
                        if (u.username !== currentUser.username) return u;
                        if (action === 'like' && !u.likedExamIds.includes(examId)) {
                          return { ...u, likedExamIds: [...u.likedExamIds, examId] };
                        }
                        if (action === 'save' && !u.savedExamIds.includes(examId)) {
                          return { ...u, savedExamIds: [...u.savedExamIds, examId] };
                        }
                        if (action === 'share') return { ...u, sharedCount: u.sharedCount + 1 };
                        return u;
                      }),
                    }));
                    queueMutation({
                      url: `/api/exams/${examId}/react`,
                      method: 'POST',
                      body: { username: currentUser.username, action },
                      label: `Exam ${action}`,
                    });
                    return;
                  }
                  await apiJson(`/api/exams/${examId}/react`, {
                    method: 'POST',
                    body: JSON.stringify({ username: currentUser.username, action }),
                  });
                  await fetchState();
                }}
                onToggleAntiRep={async (examId) => {
                  if (!isOnline) {
                    throw new Error('Toggling server anti-repetition requires an internet connection.');
                  }
                  await apiJson(`/api/exams/${examId}/toggle-anti-rep`, {
                    method: 'POST',
                    body: JSON.stringify({ role: currentUser.role }),
                  });
                  await fetchState();
                }}
                onCreateExam={async (payload) => {
                  if (!isOnline) {
                    throw new Error('Publishing new exams to the school requires an internet connection.');
                  }
                  await apiJson('/api/exams', {
                    method: 'POST',
                    body: JSON.stringify({
                      ...payload,
                      creatorUsername: currentUser.username,
                      creatorName: currentUser.realName,
                      schoolName: currentUser.schoolName,
                      classCode: currentUser.classCode,
                    }),
                  });
                  await fetchState();
                }}
                onStartExam={async (examId) => {
                  if (!isOnline) {
                    const exam = state.exams.find((e) => e.id === examId);
                    if (!exam) throw new Error('Exam not found in offline cache.');
                    const session = createOfflineExamSession(exam, currentUser, state.attempts);
                    const questions = exam.antiRepetition
                      ? [...exam.questions].sort(() => Math.random() - 0.5)
                      : exam.questions;
                    return { session, questions };
                  }
                  return apiJson<{ session: ActiveExamSession; questions: ExamQuestion[] }>(
                    `/api/exams/${examId}/start`,
                    {
                      method: 'POST',
                      body: JSON.stringify({
                        studentUsername: currentUser.username,
                        studentName: currentUser.realName,
                      }),
                    }
                  );
                }}
                onSubmitExam={async (examId, payload) => {
                  if (!isOnline) {
                    const exam = state.exams.find((e) => e.id === examId);
                    if (!exam) throw new Error('Exam not found in offline cache.');
                    const attempt = gradeExamLocally(
                      exam,
                      currentUser,
                      payload.answers,
                      (payload.mode as ExamAttempt['mode']) || 'digital',
                      undefined,
                      payload.forceExpiredTest,
                      payload.writtenAnswers
                    );
                    updateAndCacheState((prev) => ({
                      ...prev,
                      attempts: [attempt, ...prev.attempts],
                    }));
                    queueMutation({
                      url: `/api/exams/${examId}/submit`,
                      method: 'POST',
                      body: {
                        ...payload,
                        studentUsername: currentUser.username,
                      },
                      label: `Submit ${exam.paperCode} exam`,
                    });
                    return attempt;
                  }
                  const res = await apiJson<{ attempt: ExamAttempt }>(`/api/exams/${examId}/submit`, {
                    method: 'POST',
                    body: JSON.stringify({
                      ...payload,
                      studentUsername: currentUser.username,
                    }),
                  });
                  await fetchState();
                  return res.attempt;
                }}
                onScanGradeExam={async (payload) => {
                  if (!isOnline) {
                    throw new Error('Physical Paper Vision Scan requires an internet connection for Gemini Vision AI.');
                  }
                  const res = await apiJson<{ attempt: ExamAttempt; scanSummary: string }>(
                    '/api/ai/scan-grade',
                    {
                      method: 'POST',
                      body: JSON.stringify({
                        ...payload,
                        studentUsername: currentUser.username,
                      }),
                    }
                  );
                  await fetchState();
                  return res;
                }}
                onReleaseAttempt={async (attemptId, teacherNote, questionMarkOverrides) => {
                  if (!isOnline) {
                    throw new Error('Releasing official results requires an internet connection.');
                  }
                  await apiJson(`/api/attempts/${attemptId}/release`, {
                    method: 'POST',
                    body: JSON.stringify({
                      teacherNote,
                      teacherUsername: currentUser.username,
                      questionMarkOverrides,
                    }),
                  });
                  await fetchState();
                }}
                onArenaCreate={(examId) => {
                  if (!isOnline) return;
                  sendWs('arena:create', {
                    examId,
                    hostUsername: currentUser.username,
                    hostName: currentUser.realName,
                  });
                }}
                onArenaJoin={(code) => {
                  if (!isOnline) return;
                  sendWs('arena:join', {
                    code,
                    guestUsername: currentUser.username,
                    guestName: currentUser.realName,
                  });
                }}
                onArenaProgress={(code, progress) => {
                  if (!isOnline) return;
                  sendWs('arena:progress', { code, username: currentUser.username, progress });
                }}
                onArenaFinish={(code, score) => {
                  if (!isOnline) return;
                  sendWs('arena:finish', { code, username: currentUser.username, score });
                }}
              />
            )}

            {activeSection === 'library' && (
              <LibraryStore
                key={currentUser.username}
                config={state.config}
                currentUser={currentUser}
                resources={state.resources}
                onUploadResource={async (data) => {
                  if (!isOnline) {
                    throw new Error('Uploading new books requires an internet connection.');
                  }
                  await apiJson('/api/library', {
                    method: 'POST',
                    body: JSON.stringify({
                      ...data,
                      uploadedBy: currentUser.username,
                      role: currentUser.role,
                    }),
                  });
                  await fetchState();
                }}
                onBuyBook={async (resourceId) => {
                  if (!isOnline) {
                    throw new Error('Purchasing store books requires an internet connection.');
                  }
                  const res = await apiJson<{ serial: string; giftName: string }>('/api/store/buy', {
                    method: 'POST',
                    body: JSON.stringify({ username: currentUser.username, resourceId }),
                  });
                  await fetchState();
                  return res;
                }}
                onRedeemSerial={async (serial) => {
                  if (!isOnline) {
                    throw new Error('Serial verification requires an internet connection.');
                  }
                  const res = await apiJson<{ gift: string }>('/api/store/redeem', {
                    method: 'POST',
                    body: JSON.stringify({ username: currentUser.username, serial }),
                  });
                  await fetchState();
                  return res.gift;
                }}
                onSpinWheel={async () => {
                  if (!isOnline) {
                    throw new Error('Weekly Luck Wheel spin requires an internet connection to verify weekly quota.');
                  }
                  const res = await apiJson<{ wonBook: any; chosenIndex: number; totalSlots: number }>(
                    '/api/luck-wheel/spin',
                    {
                      method: 'POST',
                      body: JSON.stringify({ username: currentUser.username }),
                    }
                  );
                  await fetchState();
                  return res;
                }}
              />
            )}

            {activeSection === 'lab' && <PhysicsLabTools />}

            {activeSection === 'ai' && (
              <AiAndAdmin
                key={currentUser.username}
                config={state.config}
                currentUser={currentUser}
                users={state.users}
                attempts={state.attempts}
                errorReports={state.errorReports}
                emailDispatches={state.emailDispatches || []}
                onRunTutor={async (customQuestion) => {
                  if (!isOnline) {
                    return runOfflineAiTutor(state.attempts, state.exams, currentUser, customQuestion);
                  }
                  return apiJson('/api/ai/tutor', {
                    method: 'POST',
                    body: JSON.stringify({
                      studentUsername: currentUser.username,
                      customQuestion,
                    }),
                  });
                }}
                onRunAiHub={async (subject: Subject, query: string) => {
                  if (!isOnline) {
                    return `Offline Mode: Online Gemini STEM Solver is paused without internet.\n\nFor offline solving of "${query}" (${subject}):\n• Use the Scientific Calculator in Physics Lab for numerical evaluation.\n• Inspect worked solutions in Correction Door and cached Library PDFs.`;
                  }
                  const res = await apiJson<{ answer: string }>('/api/ai/hub', {
                    method: 'POST',
                    body: JSON.stringify({ subject, query }),
                  });
                  return res.answer;
                }}
                onSubmitErrorReport={async (data) => {
                  if (!isOnline) {
                    const localReport: ErrorReport = {
                      id: `err-off-${Date.now()}`,
                      reporterUsername: currentUser.username,
                      reporterName: currentUser.realName,
                      target: data.target,
                      subject: data.subject,
                      category: data.category,
                      title: data.title,
                      description: data.description,
                      status: 'open',
                      createdAt: new Date().toISOString(),
                    };
                    updateAndCacheState((prev) => ({
                      ...prev,
                      errorReports: [localReport, ...prev.errorReports],
                    }));
                    queueMutation({
                      url: '/api/errors',
                      method: 'POST',
                      body: {
                        ...data,
                        reporterUsername: currentUser.username,
                        reporterName: currentUser.realName,
                      },
                      label: `Error report: ${data.title}`,
                    });
                    return;
                  }
                  await apiJson('/api/errors', {
                    method: 'POST',
                    body: JSON.stringify({
                      ...data,
                      reporterUsername: currentUser.username,
                      reporterName: currentUser.realName,
                    }),
                  });
                  await fetchState();
                }}
                onRunFixAgent={async (reportId) => {
                  if (!isOnline) {
                    throw new Error('Errors Fixing AI Agent requires an internet connection.');
                  }
                  await apiJson('/api/ai/fix-error', {
                    method: 'POST',
                    body: JSON.stringify({ reportId }),
                  });
                  await fetchState();
                }}
                onResolveErrorReport={async (reportId, resolutionNote) => {
                  if (!isOnline) {
                    throw new Error('Marking an error report resolved requires an internet connection.');
                  }
                  await apiJson(`/api/errors/${reportId}/resolve`, {
                    method: 'POST',
                    body: JSON.stringify({
                      resolutionNote,
                      resolvedBy: currentUser.realName,
                      role: currentUser.role,
                    }),
                  });
                  await fetchState();
                }}
                onUpdateConfig={async (data: Partial<AppConfig>) => {
                  if (!isOnline) {
                    throw new Error('Saving global platform configuration requires an internet connection.');
                  }
                  await apiJson('/api/admin/config', {
                    method: 'POST',
                    body: JSON.stringify(data),
                  });
                  await fetchState();
                }}
                onSetAdminPasskey={async (passkey: string) => {
                  if (!isOnline) {
                    throw new Error('Updating the Owner Admin Passkey requires an internet connection.');
                  }
                  await apiJson('/api/admin/passkey', {
                    method: 'POST',
                    body: JSON.stringify({ passkey }),
                  });
                  await fetchState();
                }}
                onTriggerDigest={async (confirmed: boolean) => {
                  if (!isOnline) {
                    throw new Error('Sending email notifications requires an internet connection.');
                  }
                  await apiJson('/api/notifications/digest', {
                    method: 'POST',
                    body: JSON.stringify({ confirmed }),
                  });
                  await fetchState();
                }}
                onSendAdminEmail={async (data) => {
                  if (!isOnline) {
                    throw new Error('Sending emails to all users requires an internet connection.');
                  }
                  await apiJson('/api/admin/send-emails', {
                    method: 'POST',
                    body: JSON.stringify(data),
                  });
                  await fetchState();
                }}
                onCreateAd={async (data) => {
                  if (!isOnline) {
                    throw new Error('Uploading ads requires an internet connection.');
                  }
                  await apiJson('/api/admin/ads', {
                    method: 'POST',
                    body: JSON.stringify(data),
                  });
                  await fetchState();
                }}
                onToggleAd={async (id) => {
                  if (!isOnline) {
                    throw new Error('Updating ad status requires an internet connection.');
                  }
                  await apiJson(`/api/admin/ads/${id}`, {
                    method: 'PATCH',
                    body: JSON.stringify({}),
                  });
                  await fetchState();
                }}
                onDeleteAd={async (id) => {
                  if (!isOnline) {
                    throw new Error('Deleting ads requires an internet connection.');
                  }
                  await apiJson(`/api/admin/ads/${id}`, {
                    method: 'DELETE',
                  });
                  await fetchState();
                }}
              />
            )}
          </>
        )}
      </main>

      <footer className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 py-4 px-6 text-xs text-slate-500 dark:text-slate-400">
        <div className="max-w-[1320px] mx-auto flex flex-wrap items-center justify-between gap-4">
          <span>
            {state.config.appName} · ACSEE Physics & Mathematics Student Management System
          </span>
          <div className="flex flex-wrap items-center gap-4">
            <button
              onClick={toggleTheme}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-md text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              {theme === 'dark' ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5" />}
              {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
            </button>
            <PWAInstallButton />
            <a href={state.config.whatsappChannelUrl} target="_blank" rel="noreferrer" className="hover:text-slate-900 dark:hover:text-white">
              WhatsApp Channel
            </a>
            <a
              href={`https://wa.me/${state.config.supportTeacherPhone.replace(/[^0-9]/g, '')}`}
              target="_blank"
              rel="noreferrer"
              className="text-rose-700 dark:text-rose-400 hover:underline font-medium"
            >
              Severe Issues ({state.config.supportTeacherPhone})
            </a>
          </div>
        </div>
      </footer>

      <AuthModal
        isOpen={authModalOpen}
        initialMode={authModalMode}
        onClose={() => setAuthModalOpen(false)}
        users={state.users}
        currentUser={currentUser}
        hasAdminPasskey={Boolean(state.config.hasAdminPasskey)}
        onSelectUser={handleSelectUser}
        onRequestAdminCode={handleRequestAdminCode}
        onVerifyAdminCode={handleVerifyAdminCode}
        onSignup={handleSignup}
      />
    </div>
  );
}
