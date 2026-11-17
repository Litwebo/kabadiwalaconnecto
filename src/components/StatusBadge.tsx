import { AlertTriangle, CheckCircle2, Clock, FileEdit, XCircle } from 'lucide-react';
import React from 'react';

const STYLES: Record<string, { bg: string; icon: React.ReactNode }> = {
  DRAFT: {
    bg: 'bg-slate-200/80 text-slate-800 dark:bg-slate-800 dark:text-slate-200',
    icon: <FileEdit className="w-3.5 h-3.5 shrink-0" />,
  },
  LISTED: {
    bg: 'bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300',
    icon: <Clock className="w-3.5 h-3.5 shrink-0" />,
  },
  BOOKED: {
    bg: 'bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300',
    icon: <Clock className="w-3.5 h-3.5 shrink-0" />,
  },
  REQUESTED: {
    bg: 'bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300',
    icon: <Clock className="w-3.5 h-3.5 shrink-0" />,
  },
  ACCEPTED: {
    bg: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300',
    icon: <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />,
  },
  HANDED_OVER: {
    bg: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300',
    icon: <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />,
  },
  PAID: {
    bg: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300',
    icon: <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />,
  },
  COMPLETED: {
    bg: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300',
    icon: <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />,
  },
  APPROVED: {
    bg: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300',
    icon: <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />,
  },
  PENDING: {
    bg: 'bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300',
    icon: <Clock className="w-3.5 h-3.5 shrink-0" />,
  },
  DISPUTED: {
    bg: 'bg-red-100 text-red-900 dark:bg-red-950/60 dark:text-red-300',
    icon: <AlertTriangle className="w-3.5 h-3.5 shrink-0" />,
  },
  REJECTED: {
    bg: 'bg-red-100 text-red-900 dark:bg-red-950/60 dark:text-red-300',
    icon: <XCircle className="w-3.5 h-3.5 shrink-0" />,
  },
  DECLINED: {
    bg: 'bg-red-100 text-red-900 dark:bg-red-950/60 dark:text-red-300',
    icon: <XCircle className="w-3.5 h-3.5 shrink-0" />,
  },
  EXPIRED: {
    bg: 'bg-red-100 text-red-900 dark:bg-red-950/60 dark:text-red-300',
    icon: <XCircle className="w-3.5 h-3.5 shrink-0" />,
  },
  CANCELLED: {
    bg: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    icon: <XCircle className="w-3.5 h-3.5 shrink-0" />,
  },
  OPEN: {
    bg: 'bg-red-100 text-red-900 dark:bg-red-950/60 dark:text-red-300',
    icon: <AlertTriangle className="w-3.5 h-3.5 shrink-0" />,
  },
  UNDER_REVIEW: {
    bg: 'bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300',
    icon: <Clock className="w-3.5 h-3.5 shrink-0" />,
  },
  RESOLVED: {
    bg: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300',
    icon: <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />,
  },
  DISMISSED: {
    bg: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    icon: <XCircle className="w-3.5 h-3.5 shrink-0" />,
  },
  ACTIVE: {
    bg: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300',
    icon: <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />,
  },
  SUSPENDED: {
    bg: 'bg-red-100 text-red-900 dark:bg-red-950/60 dark:text-red-300',
    icon: <XCircle className="w-3.5 h-3.5 shrink-0" />,
  },
};

export const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const style = STYLES[status] || STYLES.DRAFT;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold tracking-tight whitespace-nowrap shrink-0 ${style.bg}`}
    >
      {style.icon}
      <span>{status.replace(/_/g, ' ')}</span>
    </span>
  );
};
