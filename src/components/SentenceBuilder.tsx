import React, { useState } from 'react';
import { Volume2, RotateCcw, Trash2, Space, Copy, Check, Sparkles } from 'lucide-react';
import { speechService } from '../services/speechService';

interface SentenceBuilderProps {
  sentence: string;
  onSentenceChange: (newSentence: string) => void;
  onAddSpace: () => void;
  onUndo: () => void;
  onClear: () => void;
  lastAddedSign?: string | null;
}

export const SentenceBuilder: React.FC<SentenceBuilderProps> = ({
  sentence,
  onSentenceChange,
  onAddSpace,
  onUndo,
  onClear,
  lastAddedSign,
}) => {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleSpeak = async () => {
    if (!sentence.trim() || isSpeaking) return;
    setIsSpeaking(true);
    await speechService.speak(sentence);
    setIsSpeaking(false);
  };

  const handleCopy = async () => {
    if (!sentence.trim()) return;
    await navigator.clipboard.writeText(sentence);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl flex flex-col justify-between gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
          <h3 className="text-sm font-bold tracking-tight text-white uppercase font-['Plus_Jakarta_Sans']">
            Sentence Builder
          </h3>
          {lastAddedSign && (
            <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full flex items-center gap-1 animate-fade-in">
              <Sparkles className="w-3 h-3" /> +{lastAddedSign}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            disabled={!sentence.trim()}
            title="Copy sentence"
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:pointer-events-none transition-all"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </div>

      {/* Main Sentence Text Area Display */}
      <div className="relative min-h-[90px] p-3.5 rounded-xl bg-slate-950 border border-slate-800/90 flex flex-col justify-between">
        <textarea
          value={sentence}
          onChange={(e) => onSentenceChange(e.target.value)}
          placeholder="Signs from camera will appear here. You can also type or use quick phrase tiles..."
          rows={3}
          className="w-full bg-transparent text-lg sm:text-xl font-semibold text-slate-100 placeholder:text-slate-600 focus:outline-none resize-none leading-relaxed tracking-wide font-['Plus_Jakarta_Sans']"
        />

        <div className="flex items-center justify-between pt-2 border-t border-slate-900 text-[11px] text-slate-500">
          <span>{sentence.trim() ? `${sentence.trim().split(/\s+/).length} words` : 'Empty sentence'}</span>
          <span>{sentence.length} characters</span>
        </div>
      </div>

      {/* Action Buttons: Add Space, Undo, Clear, Speak */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
        {/* Add Space */}
        <button
          onClick={onAddSpace}
          className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700/80 text-slate-200 font-semibold text-xs sm:text-sm border border-slate-700 transition-all active:scale-95"
        >
          <Space className="w-4 h-4 text-amber-400" />
          <span>Add Space</span>
        </button>

        {/* Undo */}
        <button
          onClick={onUndo}
          disabled={!sentence.length}
          className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700/80 text-slate-200 font-semibold text-xs sm:text-sm border border-slate-700 disabled:opacity-40 disabled:pointer-events-none transition-all active:scale-95"
        >
          <RotateCcw className="w-4 h-4 text-cyan-400" />
          <span>Undo</span>
        </button>

        {/* Clear */}
        <button
          onClick={onClear}
          disabled={!sentence.length}
          className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-slate-800/80 hover:bg-rose-950/40 text-slate-300 hover:text-rose-300 font-semibold text-xs sm:text-sm border border-slate-700/70 hover:border-rose-500/40 disabled:opacity-40 disabled:pointer-events-none transition-all active:scale-95"
        >
          <Trash2 className="w-4 h-4 text-rose-400" />
          <span>Clear</span>
        </button>

        {/* Speak (TTS) */}
        <button
          onClick={handleSpeak}
          disabled={!sentence.trim() || isSpeaking}
          className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all shadow-md active:scale-95 ${
            isSpeaking
              ? 'bg-amber-400 text-slate-950 shadow-amber-400/40 animate-pulse'
              : 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 shadow-orange-500/20'
          } disabled:opacity-40 disabled:pointer-events-none`}
        >
          <Volume2 className={`w-4 h-4 ${isSpeaking ? 'animate-bounce' : ''}`} />
          <span>{isSpeaking ? 'Speaking...' : 'Speak aloud'}</span>
        </button>
      </div>
    </div>
  );
};
