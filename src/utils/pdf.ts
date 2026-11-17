import { jsPDF } from 'jspdf';
import type { ExamAttempt, ExamItem, UserProfile } from '../types';

export function downloadWatermarkedExamPdf(exam: ExamItem, appName = 'ELIMU FASTA') {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  const drawWatermark = () => {
    doc.saveGraphicsState();
    doc.setTextColor(210, 222, 234);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(28);
    doc.text(`${appName.toUpperCase()} OFFICIAL WATERMARK`, pageWidth / 2, 42, { align: 'center' });
    doc.setFontSize(10);
    doc.setTextColor(120, 134, 150);
    doc.text(
      `${appName} Verified Paper · ${exam.subject} (${exam.paperCode}) · Physics & Mathematics Only`,
      pageWidth / 2,
      58,
      { align: 'center' }
    );
    doc.restoreGraphicsState();
  };

  drawWatermark();

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(exam.title, 44, 96);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Subject: ${exam.subject}  |  Paper: ${exam.paperCode}  |  Time Allowed: ${exam.durationMinutes} Minutes (3 Hours)  |  Creator: ${exam.creatorName}`,
    44,
    114
  );
  doc.line(44, 124, pageWidth - 44, 124);

  let y = 148;
  exam.questions.forEach((q, idx) => {
    if (y > 720) {
      doc.addPage();
      drawWatermark();
      y = 92;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    const qType = q.questionType || 'mcq';
    const qTypeLabel =
      qType === 'proof'
        ? 'Proof'
        : qType === 'explanation'
          ? 'Explanation'
          : qType === 'short_answer'
            ? 'Structured Solution'
            : 'MCQ';
    const questionLines = doc.splitTextToSize(
      `${idx + 1}. [${q.topic} · ${qTypeLabel} · ${q.marks} Marks] ${q.prompt}`,
      pageWidth - 88
    );
    doc.text(questionLines, 44, y);
    y += questionLines.length * 14 + 6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(51, 65, 85);
    if (qType === 'mcq' && q.options.length > 0) {
      q.options.forEach((opt, oIdx) => {
        const letter = String.fromCharCode(65 + oIdx);
        const optLines = doc.splitTextToSize(`   (${letter}) ${opt}`, pageWidth - 104);
        doc.text(optLines, 52, y);
        y += optLines.length * 13 + 3;
      });
    } else {
      doc.setTextColor(100, 116, 139);
      doc.text('   Show full working, derivation, explanation or proof below:', 52, y);
      y += 16;
      doc.setDrawColor(203, 213, 225);
      for (let line = 0; line < (qType === 'short_answer' ? 3 : 5); line++) {
        doc.line(54, y, pageWidth - 48, y);
        y += 16;
      }
    }
    y += 10;
  });

  doc.save(`${exam.paperCode.replace(/\s+/g, '_')}_${exam.subject}_Watermark.pdf`);
}

export function downloadTeacherResultsPdf(
  examTitle: string,
  attempts: ExamAttempt[],
  appName = 'ELIMU FASTA'
) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42);
  doc.text(`${appName.toUpperCase()} — OFFICIAL ACSEE RESULT SHEET`, 44, 52);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text(`Exam: ${examTitle}  |  Total Candidates: ${attempts.length}  |  Generated: ${new Date().toLocaleDateString()}`, 44, 72);
  doc.line(44, 84, pageWidth - 44, 84);

  let y = 108;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text('Candidate', 44, y);
  doc.text('Class / School', 190, y);
  doc.text('Score', 355, y);
  doc.text('Pct', 415, y);
  doc.text('ACSEE', 460, y);
  doc.text('Status', 505, y);
  y += 10;
  doc.line(44, y, pageWidth - 44, y);
  y += 16;

  doc.setFont('helvetica', 'normal');
  attempts.forEach((att) => {
    if (y > 760) {
      doc.addPage();
      y = 56;
    }
    doc.text(att.studentName.slice(0, 24), 44, y);
    doc.text(`${att.className} · ${att.schoolName}`.slice(0, 28), 190, y);
    doc.text(`${att.score}/${att.totalMarks}`, 355, y);
    doc.text(`${att.percentage}%`, 415, y);
    doc.text(`${att.acseeGrade} (${att.acseePoints})`, 460, y);
    doc.text(att.status === 'released' ? 'Released' : 'Pending', 505, y);
    y += 18;
  });

  doc.save(`${appName.replace(/\s+/g, '_')}_Results_Report.pdf`);
}

export function downloadMonthlyCertificatePdf(
  user: UserProfile,
  averageScore: number,
  monthLabel: string,
  appName = 'ELIMU FASTA'
) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();

  doc.setDrawColor(15, 118, 110);
  doc.setLineWidth(4);
  doc.rect(28, 28, w - 56, h - 56);
  doc.setLineWidth(1);
  doc.rect(38, 38, w - 76, h - 76);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(15, 118, 110);
  doc.text(`${appName.toUpperCase()} · ACSEE PHYSICS & MATHEMATICS`, w / 2, 92, { align: 'center' });

  doc.setFontSize(30);
  doc.setTextColor(15, 23, 42);
  doc.text('CERTIFICATE OF MONTHLY EXCELLENCE', w / 2, 146, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(13);
  doc.setTextColor(71, 85, 105);
  doc.text('This certificate is automatically awarded for achieving the highest monthly average in', w / 2, 194, { align: 'center' });
  doc.text('Advanced Certificate of Secondary Education (ACSEE) Physics & Mathematics assessments.', w / 2, 214, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(28);
  doc.setTextColor(2, 132, 199);
  doc.text(user.realName, w / 2, 276, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text(`${user.schoolName} · ${user.className} · ${user.region}`, w / 2, 308, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(`Monthly Average: ${averageScore}%  |  Period: ${monthLabel}`, w / 2, 362, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text(`Dispatched automatically via Email to ${user.email}`, w / 2, 430, { align: 'center' });

  doc.save(`${user.username}_Monthly_Excellence_Certificate.pdf`);
}

export function downloadBookOffline(title: string, author: string, topic: string, subject: string, description: string, appName = 'ELIMU FASTA') {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const w = doc.internal.pageSize.getWidth();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 118, 110);
  doc.text(`${appName.toUpperCase()} DIGITAL LIBRARY EDITION`, 44, 52);

  doc.setFontSize(22);
  doc.setTextColor(15, 23, 42);
  doc.text(title, 44, 90);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(71, 85, 105);
  doc.text(`Author: ${author}  |  Subject: ${subject}  |  Topic: ${topic}`, 44, 114);
  doc.line(44, 126, w - 44, 126);

  doc.setFontSize(12);
  doc.setTextColor(30, 41, 59);
  const body = doc.splitTextToSize(
    `${description}\n\nKey ACSEE Revision Notes:\n• Review core derivations from first principles.\n• Verify SI units and dimensional consistency on every numerical step.\n• Practice past ACSEE Paper 1 and Paper 2 structured problems under 3-hour exam conditions.\n• Use the in-app Physics Emulation Lab and Scientific Calculator to validate experimental constants.`,
    w - 88
  );
  doc.text(body, 44, 154);

  doc.save(`${title.replace(/\s+/g, '_')}.pdf`);
}
