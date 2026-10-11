import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getPublicBySlug } from '../lib/dataService';
import { AnalysisRecord } from '../lib/supabase';
import { useToast } from '../lib/toast';
import { Copy, Check, ExternalLink } from 'lucide-react';
import { toPlaygroundLoadState } from '../components/playground/useAnalysisPersistence';

export function Share() {
  const { slug } = useParams<{ slug: string }>();
  const [analysis, setAnalysis] = useState<AnalysisRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const toast = useToast();

  const fetchAnalysis = async () => {
    if (!slug) {
      setError('Invalid share link.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await getPublicBySlug(slug);
      if (!data) {
        setError('Analysis not found or private.');
      } else {
        setAnalysis(data);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load analysis.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalysis();
  }, [slug]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    toast.success('Link copied');
    setTimeout(() => setCopied(false), 2000);
  };

  // One-line loading state
  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <p className="text-xs text-[#78716C] mb-3">Loading shared analysis...</p>
        <button
          onClick={fetchAnalysis}
          className="px-3 py-1.5 rounded-xl text-xs font-medium text-white bg-[#059669] hover:bg-[#047857] transition-colors"
        >
          Refresh
        </button>
      </div>
    );
  }

  // One-line error state
  if (error || !analysis) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <p className="text-xs text-[#78716C] mb-3">{error || 'Analysis not found.'}</p>
        <Link
          to="/playground"
          className="px-3 py-1.5 rounded-xl text-xs font-medium text-white bg-[#059669] hover:bg-[#047857] transition-colors"
        >
          Open Playground
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto w-full px-6 py-6 flex-1 flex flex-col">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-[#E7E5E4]">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
              Read-Only Snapshot
            </span>
            <span className="text-xs text-[#78716C]">
              {new Date(analysis.created_at).toLocaleDateString()}
            </span>
          </div>
          <h1 className="text-xl font-semibold text-[#1C1917]">{analysis.title}</h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopyLink}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-[#1C1917] bg-white border border-[#E7E5E4] hover:bg-stone-50 transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            Copy link
          </button>
          <Link
            to="/playground"
            state={toPlaygroundLoadState(analysis)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-white bg-[#059669] hover:bg-[#047857] transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Fork in Playground
          </Link>
        </div>
      </div>

      {/* Grid: Source Code + AST View */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1">
        {/* Source Code */}
        <div className="bg-white border border-[#E7E5E4] rounded-xl p-4 flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-semibold text-[#1C1917] uppercase tracking-wider">
              Source Code
            </h2>
            <span className="text-[10px] text-[#78716C] uppercase">{analysis.language}</span>
          </div>
          <pre className="flex-1 font-mono text-xs bg-[#FAFAF9] p-3 rounded-lg border border-[#E7E5E4] overflow-auto text-[#1C1917] whitespace-pre">
            {analysis.source_code}
          </pre>
        </div>

        {/* Abstract Syntax Tree */}
        <div className="bg-white border border-[#E7E5E4] rounded-xl p-4 flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-semibold text-[#1C1917] uppercase tracking-wider">
              AST JSON Structure
            </h2>
            <span className="text-[10px] text-[#78716C]">
              {analysis.metrics?.nodeCount ? `${analysis.metrics.nodeCount} nodes` : 'Exported tree'}
            </span>
          </div>
          <pre className="flex-1 font-mono text-xs bg-[#FAFAF9] p-3 rounded-lg border border-[#E7E5E4] overflow-auto text-[#1C1917] max-h-[600px]">
            {JSON.stringify(analysis.ast, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}
