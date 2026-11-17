export type UserRole = 'student' | 'teacher' | 'parent' | 'admin';

export type Subject = 'Physics' | 'Mathematics';

export interface UserProfile {
  id: string;
  realName: string;
  username: string;
  role: UserRole;
  className: string;
  classCode: string;
  phone: string; // WhatsApp number
  schoolName: string;
  email: string;
  profilePhoto: string;
  region: string;
  friends: string[]; // usernames
  likedExamIds: string[];
  savedExamIds: string[];
  sharedCount: number;
  purchasedSerials: string[];
  unlockedGifts: string[];
  connectedChildUsername?: string; // for parents
  lastWheelSpinWeek?: string;
}

export interface ClassGroup {
  id: string;
  name: string;
  school: string;
  adminPhone: string;
  classCode: string;
  teacherUsername: string;
  memberUsernames: string[];
  createdAt: string;
}

export type ExamQuestionType = 'mcq' | 'short_answer' | 'explanation' | 'proof';

export interface ExamQuestion {
  id: string;
  questionType?: ExamQuestionType;
  topic: string;
  section?: 'Section A' | 'Section B';
  prompt: string;
  options: string[];
  correctIndex: number;
  expectedAnswer?: string;
  markingPoints?: string[];
  marks: number;
  explanation: string;
}

export interface ExamItem {
  id: string;
  title: string;
  subject: Subject;
  paperCode: string; // e.g., 131/1, 131/2, 131/3A, 142/1, 142/2
  acseeSectionFormat?: string;
  kind: 'teacher_exam' | 'past_paper' | 'competition';
  creatorUsername: string;
  creatorName: string;
  schoolName: string;
  classCode?: string; // if assigned to a class
  durationMinutes: number; // 180 minutes (3 hours) standard
  antiRepetition: boolean;
  requiresTeacherReview: boolean;
  competitionScope?: 'individual' | 'class_to_class' | 'school_to_school';
  competitionCode?: string;
  joinedParticipants?: string[]; // classCodes or schoolNames that joined via competitionCode
  likes: number;
  saves: number;
  shares: number;
  createdAt: string;
  questions: ExamQuestion[];
  attachmentName?: string;
  attachmentDataUrl?: string;
  videoAttachmentUrl?: string;
}

export interface QuestionResult {
  questionId: string;
  questionType?: ExamQuestionType;
  topic: string;
  selectedIndex: number;
  correctIndex: number;
  writtenAnswer?: string;
  expectedAnswer?: string;
  aiFeedback?: string;
  isCorrect: boolean;
  marksAwarded: number;
  maxMarks: number;
}

export interface ExamAttempt {
  id: string;
  examId: string;
  examTitle: string;
  subject: Subject;
  studentUsername: string;
  studentName: string;
  schoolName: string;
  className: string;
  classCode: string;
  mode: 'digital' | 'physical_scan' | '1v1_arena' | 'class_competition' | 'school_competition';
  startedAt: string;
  submittedAt: string;
  elapsedSeconds: number;
  score: number;
  totalMarks: number;
  percentage: number;
  acseeGrade: 'A' | 'B' | 'C' | 'D' | 'E' | 'S' | 'F';
  acseePoints: number;
  status: 'pending_review' | 'released';
  teacherNote?: string;
  scanSummary?: string;
  questionResults: QuestionResult[];
}

export interface LibraryResource {
  id: string;
  title: string;
  subject: Subject;
  topic: string;
  author: string;
  tier: 'admin_public' | 'teachers_exclusive' | 'teacher_videos_public' | 'store_paid';
  classCode?: string;
  schoolName?: string;
  description: string;
  coverImage: string;
  youtubeUrl: string;
  videoAttachmentUrl?: string;
  fileName: string;
  fileDataUrl?: string;
  priceTzs?: number; // for store books
  uploadedBy: string;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  roomId: string; // e.g., friend:alice:bob or community:id
  senderUsername: string;
  senderName: string;
  text: string;
  replyToId?: string;
  replyPreview?: string;
  attachmentName?: string;
  attachmentDataUrl?: string;
  attachmentType?: 'image' | 'file';
  status?: 'sent' | 'delivered' | 'read';
  createdAt: string;
}

export interface CommunityGroup {
  id: string;
  name: string;
  subject: Subject | 'Physics & Math';
  description: string;
  creatorUsername: string;
  members: string[];
  createdAt: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  category: 'feature' | 'book' | 'exam' | 'certificate' | 'system';
  emailDigestSent: boolean;
  createdAt: string;
}

export interface EmailDispatchLog {
  id: string;
  subject: string;
  bodyPreview: string;
  recipientCount: number;
  recipientEmails: string[];
  confirmedBy: string;
  kind: 'digest' | 'broadcast';
  sentAt: string;
}

export interface ImageAdItem {
  id: string;
  title: string;
  subtitle: string;
  mediaType?: 'image' | 'video';
  imageUrl?: string;
  videoUrl?: string;
  ctaLabel?: string;
  ctaSection?: 'workspace' | 'exams' | 'library' | 'lab' | 'ai';
  externalUrl?: string;
  placement: 'workspace' | 'library' | 'all';
  active: boolean;
  createdAt: string;
}

export interface ErrorReport {
  id: string;
  reporterUsername: string;
  reporterName: string;
  target: 'admin' | 'teacher';
  subject: Subject | 'System';
  category?: 'Exam Question' | 'Practical Apparatus' | 'ACSEE Grading' | 'Technical Bug';
  title: string;
  description: string;
  status: 'open' | 'ai_diagnosed' | 'resolved';
  aiFixSuggestion?: string;
  resolutionNote?: string;
  resolvedBy?: string;
  resolvedAt?: string;
  createdAt: string;
}

export interface ActiveExamSession {
  sessionId: string;
  examId: string;
  examTitle: string;
  studentUsername: string;
  studentName: string;
  startedAt: number;
  expiresAt: number;
}

export interface ArenaRoom {
  code: string;
  examId: string;
  examTitle: string;
  subject: Subject;
  hostUsername: string;
  hostName: string;
  guestUsername?: string;
  guestName?: string;
  hostProgress: number;
  guestProgress: number;
  hostScore?: number;
  guestScore?: number;
  status: 'waiting' | 'active' | 'finished';
  startedAt?: number;
}

export interface AppConfig {
  appName: string;
  whatsappChannelUrl: string;
  supportTeacherPhone: string;
  featuredBannerTitle: string;
  featuredBannerSubtitle: string;
  monthlyCertificateMonth: string;
  hasAdminPasskey?: boolean;
  hasEmailTransport?: boolean;
  imageAds?: ImageAdItem[];
}

export interface AppPerformanceSummary {
  totalUsers: number;
  roleCounts: {
    students: number;
    teachers: number;
    parents: number;
    admin: number;
  };
  totalClasses: number;
  totalExams: number;
  totalResources: number;
  liveExamSittingCount: number;
  totalAttempts: number;
  releasedAttempts: number;
  pendingReviewAttempts: number;
  overallAveragePct: number;
  overallPassRatePct: number;
  subjectStats: Array<{
    subject: Subject;
    attemptsCount: number;
    averagePct: number;
    passRatePct: number;
  }>;
  gradeDistribution: Array<{
    grade: 'A' | 'B' | 'C' | 'D' | 'E' | 'S' | 'F';
    count: number;
  }>;
  schoolCohorts: Array<{
    schoolName: string;
    classCode: string;
    studentCount: number;
    attemptsCount: number;
    averagePct: number;
  }>;
  errorHealth: {
    open: number;
    aiDiagnosed: number;
    resolved: number;
  };
  competitionCount: number;
}

export interface StoreState {
  config: AppConfig;
  users: UserProfile[];
  classes: ClassGroup[];
  exams: ExamItem[];
  attempts: ExamAttempt[];
  resources: LibraryResource[];
  messages: ChatMessage[];
  communities: CommunityGroup[];
  notifications: NotificationItem[];
  emailDispatches?: EmailDispatchLog[];
  errorReports: ErrorReport[];
  appPerformance?: AppPerformanceSummary;
}
