import fs from 'fs';
import path from 'path';
import type { StoreState } from '../src/types';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'elimu-fasta-db.json');

const OWNER_ADMIN_EMAIL = (process.env.ADMIN_OWNER_EMAIL || 'davidmizengo8@gmail.com').trim().toLowerCase();
const SEVERE_ISSUE_PHONE = '+255675211215';
const WHATSAPP_CHANNEL_URL = 'https://whatsapp.com/channel/0029VbE9AMwElagqT9aGwm1j';

const INITIAL_LIVE_STORE: StoreState = {
  config: {
    appName: 'ELIMU FASTA',
    whatsappChannelUrl: WHATSAPP_CHANNEL_URL,
    supportTeacherPhone: SEVERE_ISSUE_PHONE,
    featuredBannerTitle: 'ACSEE Physics (131) & Advanced Mathematics (142)',
    featuredBannerSubtitle:
      'Live workspace for ACSEE candidates, teachers, and parents — Physics Emulation Lab, downloadable exams, exclusive class libraries, and AI mistake diagnostics.',
    monthlyCertificateMonth: new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' }),
    imageAds: [],
  },
  users: [
    {
      id: 'u-admin-owner',
      realName: 'Platform Owner (Admin)',
      username: 'admin_elimu',
      role: 'admin',
      className: 'Platform Administration',
      classCode: 'ADMIN-HQ',
      phone: SEVERE_ISSUE_PHONE,
      schoolName: 'Elimu Fasta Platform',
      email: OWNER_ADMIN_EMAIL,
      profilePhoto: '',
      region: 'Tanzania',
      friends: [],
      likedExamIds: [],
      savedExamIds: [],
      sharedCount: 0,
      purchasedSerials: [],
      unlockedGifts: [],
    },
  ],
  classes: [],
  exams: [],
  attempts: [],
  resources: [],
  messages: [],
  communities: [],
  notifications: [],
  emailDispatches: [],
  errorReports: [],
};

export function loadStore(): StoreState {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(INITIAL_LIVE_STORE, null, 2), 'utf-8');
    return structuredClone(INITIAL_LIVE_STORE);
  }
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as StoreState;
    let mutated = false;

    if (!parsed.config) {
      parsed.config = structuredClone(INITIAL_LIVE_STORE.config);
      mutated = true;
    }
    if (
      !parsed.config.whatsappChannelUrl ||
      parsed.config.whatsappChannelUrl === 'https://whatsapp.com/channel/0029VaElimuFastaACSEE'
    ) {
      parsed.config.whatsappChannelUrl = WHATSAPP_CHANNEL_URL;
      mutated = true;
    }
    if (!parsed.config.supportTeacherPhone || parsed.config.supportTeacherPhone === '+255712345678') {
      parsed.config.supportTeacherPhone = SEVERE_ISSUE_PHONE;
      mutated = true;
    }
    if (!Array.isArray(parsed.config.imageAds)) {
      parsed.config.imageAds = [];
      mutated = true;
    }

    parsed.users = Array.isArray(parsed.users) ? parsed.users : [];
    parsed.classes = Array.isArray(parsed.classes) ? parsed.classes : [];
    parsed.exams = Array.isArray(parsed.exams) ? parsed.exams : [];
    parsed.attempts = Array.isArray(parsed.attempts) ? parsed.attempts : [];
    parsed.resources = Array.isArray(parsed.resources) ? parsed.resources : [];
    parsed.messages = Array.isArray(parsed.messages) ? parsed.messages : [];
    parsed.communities = Array.isArray(parsed.communities) ? parsed.communities : [];
    parsed.notifications = Array.isArray(parsed.notifications) ? parsed.notifications : [];
    parsed.emailDispatches = Array.isArray(parsed.emailDispatches) ? parsed.emailDispatches : [];
    parsed.errorReports = Array.isArray(parsed.errorReports) ? parsed.errorReports : [];

    // Ensure the single platform owner Admin profile exists and no other user has admin role
    let ownerAdminFound = false;
    for (const u of parsed.users) {
      if (u.username === 'admin_elimu') {
        ownerAdminFound = true;
        if (u.email.toLowerCase() !== OWNER_ADMIN_EMAIL || u.role !== 'admin') {
          u.email = OWNER_ADMIN_EMAIL;
          u.role = 'admin';
          u.realName = 'Platform Owner (Admin)';
          mutated = true;
        }
        if (u.phone === '+255755000111' || !u.phone) {
          u.phone = SEVERE_ISSUE_PHONE;
          mutated = true;
        }
      } else if (u.role === 'admin') {
        u.role = 'teacher';
        mutated = true;
      }
    }
    if (!ownerAdminFound) {
      parsed.users.unshift(structuredClone(INITIAL_LIVE_STORE.users[0]));
      mutated = true;
    }

    if (mutated) {
      fs.writeFileSync(DB_FILE, JSON.stringify(parsed, null, 2), 'utf-8');
    }
    return parsed;
  } catch {
    fs.writeFileSync(DB_FILE, JSON.stringify(INITIAL_LIVE_STORE, null, 2), 'utf-8');
    return structuredClone(INITIAL_LIVE_STORE);
  }
}

export function saveStore(state: StoreState): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(DB_FILE, JSON.stringify(state, null, 2), 'utf-8');
}
