import React, { useState, useEffect } from 'react';
import { Mic, MicOff, Volume2, RotateCcw, AlertCircle, Copy, Check } from 'lucide-react';
import { speechService } from '../services/speechService';

export const ReverseCaptions: React.FC = () => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimText, setInterimText] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const isSupported = speechService.isSpeechRecognitionSupported();

  const handleToggleListening = () => {
    if (isListening) {
      speechService.stopListening();
    } else {
      setErrorMsg(null);
      speechService.startListening({
        onTranscript: (text, isFinal) => {
          if (isFinal) {
            setTranscript((prev) => (prev ? `${prev} ${text}` : text));
            setInterimText('');
          } else {
            setInterimText(text);
          }
        },
        onStateChange: (listening) => {
          setIsListening(listening);
        },
        onError: (err) => {
          setErrorMsg(err);
          setIsListening(false);
        },
      });
    }
  };

  const handleClear = () => {
    setTranscript('');
    setInterimText('');
    setErrorMsg(null);
  };

  const handleCopy = async () => {
    const full = `${transcript} ${interimText}`.trim();
    if (!full) return;
    await navigator.clipboard.writeText(full);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    return () => {
      speechService.stopListening();
    };
  }, []);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl flex flex-col justify-between gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${isListening ? 'bg-rose-500 animate-ping' : 'bg-cyan-400'}`} />
          <div>
            <h3 className="text-sm font-bold tracking-tight text-white uppercase flex items-center gap-2">
              <span>Reverse Mode (Speech to Text)</span>
              <span className="text-[10px] lowercase font-normal px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                hearing person speaks
              </span>
            </h3>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {transcript && (
            <button
              onClick={handleClear}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors text-xs"
              title="Clear captions"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            onClick={handleCopy}
            disabled={!transcript && !interimText}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 disabled:opacity-40 transition-all"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </div>

      {/* Large Captions Display Canvas */}
      <div className="relative min-h-[140px] p-5 rounded-xl bg-slate-950 border border-slate-800 flex flex-col justify-between shadow-inner">
        {transcript || interimText ? (
          <div className="space-y-1">
            <span className="text-xl sm:text-2xl md:text-3xl font-extrabold text-white leading-snug tracking-tight">
              {transcript}
            </span>
            {interimText && (
              <span className="text-xl sm:text-2xl md:text-3xl font-bold text-amber-300/80 italic leading-snug tracking-tight ml-1.5 animate-pulse">
                {interimText}
              </span>
            )}
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center py-6">
            <p className="text-sm font-medium text-slate-400">
              {isListening
                ? 'Listening to hearing partner... Speak into microphone.'
                : 'Tap the microphone button and let the hearing person speak to see large real-time captions here.'}
            </p>
          </div>
        )}

        {/* Live Audio Waves when recording */}
        {isListening && (
          <div className="flex items-center justify-between pt-3 border-t border-slate-900 mt-3">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-3 bg-rose-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
              <span className="w-1.5 h-5 bg-rose-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
              <span className="w-1.5 h-7 bg-amber-400 rounded-full animate-bounce" />
              <span className="w-1.5 h-4 bg-rose-400 rounded-full animate-bounce [animation-delay:-0.2s]" />
              <span className="w-1.5 h-2 bg-rose-500 rounded-full animate-bounce [animation-delay:-0.4s]" />
              <span className="text-xs font-mono text-rose-400 font-semibold ml-2">LIVE CAPTIONS ON</span>
            </div>
            <span className="text-[11px] text-slate-500 font-mono">Web Speech STT</span>
          </div>
        )}
      </div>

      {/* Error Notice */}
      {errorMsg && (
        <div className="p-2.5 rounded-xl bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{errorMsg}</span>
        </div>
      )}

      {!isSupported && (
        <div className="p-2.5 rounded-xl bg-amber-950/40 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
          <span>Speech Recognition is best supported in Google Chrome, Edge, and Android browsers.</span>
        </div>
      )}

      {/* Big Mic Toggle Button */}
      <button
        onClick={handleToggleListening}
        className={`w-full py-3.5 px-4 rounded-xl font-bold text-sm sm:text-base flex items-center justify-center gap-2.5 transition-all shadow-lg active:scale-[0.99] ${
          isListening
            ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/30 animate-pulse'
            : 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 shadow-slate-950/50'
        }`}
      >
        {isListening ? (
          <>
            <MicOff className="w-5 h-5 text-white" />
            <span>Stop Microphone (Listening...)</span>
          </>
        ) : (
          <>
            <Mic className="w-5 h-5 text-cyan-400" />
            <span>Turn On Microphone for Captions</span>
          </>
        )}
      </button>
    </div>
  );
};
