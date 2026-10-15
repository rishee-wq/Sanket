import React, { useState, useEffect, useRef } from 'react';
import {
  AlertTriangle,
  MapPin,
  PhoneCall,
  Share2,
  Copy,
  Check,
  ShieldAlert,
  Volume2,
  VolumeX,
  ExternalLink,
  RotateCcw,
} from 'lucide-react';
import { UserLocation } from '../types/isl';
import { soundEffects } from '../services/soundEffects';
import { speechService } from '../services/speechService';
import { useAuth } from '../auth/AuthProvider';
import { useEmergencyContacts } from '../auth/useEmergencyContacts';
import { Link } from '../lib/router';

interface SosViewProps {
  onBackToNormal?: () => void;
  isTriggeredDirectly?: boolean;
}

export const SosView: React.FC<SosViewProps> = ({ onBackToNormal, isTriggeredDirectly = false }) => {
  const [countdown, setCountdown] = useState<number>(5);
  const [isCountingDown, setIsCountingDown] = useState<boolean>(isTriggeredDirectly);
  const [isAlertDispatched, setIsAlertDispatched] = useState<boolean>(false);
  const [location, setLocation] = useState<UserLocation | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isLoadingLocation, setIsLoadingLocation] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [isSirenPlaying, setIsSirenPlaying] = useState<boolean>(false);

  const sirenIntervalRef = useRef<number | null>(null);
  const { user, enabled } = useAuth();
  const { contacts } = useEmergencyContacts();

  // Fetch location on mount or trigger
  const fetchLocation = () => {
    setIsLoadingLocation(true);
    setLocationError(null);

    if (!('geolocation' in navigator)) {
      setLocationError('Geolocation is not supported by your browser.');
      setIsLoadingLocation(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        setLocation({
          latitude,
          longitude,
          accuracy: Math.round(accuracy),
          timestamp: pos.timestamp,
          mapsUrl: `https://maps.google.com/?q=${latitude},${longitude}`,
        });
        setIsLoadingLocation(false);
      },
      (err) => {
        console.warn('Geolocation error:', err);
        setLocationError(`Location unavailable (${err.message}). Coordinates can be sent manually.`);
        setIsLoadingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  useEffect(() => {
    fetchLocation();
  }, []);

  // Countdown timer effect
  useEffect(() => {
    if (!isCountingDown) return;

    if (countdown > 0) {
      soundEffects.playTick();
      const timer = setTimeout(() => {
        setCountdown((prev) => prev - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else {
      // Countdown reached 0: dispatch emergency alert!
      setIsCountingDown(false);
      setIsAlertDispatched(true);
      startSiren();
      speechService.speak(
        'Emergency alert activated. Deaf person in distress. Please provide immediate assistance.',
        'en-IN'
      );
    }
  }, [countdown, isCountingDown]);

  const startSiren = () => {
    setIsSirenPlaying(true);
    soundEffects.playSosAlert();
    sirenIntervalRef.current = window.setInterval(() => {
      soundEffects.playSosAlert();
    }, 1800);
  };

  const stopSiren = () => {
    if (sirenIntervalRef.current) {
      clearInterval(sirenIntervalRef.current);
      sirenIntervalRef.current = null;
    }
    setIsSirenPlaying(false);
    speechService.stopSpeaking();
  };

  const handleCancelCountdown = () => {
    setIsCountingDown(false);
    stopSiren();
    setCountdown(5);
    setIsAlertDispatched(false);
    if (onBackToNormal) {
      onBackToNormal();
    }
  };

  const handleManualTrigger = () => {
    setCountdown(5);
    setIsCountingDown(true);
    setIsAlertDispatched(false);
  };

  const getEmergencyMessage = () => {
    const locText = location
      ? `Live GPS Location: ${location.mapsUrl} (±${location.accuracy}m)`
      : 'Location: Unable to automatically detect GPS';
    return `🚨 EMERGENCY SOS ALERT 🚨\nI am deaf / speech-impaired and need urgent assistance.\n${locText}\nPlease send emergency help immediately.`;
  };

  const handleCopyMessage = async () => {
    await navigator.clipboard.writeText(getEmergencyMessage());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Emergency SOS Alert',
          text: getEmergencyMessage(),
          url: location?.mapsUrl,
        });
      } catch {
        handleCopyMessage();
      }
    } else {
      handleCopyMessage();
    }
  };

  useEffect(() => {
    return () => {
      stopSiren();
    };
  }, []);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div
        className={`p-6 rounded-2xl border transition-all ${
          isCountingDown || isAlertDispatched
            ? 'bg-rose-950/80 border-rose-500 shadow-2xl shadow-rose-900/50'
            : 'bg-slate-900 border-rose-500/30'
        }`}
      >
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4 text-center md:text-left">
            <div
              className={`w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 ${
                isCountingDown || isAlertDispatched
                  ? 'bg-rose-600 text-white animate-bounce'
                  : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
              }`}
            >
              <ShieldAlert className="w-9 h-9" />
            </div>

            <div>
              <div className="flex items-center gap-2 justify-center md:justify-start">
                <span className="text-xs font-bold uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/40">
                  ISL Distress Protocol
                </span>
                <span className="text-xs text-slate-400">Gesture or Button Trigger</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-black text-white mt-1 tracking-tight">
                {isCountingDown
                  ? `Emergency Triggered! Dispatching in ${countdown}s`
                  : isAlertDispatched
                  ? '🚨 EMERGENCY ALERT BROADCASTING'
                  : 'Emergency SOS System'}
              </h2>
              <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-xl">
                Holding the SOS sign (four fingers up, thumb tucked into the palm) or pressing the button opens this alert with your location.
              </p>
            </div>
          </div>

          {/* Trigger / Cancel Buttons */}
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
            {isCountingDown ? (
              <button
                onClick={handleCancelCountdown}
                className="w-full sm:w-auto px-6 py-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white border-2 border-slate-700 font-extrabold text-sm sm:text-base transition-all active:scale-95 shadow-xl flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-5 h-5 text-amber-400" />
                <span>CANCEL SOS (False Alarm)</span>
              </button>
            ) : isAlertDispatched ? (
              <button
                onClick={handleCancelCountdown}
                className="w-full sm:w-auto px-6 py-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black text-sm sm:text-base transition-all active:scale-95 shadow-xl flex items-center justify-center gap-2"
              >
                <Check className="w-5 h-5" />
                <span>I AM SAFE NOW (Stop Alarm)</span>
              </button>
            ) : (
              <button
                onClick={handleManualTrigger}
                className="w-full sm:w-auto px-8 py-4 rounded-xl bg-gradient-to-r from-rose-600 to-red-700 hover:from-rose-500 hover:to-red-600 text-white font-black text-base sm:text-lg transition-all shadow-xl shadow-rose-600/40 active:scale-95 flex items-center justify-center gap-2.5"
              >
                <AlertTriangle className="w-6 h-6 animate-pulse" />
                <span>TRIGGER SOS NOW</span>
              </button>
            )}
          </div>
        </div>

        {/* Live Countdown Progress Ring (When active) */}
        {isCountingDown && (
          <div className="mt-6 pt-6 border-t border-rose-900/60 flex flex-col items-center">
            <div className="relative w-24 h-24 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90">
                <circle
                  cx="48"
                  cy="48"
                  r="42"
                  stroke="currentColor"
                  strokeWidth="8"
                  fill="transparent"
                  className="text-rose-950"
                />
                <circle
                  cx="48"
                  cy="48"
                  r="42"
                  stroke="currentColor"
                  strokeWidth="8"
                  fill="transparent"
                  strokeDasharray={264}
                  strokeDashoffset={264 * (1 - countdown / 5)}
                  className="text-rose-500 transition-all duration-1000"
                  strokeLinecap="round"
                />
              </svg>
              <span className="absolute text-3xl font-black font-mono text-white animate-pulse">
                {countdown}
              </span>
            </div>
            <p className="text-xs text-rose-300 font-semibold mt-2">
              Cancelling is possible anytime before countdown ends
            </p>
          </div>
        )}
      </div>

      {/* Grid: GPS Location Card & Emergency Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Real-time GPS Location Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-400">
                  <MapPin className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    Real-Time GPS Location
                  </h3>
                  <span className="text-xs text-slate-400">Coordinates for Responders</span>
                </div>
              </div>

              <button
                onClick={fetchLocation}
                disabled={isLoadingLocation}
                className="text-xs text-sky-400 hover:text-sky-300 font-medium px-2 py-1 bg-slate-800 rounded-lg transition-colors"
              >
                {isLoadingLocation ? 'Locating...' : 'Refresh GPS'}
              </button>
            </div>

            {location ? (
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <span className="text-slate-400 font-medium">Latitude:</span>
                  <span className="font-mono font-bold text-sky-400">{location.latitude.toFixed(6)}°</span>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <span className="text-slate-400 font-medium">Longitude:</span>
                  <span className="font-mono font-bold text-sky-400">{location.longitude.toFixed(6)}°</span>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <span className="text-slate-400 font-medium">GPS Accuracy:</span>
                  <span className="font-mono text-emerald-400 font-bold">±{location.accuracy} meters</span>
                </div>

                <div className="pt-2 mt-2 border-t border-slate-900 flex items-center justify-between">
                  <a
                    href={location.mapsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-sky-400 hover:underline"
                  >
                    <span>Open in Google Maps</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-center py-6">
                <p className="text-xs text-slate-400">
                  {locationError || (isLoadingLocation ? 'Acquiring high-accuracy GPS coordinates...' : 'Location not yet acquired')}
                </p>
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <span>India Emergency Helpline:</span>
            <span className="font-bold font-mono text-rose-400">Dial 112 / 108</span>
          </div>
        </div>

        {/* Dispatch & Communications */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
                <PhoneCall className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  One-Tap Emergency Dispatch
                </h3>
                <span className="text-xs text-slate-400">Quickly broadcast message with location</span>
              </div>
            </div>

            <div className="mb-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-300">
              <p className="mb-2 font-semibold text-slate-200">Emergency contacts</p>
              {contacts.length > 0 ? (
                <ul className="space-y-1.5">
                  {contacts.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-3">
                      <span className="truncate">
                        {c.name}
                        {c.relation && <span className="text-slate-500"> · {c.relation}</span>}
                      </span>
                      <a href={`tel:${c.phone.replace(/[^+\d]/g, '')}`} className="font-mono text-amber-300 hover:text-amber-200">
                        {c.phone}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : enabled && user ? (
                <p className="text-slate-400">
                  No contacts saved. <Link to="/account#contacts" className="text-amber-300 underline">Add them in your account</Link>.
                </p>
              ) : enabled ? (
                <p className="text-slate-400">
                  <Link to="/login?next=/app" className="text-amber-300 underline">Log in</Link> to keep emergency contacts here.
                </p>
              ) : (
                <p className="text-slate-400">Accounts are not set up on this copy of Sanket.</p>
              )}
              <p className="mt-2 text-[11px] text-slate-500">Automatic SMS isn’t built yet: copy or share the message below, or tap a number to call.</p>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-slate-300 leading-relaxed max-h-[110px] overflow-y-auto">
              {getEmergencyMessage()}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-slate-800/80">
            <button
              onClick={handleCopyMessage}
              className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs border border-slate-700 transition-all active:scale-95"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? 'Copied' : 'Copy SOS Text'}</span>
            </button>

            <button
              onClick={handleShare}
              className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition-all shadow-md shadow-rose-600/30 active:scale-95"
            >
              <Share2 className="w-4 h-4" />
              <span>Share Location</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
