import React from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { useEmergencyContacts } from '../../auth/useEmergencyContacts';
import type { PredictorKind } from '../../lib/predictor';
import { useSignHistory } from '../../lib/signHistory';
import { DashboardHero } from './DashboardHero';
import { LearningPath, SignOfTheDay, SignalCheck, SosReadiness, TodayRibbon, WeekPulse } from './cards';

interface Props {
  predictorKind: PredictorKind | null;
  fallback: boolean;
  onTranslate: () => void;
  onPractise: (label?: string) => void;
}

/** Home view of the app: hero, then live cards about the pipeline, today's signing, and practice. */
export const DashboardHome: React.FC<Props> = ({ predictorKind, fallback, onTranslate, onPractise }) => {
  const { user, profile, enabled } = useAuth();
  const { contacts } = useEmergencyContacts();
  const events = useSignHistory();
  const firstName = profile?.full_name?.split(' ')[0] || null;

  return (
    <div className="-mt-[72px]">
      <DashboardHero name={firstName} onTranslate={onTranslate} onPractise={() => onPractise()} />

      <div className="relative mx-auto -mt-10 max-w-7xl space-y-5 px-4 pb-16 sm:px-6 lg:px-8">
        <div className="grid gap-5 lg:grid-cols-3">
          <SignalCheck predictorKind={predictorKind} fallback={fallback} />
          <SignOfTheDay onPractise={onPractise} />
          <SosReadiness signedIn={!!user} accountsEnabled={enabled} contacts={contacts.length} />
        </div>
        <div className="grid gap-5 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <TodayRibbon events={events} onStart={onTranslate} />
          </div>
          <div className="lg:col-span-2">
            <WeekPulse events={events} />
          </div>
        </div>
        <LearningPath events={events} onPractise={onPractise} />
        <p className="text-center text-xs text-white/30">Activity is stored only in this browser.</p>
      </div>
    </div>
  );
};
