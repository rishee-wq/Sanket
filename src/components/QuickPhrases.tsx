import React, { useState } from 'react';
import { QUICK_PHRASES } from '../data/quickPhrases';
import { QuickPhrase } from '../types/isl';
import {
  Hand,
  HeartHandshake,
  AlertCircle,
  Activity,
  Droplet,
  CheckCircle2,
  XCircle,
  PlusSquare,
  Volume2,
} from 'lucide-react';
import { speechService } from '../services/speechService';
import { soundEffects } from '../services/soundEffects';

interface QuickPhrasesProps {
  onSelectPhrase: (phrase: QuickPhrase) => void;
}

export const QuickPhrases: React.FC<QuickPhrasesProps> = ({ onSelectPhrase }) => {
  const [activeId, setActiveId] = useState<string | null>(null);

  const getIcon = (name: string) => {
    switch (name) {
      case 'Hand':
        return <Hand className="w-5 h-5 text-orange-400" />;
      case 'HeartHandshake':
        return <HeartHandshake className="w-5 h-5 text-emerald-400" />;
      case 'AlertCircle':
        return <AlertCircle className="w-5 h-5 text-rose-400" />;
      case 'Cross':
        return <PlusSquare className="w-5 h-5 text-sky-400" />;
      case 'Activity':
        return <Activity className="w-5 h-5 text-purple-400" />;
      case 'Droplet':
        return <Droplet className="w-5 h-5 text-indigo-400" />;
      case 'CheckCircle2':
        return <CheckCircle2 className="w-5 h-5 text-lime-400" />;
      case 'XCircle':
        return <XCircle className="w-5 h-5 text-zinc-400" />;
      default:
        return <Volume2 className="w-5 h-5 text-orange-400" />;
    }
  };

  const handleTap = (phrase: QuickPhrase) => {
    setActiveId(phrase.id);
    soundEffects.playAccepted();
    speechService.speak(phrase.label);
    onSelectPhrase(phrase);
    setTimeout(() => setActiveId(null), 400);
  };

  return (
    <div className="sk-plate rounded-[22px] p-4 sm:p-5 ">
      <div className="flex items-center justify-between mb-3.5">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-orange-400" />
          <h3 className="text-sm font-bold tracking-tight text-white uppercase">
            Quick ISL Phrases
          </h3>
        </div>
        <span className="text-[11px] text-white/50">Tap to speak & append</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {QUICK_PHRASES.map((phrase) => {
          const isPressed = activeId === phrase.id;
          return (
            <button
              key={phrase.id}
              onClick={() => handleTap(phrase)}
              className={`p-3 rounded-xl border bg-gradient-to-br transition-all flex flex-col items-start justify-between min-h-[82px] text-left group active:scale-95 ${
                phrase.colorClass
              } ${isPressed ? 'scale-95 ring-2 ring-white/50 brightness-125' : 'hover:brightness-110'}`}
            >
              <div className="flex items-center justify-between w-full">
                <div className="p-1.5 rounded-lg bg-white/[.03]/60 border border-white/[.07]">
                  {getIcon(phrase.iconName)}
                </div>
                <Volume2 className="w-3.5 h-3.5 opacity-40 group-hover:opacity-100 transition-opacity" />
              </div>

              <div className="mt-2 w-full">
                <span className="block text-sm font-extrabold tracking-tight text-white group-hover:text-orange-200">
                  {phrase.label}
                </span>
                <span className="block text-[10px] text-white/50 truncate mt-0.5 font-medium">
                  {phrase.hindi}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
