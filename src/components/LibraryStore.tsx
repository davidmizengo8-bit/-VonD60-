import React, { useMemo, useState } from 'react';
import {
  BookOpen,
  Download,
  ExternalLink,
  Gift,
  Image as ImageIcon,
  KeyRound,
  Lock,
  PlayCircle,
  Plus,
  ShoppingBag,
  Upload,
  Video,
} from 'lucide-react';
import type { AppConfig, LibraryResource, Subject, UserProfile } from '../types';
import { ACSEE_SYLLABUS } from '../utils/acsee';
import { downloadDataUrlFile, getYouTubeEmbedUrl, isDirectPlayableVideo } from '../utils/media';
import { downloadBookOffline } from '../utils/pdf';

interface Props {
  config: AppConfig;
  currentUser: UserProfile;
  resources: LibraryResource[];
  onUploadResource: (data: any) => Promise<void>;
  onBuyBook: (resourceId: string) => Promise<{ serial: string; giftName: string }>;
  onRedeemSerial: (serial: string) => Promise<string>;
  onSpinWheel: () => Promise<{ wonBook: LibraryResource; chosenIndex: number; totalSlots: number }>;
}

const WHEEL_COLORS = ['#0f172a', '#0284c7', '#0f766e', '#334155', '#0369a1', '#115e59'];

export const LibraryStore: React.FC<Props> = ({
  config,
  currentUser,
  resources,
  onUploadResource,
  onBuyBook,
  onRedeemSerial,
  onSpinWheel,
}) => {
  const isTeacherOrAdmin = currentUser.role === 'teacher' || currentUser.role === 'admin';
  const canSeeClassExclusive =
    currentUser.role === 'teacher' || currentUser.role === 'admin' || currentUser.role === 'student';

  const [subTab, setSubTab] = useState<'library' | 'store' | 'wheel' | 'upload'>('library');
  const [libTierFilter, setLibTierFilter] = useState<
    'admin_public' | 'teacher_videos_public' | 'teachers_exclusive'
  >('admin_public');
  const [serialInput, setSerialInput] = useState('');
  const [purchaseNotice, setPurchaseNotice] = useState<{ serial: string; giftName: string } | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  // Luck Wheel animation state
  const [wheelRotation, setWheelRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [wheelWinner, setWheelWinner] = useState<LibraryResource | null>(null);

  // Upload resource state
  const [upTitle, setUpTitle] = useState('');
  const [upSubject, setUpSubject] = useState<Subject>('Physics');
  const [upTopic, setUpTopic] = useState(ACSEE_SYLLABUS.Physics.topics[0]);
  const [upAuthor, setUpAuthor] = useState(currentUser.realName);
  const [upTier, setUpTier] = useState<
    'admin_public' | 'teachers_exclusive' | 'teacher_videos_public' | 'store_paid'
  >(currentUser.role === 'admin' ? 'store_paid' : 'teachers_exclusive');
  const [upClassCode, setUpClassCode] = useState(currentUser.classCode || '');
  const [upPrice, setUpPrice] = useState(12000);
  const [upDesc, setUpDesc] = useState('');
  const [upYoutube, setUpYoutube] = useState('');
  const [upVideoFile, setUpVideoFile] = useState('');
  const [upFileName, setUpFileName] = useState('');
  const [upFileDataUrl, setUpFileDataUrl] = useState('');

  const libraryAds = useMemo(
    () =>
      (config.imageAds || []).filter(
        (ad) => ad.active && (ad.placement === 'library' || ad.placement === 'all')
      ),
    [config.imageAds]
  );

  const libraryItems = useMemo(() => {
    const allowedFilter = canSeeClassExclusive ? libTierFilter : libTierFilter === 'teachers_exclusive' ? 'admin_public' : libTierFilter;
    return resources.filter((r) => r.tier === allowedFilter);
  }, [resources, libTierFilter, canSeeClassExclusive]);

  const storeItems = useMemo(
    () => resources.filter((r) => r.tier === 'store_paid'),
    [resources]
  );

  const wheelItems = useMemo(
    () => resources.filter((r) => r.tier !== 'teachers_exclusive'),
    [resources]
  );

  const handleBuy = async (resourceId: string) => {
    setStatusNotice(null);
    try {
      const res = await onBuyBook(resourceId);
      setPurchaseNotice(res);
    } catch (err: any) {
      setStatusNotice(err?.message || 'Purchase failed.');
    }
  };

  const handleRedeem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serialInput.trim()) return;
    setStatusNotice(null);
    try {
      const gift = await onRedeemSerial(serialInput.trim());
      setStatusNotice(`Serial verified! Unlocked: ${gift}`);
      setSerialInput('');
    } catch (err: any) {
      setStatusNotice(err?.message || 'Invalid serial number.');
    }
  };

  const handleSpin = async () => {
    if (spinning || wheelItems.length === 0) return;
    setStatusNotice(null);
    setSpinning(true);
    try {
      const res = await onSpinWheel();
      const sliceDeg = 360 / Math.max(1, res.totalSlots);
      const targetDeg = 360 * 5 + (360 - res.chosenIndex * sliceDeg - sliceDeg / 2);
      setWheelRotation((prev) => prev + targetDeg);
      setTimeout(() => {
        setSpinning(false);
        setWheelWinner(res.wonBook);
      }, 3100);
    } catch (err: any) {
      setSpinning(false);
      setStatusNotice(err?.message || 'Unable to spin this week.');
    }
  };

  const handleDocUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      setStatusNotice('Study document file must be under 20 MB.');
      return;
    }
    setUpFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setUpFileDataUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleVideoFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) {
      setStatusNotice('Uploaded video file must be under 25 MB (or paste a YouTube / Video URL).');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setUpVideoFile(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!upTitle.trim()) return;
    if (upTier === 'teacher_videos_public' && !upYoutube.trim() && !upVideoFile.trim()) {
      setStatusNotice('Provide a YouTube URL or upload a video file for an all-students Teacher Video.');
      return;
    }
    setStatusNotice(null);
    try {
      await onUploadResource({
        title: upTitle.trim(),
        subject: upSubject,
        topic: upTopic.trim() || 'ACSEE Core Revision',
        author: upAuthor.trim(),
        tier: upTier,
        classCode: upTier === 'teachers_exclusive' ? upClassCode.trim().toUpperCase() || currentUser.classCode : undefined,
        priceTzs: upTier === 'store_paid' ? upPrice : undefined,
        description: upDesc.trim() || 'ACSEE Physics & Mathematics study resource.',
        youtubeUrl: upYoutube.trim(),
        videoAttachmentUrl: upVideoFile.trim() || undefined,
        fileName: upFileName.trim() || `${upTitle.trim().replace(/\s+/g, '_')}.pdf`,
        fileDataUrl: upFileDataUrl || undefined,
      });
      setUpTitle('');
      setUpDesc('');
      setUpYoutube('');
      setUpVideoFile('');
      setUpFileName('');
      setUpFileDataUrl('');
      setStatusNotice('Resource published live.');
      if (upTier === 'store_paid') {
        setSubTab('store');
      } else {
        setSubTab('library');
        setLibTierFilter(upTier);
      }
    } catch (err: any) {
      setStatusNotice(err?.message || 'Upload failed.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div className="flex flex-wrap items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
          {(
            [
              ['library', 'In-App Library & Videos'],
              ['store', 'Official Book Store'],
              ['wheel', 'Weekly Luck Wheel'],
              ...(isTeacherOrAdmin ? ([['upload', 'Upload Books & Videos']] as const) : []),
            ] as const
          ).map(([id, label]) => (
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

        <p className="text-xs text-slate-500 dark:text-slate-400">
          Class Exclusive Materials · All-Student Teacher Videos · Offline PDF Downloads
        </p>
      </div>

      {statusNotice && (
        <div className="px-4 py-2.5 bg-sky-50 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-900 text-sky-900 dark:text-sky-100 text-sm rounded-lg flex items-center justify-between gap-4">
          <span>{statusNotice}</span>
          <button onClick={() => setStatusNotice(null)} className="text-xs font-medium underline shrink-0">
            Dismiss
          </button>
        </div>
      )}

      {purchaseNotice && (
        <div className="p-5 bg-teal-50 dark:bg-teal-950/50 border border-teal-200 dark:border-teal-900 rounded-xl space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-teal-950 dark:text-teal-100">
              Purchase Confirmed — Special Serial Number Issued
            </p>
            <button
              onClick={() => setPurchaseNotice(null)}
              className="text-xs underline text-teal-900 dark:text-teal-300"
            >
              Close
            </button>
          </div>
          <p className="font-mono text-base font-semibold text-teal-900 dark:text-teal-200">
            {purchaseNotice.serial}
          </p>
          <p className="text-xs text-teal-800 dark:text-teal-300">
            Exclusive App Gift Unlocked: <strong>{purchaseNotice.giftName}</strong>
          </p>
        </div>
      )}

      {/* Admin Uploaded Image & Video Advertisements (Library & Store Placement) */}
      {libraryAds.length > 0 && (subTab === 'library' || subTab === 'store') && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {libraryAds.map((ad) => {
            const ytEmbed = ad.videoUrl ? getYouTubeEmbedUrl(ad.videoUrl) : null;
            const directVideo = ad.videoUrl ? isDirectPlayableVideo(ad.videoUrl) : false;
            const isVideoAd = ad.mediaType === 'video' || Boolean(ad.videoUrl);
            return (
              <div
                key={ad.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden flex flex-col sm:flex-row"
              >
                <div className="sm:w-52 aspect-[16/9] sm:aspect-auto bg-slate-900 shrink-0 overflow-hidden flex items-center justify-center">
                  {isVideoAd && ytEmbed ? (
                    <iframe
                      src={ytEmbed}
                      title={ad.title}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      className="w-full h-full min-h-[150px]"
                    />
                  ) : isVideoAd && directVideo && ad.videoUrl ? (
                    <video
                      src={ad.videoUrl}
                      controls
                      playsInline
                      className="w-full h-full object-cover max-h-48"
                    />
                  ) : isVideoAd && ad.videoUrl ? (
                    <a
                      href={ad.videoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-sky-300 hover:underline p-4"
                    >
                      <Video className="w-4 h-4" />
                      Watch Video Ad
                    </a>
                  ) : failedImages[`ad-${ad.id}`] || !ad.imageUrl ? (
                    <div className="flex flex-col items-center gap-1 text-slate-400 p-4">
                      <ImageIcon className="w-6 h-6" />
                      <span className="text-[11px]">Sponsored Resource</span>
                    </div>
                  ) : (
                    <img
                      src={ad.imageUrl}
                      alt={ad.title}
                      referrerPolicy="no-referrer"
                      onError={() => setFailedImages((p) => ({ ...p, [`ad-${ad.id}`]: true }))}
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
                <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-medium text-sky-700 dark:text-sky-400">
                      {isVideoAd ? 'Sponsored Video Ad' : 'Sponsored Resource'}
                    </p>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                      {ad.title}
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{ad.subtitle}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {ad.externalUrl ? (
                      <a
                        href={ad.externalUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-900 dark:bg-sky-600 text-white rounded-lg hover:bg-slate-800 dark:hover:bg-sky-700 whitespace-nowrap shrink-0"
                      >
                        {ad.ctaLabel || 'Open Offer'}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      <button
                        onClick={() => setSubTab('store')}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-900 dark:bg-sky-600 text-white rounded-lg hover:bg-slate-800 dark:hover:bg-sky-700 whitespace-nowrap shrink-0"
                      >
                        {ad.ctaLabel || 'Browse Store'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {subTab === 'library' && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">In-App Library & Teacher Videos</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {libTierFilter === 'teachers_exclusive'
                  ? `Exclusive library scoped strictly to your class (${currentUser.classCode || 'unassigned'}) and its teachers.`
                  : libTierFilter === 'teacher_videos_public'
                    ? 'Teacher Video Lessons published for ALL students across the entire app.'
                    : 'Public ACSEE books & guides accessible across the app.'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
              <button
                onClick={() => setLibTierFilter('admin_public')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${
                  libTierFilter === 'admin_public'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                App Library (All Users)
              </button>
              <button
                onClick={() => setLibTierFilter('teacher_videos_public')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${
                  libTierFilter === 'teacher_videos_public'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                Teacher Videos (All Students)
              </button>
              {canSeeClassExclusive && (
                <button
                  onClick={() => setLibTierFilter('teachers_exclusive')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${
                    libTierFilter === 'teachers_exclusive'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {currentUser.role === 'student'
                    ? `My Class Exclusive (${currentUser.classCode})`
                    : 'Teachers Exclusive Class Library'}
                </button>
              )}
            </div>
          </div>

          {libTierFilter === 'teachers_exclusive' && !canSeeClassExclusive ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center space-y-2">
              <Lock className="w-8 h-8 text-slate-400 mx-auto" />
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Exclusive Class Library
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                Class-exclusive teacher materials are restricted to teachers and their enrolled students.
              </p>
            </div>
          ) : libraryItems.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center space-y-2">
              <BookOpen className="w-8 h-8 text-slate-400 mx-auto" />
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                No {libTierFilter === 'teacher_videos_public' ? 'Teacher Videos' : libTierFilter === 'teachers_exclusive' ? 'Class-Exclusive Materials' : 'Library Books'} Uploaded Yet
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                {libTierFilter === 'teachers_exclusive'
                  ? `Materials uploaded by a teacher for class ${currentUser.classCode || 'your class'} will appear exclusively for enrolled students here.`
                  : libTierFilter === 'teacher_videos_public'
                    ? 'When teachers upload Physics or Mathematics video lessons, they become viewable by all students using the app.'
                    : 'Teachers and Platform Admin can upload textbooks and revision guides in Upload Books & Videos.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {libraryItems.map((book) => {
                const videoSource = book.videoAttachmentUrl || book.youtubeUrl;
                const ytEmbed = videoSource ? getYouTubeEmbedUrl(videoSource) : null;
                const directVideo = videoSource ? isDirectPlayableVideo(videoSource) : false;

                return (
                  <div
                    key={book.id}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden flex flex-col"
                  >
                    <div className="aspect-[16/10] bg-slate-900 overflow-hidden flex items-center justify-center">
                      {ytEmbed ? (
                        <iframe
                          src={ytEmbed}
                          title={book.title}
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                          className="w-full h-full"
                        />
                      ) : directVideo && videoSource ? (
                        <video
                          src={videoSource}
                          controls
                          playsInline
                          className="w-full h-full object-cover"
                        />
                      ) : failedImages[book.id] || !book.coverImage ? (
                        <BookOpen className="w-10 h-10 text-slate-500" />
                      ) : (
                        <img
                          src={book.coverImage}
                          alt={book.title}
                          referrerPolicy="no-referrer"
                          onError={() => setFailedImages((p) => ({ ...p, [book.id]: true }))}
                          className="w-full h-full object-cover"
                        />
                      )}
                    </div>
                    <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                      <div className="space-y-1.5">
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {book.subject} · {book.topic}
                          {book.classCode && book.tier === 'teachers_exclusive' ? ` · Class ${book.classCode}` : ''}
                        </p>
                        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                          {book.title}
                        </h3>
                        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                          {book.description}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          By {book.author}
                          {book.tier === 'teacher_videos_public' && ' · Visible to All Students'}
                        </p>
                      </div>

                      <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-2">
                        {videoSource && (
                          <a
                            href={videoSource}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-900/50 whitespace-nowrap shrink-0"
                          >
                            <PlayCircle className="w-3.5 h-3.5" />
                            Open Video
                          </a>
                        )}
                        <button
                          onClick={() => {
                            if (book.fileDataUrl) {
                              downloadDataUrlFile(book.fileDataUrl, book.fileName);
                            } else {
                              downloadBookOffline(
                                book.title,
                                book.author,
                                book.topic,
                                book.subject,
                                book.description,
                                config.appName
                              );
                            }
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-900 dark:bg-sky-600 text-white rounded-lg hover:bg-slate-800 dark:hover:bg-sky-700 whitespace-nowrap shrink-0"
                        >
                          <Download className="w-3.5 h-3.5" />
                          {book.fileDataUrl ? 'Download File' : 'Save PDF to Device'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {subTab === 'store' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 flex flex-col justify-between space-y-3">
              <div>
                <p className="text-xs font-medium text-sky-700 dark:text-sky-400">
                  Official Store · Uploaded Only by Platform Admin
                </p>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mt-1">
                  {config.featuredBannerTitle}
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                  Every store purchase downloads to your device storage and automatically issues a Special Serial Number to unlock exclusive app gifts.
                </p>
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-400">
                Your Active Serial Numbers:{' '}
                <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                  {currentUser.purchasedSerials.length > 0 ? currentUser.purchasedSerials.join(', ') : 'None yet'}
                </span>
              </div>
            </div>

            <form
              onSubmit={handleRedeem}
              className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-3"
            >
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-teal-700 dark:text-teal-400" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Unlock Gift via Serial Number
                </h3>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Enter your purchase serial (e.g., <span className="font-mono">EF-9421-PHYS</span>) to unlock exclusive study packs.
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={serialInput}
                  onChange={(e) => setSerialInput(e.target.value)}
                  placeholder="EF-XXXX-XXXX"
                  className="flex-1 px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg font-mono uppercase"
                />
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-medium bg-teal-700 text-white rounded-lg hover:bg-teal-800 whitespace-nowrap shrink-0"
                >
                  Unlock Gift
                </button>
              </div>
            </form>
          </div>

          {storeItems.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center space-y-2">
              <ShoppingBag className="w-8 h-8 text-slate-400 mx-auto" />
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                No Store Books Published Yet
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                Official paid textbooks uploaded by the Platform Owner Admin appear here live.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {storeItems.map((book) => (
                <div
                  key={book.id}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden flex flex-col sm:flex-row"
                >
                  <div className="sm:w-44 aspect-[3/4] bg-slate-900 shrink-0 flex items-center justify-center">
                    {failedImages[book.id] || !book.coverImage ? (
                      <BookOpen className="w-10 h-10 text-slate-500" />
                    ) : (
                      <img
                        src={book.coverImage}
                        alt={book.title}
                        referrerPolicy="no-referrer"
                        onError={() => setFailedImages((p) => ({ ...p, [book.id]: true }))}
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                  <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                    <div className="space-y-1.5">
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {book.subject} · {book.topic}
                      </p>
                      <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                        {book.title}
                      </h3>
                      <p className="text-xs text-slate-600 dark:text-slate-300">{book.description}</p>
                      <p className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100 tabular-nums pt-1">
                        TZS {(book.priceTzs || 12000).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => handleBuy(book.id)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-slate-900 dark:bg-sky-600 text-white rounded-lg hover:bg-slate-800 dark:hover:bg-sky-700 whitespace-nowrap shrink-0"
                      >
                        <ShoppingBag className="w-3.5 h-3.5" />
                        Buy &amp; Get Serial
                      </button>
                      <button
                        onClick={() => {
                          if (book.fileDataUrl) {
                            downloadDataUrlFile(book.fileDataUrl, book.fileName);
                          } else {
                            downloadBookOffline(
                              book.title,
                              book.author,
                              book.topic,
                              book.subject,
                              book.description,
                              config.appName
                            );
                          }
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download
                      </button>
                      {book.youtubeUrl && (
                        <a
                          href={book.youtubeUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-2 text-xs font-medium text-rose-700 dark:text-rose-400 hover:underline"
                        >
                          <PlayCircle className="w-3.5 h-3.5" />
                          Video
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {subTab === 'wheel' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 flex flex-col items-center space-y-6">
            {wheelItems.length === 0 ? (
              <div className="py-14 text-center space-y-2">
                <Gift className="w-10 h-10 text-slate-400 mx-auto" />
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Luck Wheel Prize Pool Empty
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs">
                  Upload public library books or teacher video packs first so students can spin for a free weekly resource.
                </p>
              </div>
            ) : (
              <>
                <div className="relative w-72 h-72">
                  <div className="w-0 h-0 border-l-[10px] border-r-[10px] border-t-[18px] border-l-transparent border-r-transparent border-t-rose-600 absolute -top-3 left-1/2 -translate-x-1/2 z-10" />
                  <svg
                    viewBox="0 0 200 200"
                    className="w-full h-full rounded-full border-4 border-slate-900 dark:border-slate-700 transition-transform duration-[3000ms] ease-out"
                    style={{ transform: `rotate(${wheelRotation}deg)` }}
                  >
                    {wheelItems.map((item, i) => {
                      const total = wheelItems.length;
                      const angle = 360 / total;
                      if (total === 1) {
                        return (
                          <g key={item.id}>
                            <circle cx="100" cy="100" r="100" fill={WHEEL_COLORS[0]} />
                            <text x="100" y="50" fill="#ffffff" fontSize="8" fontWeight="600" textAnchor="middle">
                              {item.title.slice(0, 18)}
                            </text>
                          </g>
                        );
                      }
                      const startRad = ((i * angle - 90) * Math.PI) / 180;
                      const endRad = (((i + 1) * angle - 90) * Math.PI) / 180;
                      const x1 = 100 + 100 * Math.cos(startRad);
                      const y1 = 100 + 100 * Math.sin(startRad);
                      const x2 = 100 + 100 * Math.cos(endRad);
                      const y2 = 100 + 100 * Math.sin(endRad);
                      const largeArc = angle > 180 ? 1 : 0;
                      const midAngle = i * angle + angle / 2;
                      return (
                        <g key={item.id}>
                          <path
                            d={`M100,100 L${x1},${y1} A100,100 0 ${largeArc},1 ${x2},${y2} Z`}
                            fill={WHEEL_COLORS[i % WHEEL_COLORS.length]}
                            stroke="#ffffff"
                            strokeWidth="1"
                          />
                          <text
                            x="100"
                            y="26"
                            fill="#ffffff"
                            fontSize="6.5"
                            fontWeight="600"
                            textAnchor="middle"
                            transform={`rotate(${midAngle} 100 100)`}
                          >
                            {item.title.slice(0, 16)}
                          </text>
                        </g>
                      );
                    })}
                    <circle cx="100" cy="100" r="16" fill="#ffffff" stroke="#0f172a" strokeWidth="3" />
                  </svg>
                </div>

                <button
                  onClick={handleSpin}
                  disabled={spinning}
                  className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-medium bg-slate-900 dark:bg-sky-600 text-white rounded-lg hover:bg-slate-800 dark:hover:bg-sky-700 disabled:opacity-50"
                >
                  <Gift className="w-4 h-4" />
                  {spinning ? 'Spinning Weekly Wheel...' : 'Spin Weekly Book Wheel'}
                </button>
              </>
            )}
          </div>

          <div className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Weekly Free Book Luck Wheel
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Every week, each student receives one free spin on the {config.appName} Luck Wheel to win a live Physics or Mathematics revision book directly into their storage library.
            </p>

            {wheelWinner ? (
              <div className="p-4 bg-teal-50 dark:bg-teal-950/50 border border-teal-200 dark:border-teal-900 rounded-xl space-y-3">
                <p className="text-xs font-semibold text-teal-800 dark:text-teal-300">
                  Congratulations — Weekly Book Unlocked
                </p>
                <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  {wheelWinner.title}
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  {wheelWinner.subject} · {wheelWinner.author}
                </p>
                <button
                  onClick={() => {
                    if (wheelWinner.fileDataUrl) {
                      downloadDataUrlFile(wheelWinner.fileDataUrl, wheelWinner.fileName);
                    } else {
                      downloadBookOffline(
                        wheelWinner.title,
                        wheelWinner.author,
                        wheelWinner.topic,
                        wheelWinner.subject,
                        wheelWinner.description,
                        config.appName
                      );
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-teal-700 text-white rounded-lg hover:bg-teal-800"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download Free Book to Device
                </button>
              </div>
            ) : (
              <div className="space-y-2 border-t border-slate-200 dark:border-slate-800 pt-4">
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Books &amp; Video Packs in Prize Pool ({wheelItems.length}):
                </p>
                {wheelItems.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">No items uploaded yet.</p>
                ) : (
                  <ul className="text-xs text-slate-600 dark:text-slate-400 space-y-1.5">
                    {wheelItems.map((b) => (
                      <li key={b.id} className="flex items-center gap-2">
                        <BookOpen className="w-3.5 h-3.5 text-sky-700 dark:text-sky-400" />
                        <span>
                          {b.title} ({b.subject})
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {subTab === 'upload' && isTeacherOrAdmin && (
        <form
          onSubmit={handleUpload}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4 max-w-2xl"
        >
          <div className="flex items-center gap-2">
            <Upload className="w-4 h-4 text-sky-700 dark:text-sky-400" />
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Upload Books, Class Materials &amp; Student Videos
            </h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Teacher Exclusive Materials are visible only to students in your class. Videos uploaded under Teacher Video Lesson are viewable by ALL students using the app.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Book / Lesson Title
              </label>
              <input
                type="text"
                required
                value={upTitle}
                onChange={(e) => setUpTitle(e.target.value)}
                placeholder="e.g. ACSEE Thermal Physics Workbook"
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Subject
              </label>
              <select
                value={upSubject}
                onChange={(e) => {
                  const s = e.target.value as Subject;
                  setUpSubject(s);
                  setUpTopic(ACSEE_SYLLABUS[s].topics[0]);
                }}
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              >
                <option value="Physics">Physics (Code 131)</option>
                <option value="Mathematics">Mathematics (Code 142)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                ACSEE Syllabus Topic
              </label>
              <select
                value={upTopic}
                onChange={(e) => setUpTopic(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              >
                {ACSEE_SYLLABUS[upSubject].topics.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Audience / Library Tier
              </label>
              <select
                value={upTier}
                onChange={(e) => setUpTier(e.target.value as any)}
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              >
                <option value="teachers_exclusive">
                  My Students&apos; Exclusive Library ({upClassCode || currentUser.classCode || 'Class Only'})
                </option>
                <option value="teacher_videos_public">
                  Teacher Video Lesson (For All Students App-Wide)
                </option>
                <option value="admin_public">Public App Library (All Users)</option>
                {currentUser.role === 'admin' && (
                  <option value="store_paid">Official Book Store (Admin Only)</option>
                )}
              </select>
            </div>

            {upTier === 'teachers_exclusive' && (
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Target Class Code (Visible strictly to your students in this class)
                </label>
                <input
                  type="text"
                  required
                  value={upClassCode}
                  onChange={(e) => setUpClassCode(e.target.value)}
                  placeholder="e.g. PCM-2026"
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg font-mono uppercase"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Upload Study Document (PDF, DOC, TXT)
              </label>
              <input
                type="file"
                accept=".pdf,.doc,.docx,.txt,image/*"
                onChange={handleDocUpload}
                className="w-full text-xs text-slate-600 dark:text-slate-300 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-slate-100 dark:file:bg-slate-800 file:text-slate-700 dark:file:text-slate-200"
              />
              {upFileName && (
                <p className="text-[11px] text-teal-700 dark:text-teal-400 mt-1 truncate">
                  Attached: {upFileName}
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Upload Video File (MP4 / WebM)
              </label>
              <input
                type="file"
                accept="video/*"
                onChange={handleVideoFileUpload}
                className="w-full text-xs text-slate-600 dark:text-slate-300 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-slate-100 dark:file:bg-slate-800 file:text-slate-700 dark:file:text-slate-200"
              />
              {upVideoFile && upVideoFile.startsWith('data:video/') && (
                <p className="text-[11px] text-teal-700 dark:text-teal-400 mt-1">
                  Video clip ready for upload
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                YouTube Video URL (optional)
              </label>
              <input
                type="url"
                value={upYoutube}
                onChange={(e) => setUpYoutube(e.target.value)}
                placeholder="https://youtube.com/watch?v=..."
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Direct Video URL (optional)
              </label>
              <input
                type="text"
                value={upVideoFile.startsWith('data:video/') ? '' : upVideoFile}
                onChange={(e) => setUpVideoFile(e.target.value)}
                placeholder="https://.../lesson.mp4"
                className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg"
              />
            </div>
          </div>

          {upTier === 'store_paid' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Price (TZS)
                </label>
                <input
                  type="number"
                  value={upPrice}
                  onChange={(e) => setUpPrice(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Author
                </label>
                <input
                  type="text"
                  value={upAuthor}
                  onChange={(e) => setUpAuthor(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Description
            </label>
            <textarea
              rows={3}
              value={upDesc}
              onChange={(e) => setUpDesc(e.target.value)}
              placeholder="Outline key chapters, ACSEE exam relevance, and covered derivations..."
              className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg"
            />
          </div>

          <button
            type="submit"
            className="inline-flex items-center gap-1.5 px-5 py-2.5 text-xs font-medium bg-slate-900 dark:bg-sky-600 text-white rounded-lg hover:bg-slate-800 dark:hover:bg-sky-700"
          >
            <Plus className="w-4 h-4" />
            Publish to Library
          </button>
        </form>
      )}
    </div>
  );
};
