import type { Subject } from '../types';

export interface AcseeResult {
  grade: 'A' | 'B' | 'C' | 'D' | 'E' | 'S' | 'F';
  points: number;
  remark: string;
}

export const ACSEE_SYLLABUS: Record<
  Subject,
  {
    code: string;
    papers: Array<{ code: string; name: string; duration: string; format: string }>;
    topics: string[];
  }
> = {
  Physics: {
    code: '131',
    papers: [
      {
        code: '131/1',
        name: 'Physics Paper 1 (Theory)',
        duration: '3 Hours',
        format: 'Section A (70 marks, 7 compulsory questions) & Section B (30 marks, choose 2 of 3 questions)',
      },
      {
        code: '131/2',
        name: 'Physics Paper 2 (Theory)',
        duration: '3 Hours',
        format: '6 questions across Fluid Dynamics, Thermodynamics, Optics, Electromagnetism & Modern Physics (choose 5)',
      },
      {
        code: '131/3A',
        name: 'Physics Paper 3 (Actual Practical)',
        duration: '3 Hours 15 Min',
        format: '3 compulsory practicals: Mechanics/Oscillations (20m), Heat/Optics (15m), Electricity (15m)',
      },
    ],
    topics: [
      'Measurement & Error Analysis',
      'Projectile & Circular Motion',
      'Simple Harmonic Motion',
      'Rotational Dynamics & Gravitation',
      'Fluid Dynamics & Properties of Matter',
      'Heat & Thermodynamics',
      'Vibrations, Waves & Physical Optics',
      'Electrostatics',
      'Current Electricity (Metre Bridge & Potentiometer)',
      'Electromagnetism & Electromagnetic Induction',
      'Electronics & Semiconductors',
      'Atomic & Nuclear Physics',
    ],
  },
  Mathematics: {
    code: '142',
    papers: [
      {
        code: '142/1',
        name: 'Advanced Mathematics Paper 1',
        duration: '3 Hours',
        format: '10 compulsory short-answer/structured questions (100 marks total)',
      },
      {
        code: '142/2',
        name: 'Advanced Mathematics Paper 2',
        duration: '3 Hours',
        format: 'Section A (4 compulsory questions, 40m) & Section B (choose 4 of 6 questions, 60m)',
      },
    ],
    topics: [
      'Calculating Devices & Sets',
      'Hyperbolic Functions',
      'Linear Programming',
      'Statistics & Probability',
      'Trigonometry',
      'Algebra & Logic',
      'Coordinate Geometry I & II (Conics)',
      'Functions & Numerical Methods',
      'Differentiation',
      'Integration',
      'Vectors (2D & 3D)',
      'Complex Numbers',
      'Differential Equations',
    ],
  },
};

export function calculateAcseeGrade(percentage: number): AcseeResult {
  if (percentage >= 80) return { grade: 'A', points: 1, remark: 'Distinction' };
  if (percentage >= 70) return { grade: 'B', points: 2, remark: 'Very Good' };
  if (percentage >= 60) return { grade: 'C', points: 3, remark: 'Credit' };
  if (percentage >= 50) return { grade: 'D', points: 4, remark: 'Pass' };
  if (percentage >= 40) return { grade: 'E', points: 5, remark: 'Principal Pass' };
  if (percentage >= 35) return { grade: 'S', points: 6, remark: 'Subsidiary Pass' };
  return { grade: 'F', points: 7, remark: 'Fail' };
}

export function calculateProjectedDivision(physicsPts: number, mathPts: number): string {
  const avg = (physicsPts + mathPts) / 2;
  const estTotal = Math.round(avg * 3);
  if (estTotal <= 9) return `Division I (${estTotal} pts est.)`;
  if (estTotal <= 12) return `Division II (${estTotal} pts est.)`;
  if (estTotal <= 17) return `Division III (${estTotal} pts est.)`;
  if (estTotal <= 19) return `Division IV (${estTotal} pts est.)`;
  return `Division 0 (${estTotal} pts est.)`;
}

export function formatCountdown(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(clamped / 3600);
  const mins = Math.floor((clamped % 3600) / 60);
  const secs = clamped % 60;
  return [hrs, mins, secs].map((n) => String(n).padStart(2, '0')).join(':');
}
