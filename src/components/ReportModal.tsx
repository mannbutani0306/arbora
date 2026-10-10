import React from 'react';
import { X, Printer, Download, FileText, CheckCircle2 } from 'lucide-react';
import {
  AnalysisReportData,
  openPrintReport,
  downloadHTMLReport,
} from '../lib/reportGenerator';
import { useToast } from '../lib/toast';

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: AnalysisReportData;
}

export function ReportModal({ isOpen, onClose, data }: ReportModalProps) {
  const toast = useToast();

  if (!isOpen) return null;

  const handlePrint = () => {
    openPrintReport(data);
    toast.success('Print window opened');
  };

  const handleDownload = () => {
    downloadHTMLReport(`arbora_report_${Date.now()}.html`, data);
    toast.success('HTML report downloaded');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px] flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div
        className="w-full max-w-md bg-white rounded-xl border border-[#E7E5E4] shadow-xl p-5 text-[#1C1917] space-y-4 animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#E7E5E4] pb-3">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#059669]" />
            <h3 className="text-xs font-semibold text-[#1C1917]">Export analysis report</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[#78716C] hover:text-[#1C1917] p-1 rounded transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Content Details */}
        <div className="space-y-2 text-xs text-[#78716C]">
          <p>The report includes:</p>
          <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-[#1C1917] bg-stone-50 p-3 rounded-lg border border-[#E7E5E4]">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#059669]" />
              <span>Token summary</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#059669]" />
              <span>AST structure</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#059669]" />
              <span>Syntax diagnostics</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#059669]" />
              <span>AI repair diff</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#059669]" />
              <span>Comparison metrics</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#059669]" />
              <span>Semantic explanations</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E7E5E4]">
          <button
            type="button"
            onClick={handleDownload}
            className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-[#1C1917] rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download HTML</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="px-3.5 py-1.5 bg-[#059669] hover:bg-[#047857] text-white rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 shadow-2xs"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print / PDF</span>
          </button>
        </div>
      </div>
    </div>
  );
}
