import React from 'react';
import { X, Hand, Mic, AlertTriangle, ShieldCheck, CheckCircle2 } from 'lucide-react';

interface GuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GuideModal: React.FC<GuideModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500 text-slate-950 font-black flex items-center justify-center text-sm">
              सं
            </div>
            <div>
              <h3 className="text-base font-extrabold text-white font-['Plus_Jakarta_Sans']">
                How to use Sanket
              </h3>
              <p className="text-xs text-slate-400">Indian Sign Language Real-Time Communicator</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4 text-xs text-slate-300 leading-relaxed">
          <div className="flex gap-3 items-start p-3 rounded-xl bg-slate-950 border border-slate-800">
            <Hand className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-white text-sm mb-0.5">1. Sign Recognition</h4>
              <p>
                Hold your hand in front of the camera. The AI tracks 21 skeletal landmarks per hand. When your gesture stays stable for <strong>~1 second</strong> with &gt;80% confidence, it automatically accepts and adds the word to your sentence.
              </p>
            </div>
          </div>

          <div className="flex gap-3 items-start p-3 rounded-xl bg-slate-950 border border-slate-800">
            <Mic className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-white text-sm mb-0.5">2. Reverse Mode</h4>
              <p>
                Tap the microphone button for the hearing speaker. As they speak naturally, their words are instantly converted into extra large, high-contrast captions on your screen.
              </p>
            </div>
          </div>

          <div className="flex gap-3 items-start p-3 rounded-xl bg-slate-950 border border-slate-800">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-white text-sm mb-0.5">3. SOS Emergency Mode</h4>
              <p>
                Performing the distress hand gesture or tapping the SOS button initiates an emergency alert with a 5-second cancel countdown, loud audio alarm, and real-time GPS location sharing.
              </p>
            </div>
          </div>

          <div className="flex gap-3 items-start p-3 rounded-xl bg-slate-950 border border-slate-800">
            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-white text-sm mb-0.5">Privacy First</h4>
              <p>
                All computer vision and landmark extraction runs 100% locally in your web browser. No camera video is ever uploaded or stored on any server.
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs transition-all shadow-md shadow-amber-500/20"
        >
          Got it, Start Communicating!
        </button>
      </div>
    </div>
  );
};
