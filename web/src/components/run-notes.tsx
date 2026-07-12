'use client';

import { useState, useEffect, useCallback } from 'react';
import { fetchRunNotes, createRunNote, deleteRunNote, type RunNote } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { MessageSquare, Send, Trash2, Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useI18n, useLocaleString } from '@/lib/i18n';

export function RunNotes({ runId }: { runId: string }) {
  const { t } = useI18n();
  const localeStr = useLocaleString();

  const [notes, setNotes] = useState<RunNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchRunNotes(runId);
      setNotes(data);
      if (data.length > 0) setOpen(true);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [runId]);

  useEffect(() => { load(); }, [load]);

  const handleSubmit = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await createRunNote(runId, text.trim());
      setText('');
      await load();
      setOpen(true);
    } catch (err) {
      console.error('Failed to create note:', err);
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async (noteId: string) => {
    try {
      await deleteRunNote(runId, noteId);
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
    } catch (err) {
      console.error('Failed to delete note:', err);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleSubmit();
    }
  };

  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-5 py-3 hover:bg-slate-50/50 text-left"
      >
        <MessageSquare className="h-4 w-4 text-slate-400" />
        <span className="text-xs font-semibold text-slate-700">Notes</span>
        {notes.length > 0 && (
          <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[9px] font-bold text-blue-700">{notes.length}</span>
        )}
        <span className="flex-1" />
        {open ? <ChevronDown className="h-3.5 w-3.5 text-slate-400" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-400" />}
      </button>

      {open && (
        <div className="border-t border-slate-100">
          {/* Notes list */}
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
            </div>
          ) : notes.length > 0 ? (
            <div className="divide-y divide-slate-50">
              {notes.map((note) => (
                <div key={note.id} className="group px-5 py-3 hover:bg-slate-50/30">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-700">{note.author}</span>
                      <span className="text-[10px] text-slate-400">{formatDate(note.created_at, localeStr)}</span>
                    </div>
                    <button
                      onClick={() => handleDelete(note.id)}
                      className="opacity-0 group-hover:opacity-100 rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                  <p className="text-xs text-slate-600 whitespace-pre-wrap">{note.text}</p>
                </div>
              ))}
            </div>
          ) : null}

          {/* Input */}
          <div className="px-5 py-3 bg-slate-50/30 border-t border-slate-100">
            <div className="flex items-end gap-2">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Add a note... (Cmd+Enter to send)"
                rows={2}
                className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 resize-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
              />
              <button
                onClick={handleSubmit}
                disabled={!text.trim() || sending}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              >
                {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
