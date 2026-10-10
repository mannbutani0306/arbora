import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  listAnalyses,
  deleteAnalysis,
  renameAnalysis,
  setPublic,
} from '../lib/dataService';
import { AnalysisRecord } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { useToast } from '../lib/toast';
import { Search, ExternalLink, Trash2, Edit2, Share2, Plus, Code, Check } from 'lucide-react';

export function History() {
  const [analyses, setAnalyses] = useState<AnalysisRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const fetchItems = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listAnalyses(user?.id);
      setAnalyses(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to load history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, [user]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return analyses;
    return analyses.filter(
      (a) =>
        a.title.toLowerCase().includes(q) ||
        a.source_code.toLowerCase().includes(q)
    );
  }, [analyses, search]);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteAnalysis(id);
      setAnalyses((prev) => prev.filter((a) => a.id !== id));
      toast.success('Analysis deleted');
    } catch {
      toast.error('Delete failed');
    }
  };

  const startRename = (analysis: AnalysisRecord, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(analysis.id);
    setEditTitle(analysis.title);
  };

  const handleSaveRename = async (id: string, e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!editTitle.trim()) return;

    try {
      await renameAnalysis(id, editTitle.trim());
      setAnalyses((prev) =>
        prev.map((a) => (a.id === id ? { ...a, title: editTitle.trim() } : a))
      );
      setEditingId(null);
      toast.success('Renamed successfully');
    } catch {
      toast.error('Rename failed');
    }
  };

  const handleShare = async (analysis: AnalysisRecord, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      let slug = analysis.share_slug;
      if (!analysis.is_public || !slug) {
        const res = await setPublic(analysis.id, true);
        slug = res.share_slug;
        setAnalyses((prev) =>
          prev.map((a) =>
            a.id === analysis.id ? { ...a, is_public: true, share_slug: slug } : a
          )
        );
      }

      if (slug) {
        const shareUrl = `${window.location.origin}/share/${slug}`;
        await navigator.clipboard.writeText(shareUrl);
        setCopiedSlug(slug);
        toast.success('Share link copied');
        setTimeout(() => setCopiedSlug(null), 2000);
      }
    } catch {
      toast.error('Share failed');
    }
  };

  const handleOpen = (item: AnalysisRecord) => {
    // Store in session storage to be loaded into playground
    sessionStorage.setItem('arbora_load_code', item.source_code);
    sessionStorage.setItem('arbora_load_title', item.title);
    if (item.id) sessionStorage.setItem('arbora_load_id', item.id);
    if (item.neural_ast) {
      sessionStorage.setItem('arbora_load_neural_ast', JSON.stringify(item.neural_ast));
    }
    if (item.comparison) {
      sessionStorage.setItem('arbora_load_comparison', JSON.stringify(item.comparison));
    }
    navigate('/playground');
  };

  // One-line loading state
  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <p className="text-xs text-[#78716C] mb-3">Loading history...</p>
        <button
          onClick={fetchItems}
          className="px-3 py-1.5 rounded-xl text-xs font-medium text-white bg-[#059669] hover:bg-[#047857] transition-colors"
        >
          Refresh
        </button>
      </div>
    );
  }

  // One-line error state
  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <p className="text-xs text-red-600 mb-3">{error}</p>
        <button
          onClick={fetchItems}
          className="px-3 py-1.5 rounded-xl text-xs font-medium text-white bg-[#059669] hover:bg-[#047857] transition-colors"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto w-full px-6 py-6 flex-1 flex flex-col">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[#1C1917]">Analysis history</h1>
          <p className="text-xs text-[#78716C]">Your parsed trees and diagnostics.</p>
        </div>

        <div className="flex items-center gap-2">
          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#78716C] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search history..."
              className="pl-8 pr-3 py-1.5 text-xs bg-white border border-[#E7E5E4] rounded-xl text-[#1C1917] placeholder:text-[#78716C]/60 focus:outline-none focus:border-emerald-600 w-48 sm:w-64"
            />
          </div>

          <Link
            to="/playground"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-white bg-[#059669] hover:bg-[#047857] transition-colors shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            New
          </Link>
        </div>
      </div>

      {/* Empty State */}
      {filtered.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-white border border-[#E7E5E4] rounded-xl">
          <Code className="w-8 h-8 text-[#78716C]/40 mb-2" />
          <p className="text-xs text-[#78716C] mb-3">
            {search ? 'No matching analyses found.' : 'No saved syntax trees yet.'}
          </p>
          <Link
            to="/playground"
            className="px-3 py-1.5 rounded-xl text-xs font-medium text-white bg-[#059669] hover:bg-[#047857] transition-colors"
          >
            Parse code
          </Link>
        </div>
      ) : (
        /* Card Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((item) => {
            const dateStr = new Date(item.created_at).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
            });
            const nodeCount = item.metrics?.nodeCount || (item.ast ? 1 : 0);
            const isEditing = editingId === item.id;

            return (
              <div
                key={item.id}
                onClick={() => handleOpen(item)}
                className="group relative bg-white border border-[#E7E5E4] rounded-xl p-4 hover:border-stone-400 hover:shadow-xs transition-all cursor-pointer flex flex-col justify-between"
              >
                <div>
                  {/* Card Title & Date */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    {isEditing ? (
                      <form
                        onSubmit={(e) => handleSaveRename(item.id, e)}
                        className="flex-1 flex items-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          autoFocus
                          className="w-full text-xs font-semibold px-1.5 py-0.5 border border-emerald-500 rounded bg-white"
                        />
                        <button
                          type="submit"
                          className="px-1.5 py-0.5 text-[10px] bg-emerald-600 text-white rounded font-medium"
                        >
                          Save
                        </button>
                      </form>
                    ) : (
                      <h2 className="text-sm font-semibold text-[#1C1917] truncate group-hover:text-emerald-700 transition-colors">
                        {item.title}
                      </h2>
                    )}
                    <span className="text-[10px] text-[#78716C] shrink-0">{dateStr}</span>
                  </div>

                  {/* Tiny AST Thumbnail / Code Preview */}
                  <div className="h-16 bg-[#FAFAF9] border border-[#E7E5E4] rounded-lg p-2 font-mono text-[10px] text-[#78716C] overflow-hidden mb-3 relative">
                    <div className="flex items-center gap-1.5 mb-1 text-[9px] text-[#1C1917] font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <span>{item.ast?.type || 'AST Root'}</span>
                      <span className="text-[#78716C]">({nodeCount} nodes)</span>
                    </div>
                    <pre className="opacity-70 truncate">{item.source_code.slice(0, 100)}</pre>
                  </div>
                </div>

                {/* Card Actions */}
                <div
                  className="flex items-center justify-between border-t border-[#E7E5E4] pt-2 mt-1 text-xs text-[#78716C]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      title="Open in Playground"
                      onClick={() => handleOpen(item)}
                      className="p-1 hover:text-[#1C1917] hover:bg-stone-100 rounded transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      title="Rename"
                      onClick={(e) => startRename(item, e)}
                      className="p-1 hover:text-[#1C1917] hover:bg-stone-100 rounded transition-colors"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      title="Copy share link"
                      onClick={(e) => handleShare(item, e)}
                      className="p-1 hover:text-[#1C1917] hover:bg-stone-100 rounded transition-colors"
                    >
                      {copiedSlug === item.share_slug && item.share_slug ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Share2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>

                  <button
                    type="button"
                    title="Delete analysis"
                    onClick={(e) => handleDelete(item.id, e)}
                    className="p-1 hover:text-red-600 hover:bg-stone-100 rounded transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
