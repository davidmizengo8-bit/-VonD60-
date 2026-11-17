import React, { useEffect, useState } from 'react';
import { Lock, MailCheck, ShieldCheck, X } from 'lucide-react';
import type { UserProfile, UserRole } from '../types';

interface Props {
  isOpen: boolean;
  initialMode?: 'switch' | 'signup' | 'admin';
  onClose: () => void;
  users: UserProfile[];
  currentUser: UserProfile | null;
  hasAdminPasskey?: boolean;
  onSelectUser: (username: string) => Promise<void>;
  onRequestAdminCode: (payload: {
    email: string;
    passkey?: string;
  }) => Promise<{ deliveryMode: string; previewCode?: string }>;
  onVerifyAdminCode: (payload: {
    email: string;
    code: string;
    passkey?: string;
  }) => Promise<void>;
  onSignup: (payload: {
    realName: string;
    username: string;
    role: UserRole;
    className: string;
    classCode: string;
    phone: string;
    schoolName: string;
    email: string;
    profilePhoto: string;
    region: string;
    connectedChildUsername?: string;
  }) => Promise<void>;
}

export const AuthModal: React.FC<Props> = ({
  isOpen,
  initialMode,
  onClose,
  users,
  currentUser,
  hasAdminPasskey,
  onSelectUser,
  onRequestAdminCode,
  onVerifyAdminCode,
  onSignup,
}) => {
  const publicSwitchableUsers = users.filter((u) => u.role !== 'admin');
  const [mode, setMode] = useState<'switch' | 'signup' | 'admin'>(
    initialMode || (publicSwitchableUsers.length === 0 ? 'signup' : 'switch')
  );
  const [realName, setRealName] = useState('');
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<'student' | 'teacher' | 'parent'>('student');
  const [className, setClassName] = useState('Form VI PCM');
  const [classCode, setClassCode] = useState('');
  const [phone, setPhone] = useState('+255');
  const [schoolName, setSchoolName] = useState('');
  const [email, setEmail] = useState('');
  const [region, setRegion] = useState('');
  const [profilePhoto, setProfilePhoto] = useState('');
  const [connectedChildUsername, setConnectedChildUsername] = useState('');

  const [adminEmail, setAdminEmail] = useState('');
  const [adminPasskey, setAdminPasskey] = useState('');
  const [adminCodeSent, setAdminCodeSent] = useState(false);
  const [adminOtpCode, setAdminOtpCode] = useState('');
  const [adminDeliveryInfo, setAdminDeliveryInfo] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode || (publicSwitchableUsers.length === 0 ? 'signup' : 'switch'));
      setError(null);
    }
  }, [isOpen, initialMode, publicSwitchableUsers.length]);

  if (!isOpen) return null;

  const studentAccounts = users.filter((u) => u.role === 'student');

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setProfilePhoto(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await onSignup({
        realName,
        username,
        role,
        className,
        classCode,
        phone,
        schoolName,
        email,
        profilePhoto,
        region,
        connectedChildUsername: role === 'parent' ? connectedChildUsername : undefined,
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Signup failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await onRequestAdminCode({
        email: adminEmail.trim(),
        passkey: adminPasskey.trim() || undefined,
      });
      setAdminCodeSent(true);
      if (res.deliveryMode === 'email') {
        setAdminDeliveryInfo(`A 6-digit verification code has been emailed to ${adminEmail.trim()}. Check your inbox and enter it below.`);
      } else {
        setAdminDeliveryInfo(
          res.previewCode
            ? `Email verification code generated for ${adminEmail.trim()}: ${res.previewCode} (local preview delivery — enter below to verify).`
            : `A 6-digit verification code was issued for ${adminEmail.trim()}.`
        );
      }
    } catch (err: any) {
      setError(err?.message || 'Owner email verification request failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await onVerifyAdminCode({
        email: adminEmail.trim(),
        code: adminOtpCode.trim(),
        passkey: adminPasskey.trim() || undefined,
      });
      setAdminPasskey('');
      setAdminOtpCode('');
      setAdminCodeSent(false);
      setAdminDeliveryInfo(null);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Invalid verification code.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Account Sign In & Live Registration
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Sign into a registered Student, Teacher, or Parent profile, register a new account, or verify Owner Admin by email.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
            <button
              type="button"
              onClick={() => {
                setMode('switch');
                setError(null);
              }}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${
                mode === 'switch'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              Sign In / Switch ({publicSwitchableUsers.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('signup');
                setError(null);
              }}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${
                mode === 'signup'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              Create New Account
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('admin');
                setError(null);
              }}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${
                mode === 'admin'
                  ? 'bg-slate-900 dark:bg-sky-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Lock className="w-3.5 h-3.5" />
              Owner Admin
            </button>
          </div>

          {currentUser?.role === 'admin' && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-teal-800 dark:text-teal-400">
              <ShieldCheck className="w-4 h-4" />
              Owner Admin Active
            </span>
          )}
        </div>

        {error && (
          <div className="px-3.5 py-2 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 text-rose-900 dark:text-rose-200 text-xs rounded-lg">
            {error}
          </div>
        )}

        {mode === 'switch' && (
          <div className="border border-slate-200 dark:border-slate-700 rounded-lg">
            {publicSwitchableUsers.length === 0 ? (
              <div className="p-8 text-center space-y-3">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  No Live Accounts Registered Yet
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                  All demo accounts have been removed. Register the first live Teacher, Student, or Parent account to get started.
                </p>
                <button
                  type="button"
                  onClick={() => setMode('signup')}
                  className="px-4 py-2 text-xs font-medium bg-slate-900 dark:bg-sky-600 text-white rounded-lg hover:bg-slate-800"
                >
                  Create First Account
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {publicSwitchableUsers.map((u) => {
                  const active = currentUser?.username === u.username;
                  return (
                    <div key={u.id} className="p-3.5 flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {u.realName}{' '}
                          <span className="font-normal text-xs text-slate-500 dark:text-slate-400">
                            ({u.role})
                          </span>
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          @{u.username} · {u.schoolName} · {u.className} · {u.region}
                        </p>
                      </div>
                      <button
                        onClick={async () => {
                          setError(null);
                          try {
                            await onSelectUser(u.username);
                            onClose();
                          } catch (err: any) {
                            setError(err?.message || 'Unable to switch user.');
                          }
                        }}
                        disabled={active}
                        className={`px-3.5 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap shrink-0 ${
                          active
                            ? 'bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300 border border-teal-200 dark:border-teal-900'
                            : 'bg-slate-900 dark:bg-sky-600 text-white hover:bg-slate-800 dark:hover:bg-sky-700'
                        }`}
                      >
                        {active ? 'Active' : 'Sign In'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {mode === 'signup' && (
          <form onSubmit={handleSignupSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Real Name
                </label>
                <input
                  type="text"
                  required
                  value={realName}
                  onChange={(e) => setRealName(e.target.value)}
                  placeholder="Full legal name"
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Username
                </label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. baraka_p"
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Account Role
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as 'student' | 'teacher' | 'parent')}
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                >
                  <option value="student">Student</option>
                  <option value="teacher">Teacher</option>
                  <option value="parent">Parent</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Class
                </label>
                <input
                  type="text"
                  required
                  value={className}
                  onChange={(e) => setClassName(e.target.value)}
                  placeholder="e.g. Form VI PCM - Alpha"
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Class Code
                </label>
                <input
                  type="text"
                  required
                  value={classCode}
                  onChange={(e) => setClassCode(e.target.value)}
                  placeholder="e.g. PCM-2026"
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg font-mono uppercase"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Phone Number (WhatsApp)
                </label>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+2556..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  School Name
                </label>
                <input
                  type="text"
                  required
                  value={schoolName}
                  onChange={(e) => setSchoolName(e.target.value)}
                  placeholder="e.g. Ilboru Secondary School"
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@school.ac.tz"
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Location (Region)
                </label>
                <input
                  type="text"
                  required
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  placeholder="e.g. Arusha, Morogoro, Dar es Salaam"
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Profile Photo
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  className="w-full text-xs text-slate-600 dark:text-slate-300 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-slate-100 dark:file:bg-slate-800 file:text-slate-700 dark:file:text-slate-200"
                />
              </div>
            </div>

            {role === 'parent' && (
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Connected Child Username
                </label>
                <input
                  type="text"
                  list="live-students-list"
                  value={connectedChildUsername}
                  onChange={(e) => setConnectedChildUsername(e.target.value)}
                  placeholder="Enter your child's exact username..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg"
                />
                {studentAccounts.length > 0 && (
                  <datalist id="live-students-list">
                    {studentAccounts.map((st) => (
                      <option key={st.username} value={st.username}>
                        {st.realName} ({st.schoolName})
                      </option>
                    ))}
                  </datalist>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full px-4 py-2.5 text-xs font-medium bg-slate-900 dark:bg-sky-600 text-white rounded-lg hover:bg-slate-800 dark:hover:bg-sky-700 disabled:opacity-50"
            >
              {loading ? 'Creating Account...' : 'Complete Registration & Sign In'}
            </button>
          </form>
        )}

        {mode === 'admin' && (
          <div className="space-y-4">
            <div className="p-4 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg space-y-1">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                <MailCheck className="w-4 h-4 text-sky-700 dark:text-sky-400" />
                <span>Email-Verified Platform Owner Admin Access</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Admin privileges are verified strictly through the authorized owner email address. Request a 6-digit email verification code to sign in.
              </p>
            </div>

            {!adminCodeSent ? (
              <form onSubmit={handleRequestCode} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Authorized Owner Email Address
                  </label>
                  <input
                    type="email"
                    required
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    placeholder="Enter owner email address..."
                    autoComplete="email"
                    className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg"
                  />
                </div>
                {hasAdminPasskey && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Owner Passkey (Required)
                    </label>
                    <input
                      type="password"
                      required
                      value={adminPasskey}
                      onChange={(e) => setAdminPasskey(e.target.value)}
                      placeholder="Enter your configured Owner Passkey"
                      autoComplete="current-password"
                      className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg"
                    />
                  </div>
                )}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full px-4 py-2.5 text-xs font-medium bg-slate-900 dark:bg-sky-600 text-white rounded-lg hover:bg-slate-800 dark:hover:bg-sky-700 disabled:opacity-50"
                >
                  {loading ? 'Sending Email Verification Code...' : 'Send 6-Digit Verification Code to Email'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyCodeSubmit} className="space-y-3">
                {adminDeliveryInfo && (
                  <div className="px-3.5 py-2.5 bg-sky-50 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-800 text-sky-950 dark:text-sky-100 text-xs rounded-lg">
                    {adminDeliveryInfo}
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    6-Digit Email Verification Code for {adminEmail}
                  </label>
                  <input
                    type="text"
                    required
                    value={adminOtpCode}
                    onChange={(e) => setAdminOtpCode(e.target.value)}
                    placeholder="Enter 6-digit code"
                    className="w-full px-3 py-2 text-sm font-mono tracking-widest border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-lg"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 px-4 py-2.5 text-xs font-medium bg-teal-700 text-white rounded-lg hover:bg-teal-800 disabled:opacity-50"
                  >
                    {loading ? 'Verifying Email Code...' : 'Verify Email & Sign In as Admin'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAdminCodeSent(false);
                      setAdminOtpCode('');
                      setAdminDeliveryInfo(null);
                    }}
                    className="px-3 py-2.5 text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-lg"
                  >
                    Change Email
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
