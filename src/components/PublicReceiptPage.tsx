import { AlertTriangle, ArrowLeft, CheckCircle2, Download, ShieldCheck, XCircle } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api.ts';
import { EPR_DISCLAIMER, formatDateTimeIN, formatINR, formatKg } from '../shared/format.ts';
import type { ReceiptDTO } from '../shared/types.ts';
import { StageTransition, StampBadge3D, TiltCard3D } from './MotionPrimitives.tsx';

interface PublicReceiptPageProps {
  receiptId: string;
  onBack: () => void;
}

export const PublicReceiptPage: React.FC<PublicReceiptPageProps> = ({ receiptId, onBack }) => {
  const [receipt, setReceipt] = useState<ReceiptDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    apiFetch<{ receipt: ReceiptDTO }>(`/api/receipts/${encodeURIComponent(receiptId)}`)
      .then((res) => setReceipt(res.receipt))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Receipt not found.'))
      .finally(() => setLoading(false));
  }, [receiptId]);

  return (
    <div className="min-h-screen bg-[#f3f6f4] dark:bg-[#0d1512] py-6 px-4">
      <div className="max-w-2xl mx-auto space-y-5">
        <button
          type="button"
          onClick={onBack}
          className="min-h-[44px] inline-flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:text-[#b04a17]"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        {loading && (
          <div className="rounded-2xl border border-slate-200 dark:border-emerald-950/60 bg-white dark:bg-[#15201b] p-6 animate-pulse space-y-4">
            <div className="h-6 w-48 bg-slate-200 dark:bg-slate-800 rounded" />
            <div className="h-24 bg-slate-200 dark:bg-slate-800 rounded" />
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-red-300 bg-red-50 dark:bg-red-950/40 p-6 text-red-900 dark:text-red-200 flex items-start gap-3">
            <XCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <h2 className="font-bold">Receipt Verification Failed</h2>
              <p className="text-sm mt-1">{error}</p>
            </div>
          </div>
        )}

        {receipt && (
          <StageTransition>
            <TiltCard3D
              maxTiltDeg={5}
              sheenColor={receipt.verified ? 'emerald' : 'copper'}
              className="rounded-2xl border border-slate-300 dark:border-emerald-900/60 bg-white dark:bg-[#15201b] p-6 font-mono text-sm space-y-5 shadow-md"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-3.5">
                  <StampBadge3D
                    icon={<ShieldCheck className="w-5 h-5" />}
                    tone={receipt.verified ? 'emerald' : 'copper'}
                  />
                  <div>
                    <div className="text-xs uppercase tracking-wider text-[#b04a17] font-bold">
                      Kabadiwala Connect · Weighbridge Slip
                    </div>
                    <h1 className="text-xl font-bold mt-1">{receipt.id}</h1>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Issued {formatDateTimeIN(receipt.issuedAt)}
                    </div>
                  </div>
                </div>
                <div
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${
                    receipt.verified
                      ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/70 dark:text-emerald-300'
                      : 'bg-red-100 text-red-900'
                  }`}
                >
                  {receipt.verified ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                  <span>{receipt.verified ? 'HMAC Signature Verified' : 'Signature Mismatch'}</span>
                </div>
              </div>

            <div className="weighbridge-divider pt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 font-sans">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-slate-500">Collector (Phone Hidden)</div>
                <div className="font-semibold text-base">{receipt.payload.collectorName}</div>
                <div className="text-xs text-slate-600 dark:text-slate-300">{receipt.payload.collectorArea}</div>
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wider text-slate-500">Authorised Recycler</div>
                <div className="font-semibold text-base">{receipt.payload.recyclerBusinessName}</div>
                <div className="text-xs font-mono text-slate-600 dark:text-slate-300">
                  Reg: {receipt.payload.recyclerRegistrationNumber}
                </div>
              </div>
            </div>

            <div className="weighbridge-divider pt-4 overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm tabular-nums">
                <thead>
                  <tr className="text-slate-500 border-b border-slate-200 dark:border-emerald-950/60">
                    <th className="py-2 pr-2">Material</th>
                    <th className="py-2 text-right">Decl.</th>
                    <th className="py-2 text-right">Weighed</th>
                    <th className="py-2 text-right">Rate</th>
                    <th className="py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {receipt.payload.items.map((item) => (
                    <tr key={item.categoryId} className="border-b border-slate-100 dark:border-emerald-950/40">
                      <td className="py-2 pr-2 font-sans font-medium">{item.categoryName}</td>
                      <td className="py-2 text-right text-slate-500">{formatKg(item.declaredKg)}</td>
                      <td className="py-2 text-right font-semibold">{formatKg(item.weighedKg)}</td>
                      <td className="py-2 text-right">{formatINR(item.ratePerKg)}</td>
                      <td className="py-2 text-right font-semibold">{formatINR(item.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="weighbridge-divider pt-4 space-y-1.5 tabular-nums">
              <div className="flex justify-between text-xs text-slate-600 dark:text-slate-300">
                <span>Gross Value ({formatKg(receipt.payload.totalWeighedKg)})</span>
                <span>{formatINR(receipt.payload.grossAmount)}</span>
              </div>
              <div className="flex justify-between text-xs text-slate-600 dark:text-slate-300">
                <span>Transport ({receipt.payload.mode})</span>
                <span>- {formatINR(receipt.payload.transportCost)}</span>
              </div>
              <div className="flex justify-between text-base font-bold text-[#b04a17] pt-1">
                <span>NET PAYABLE</span>
                <span>{formatINR(receipt.payload.netAmount)}</span>
              </div>
            </div>

            <div className="weighbridge-divider pt-4 text-xs text-slate-500 dark:text-slate-400 space-y-1">
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="break-all">HMAC-SHA256: {receipt.signature}</span>
              </div>
              <div>
                Handover GPS: {receipt.payload.handoverLocation.lat.toFixed(5)},{' '}
                {receipt.payload.handoverLocation.lng.toFixed(5)} (±
                {Math.round(receipt.payload.handoverLocation.accuracyM)}m)
              </div>
            </div>

            <div className="rounded-xl border border-amber-300 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs font-sans text-amber-950 dark:text-amber-200 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
              <span>{EPR_DISCLAIMER}</span>
            </div>

            <a
              href={receipt.pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-3d-copper w-full min-h-[48px] rounded-xl bg-[#b04a17] hover:bg-[#943b10] text-white font-sans font-semibold text-sm inline-flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              <span>Download Weighbridge PDF Receipt</span>
            </a>
            </TiltCard3D>
          </StageTransition>
        )}
      </div>
    </div>
  );
};
