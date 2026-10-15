// Speech Synthesis & Recognition Service

// Interface for Web Speech Recognition API
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      length: number;
      [index: number]: {
        transcript: string;
        confidence: number;
      };
    };
  };
}

interface SpeechRecognitionErrorEventLike {
  error: string;
  message?: string;
}

interface ISpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => ISpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => ISpeechRecognitionInstance;
  }
}

class SpeechService {
  private recognition: ISpeechRecognitionInstance | null = null;
  private isListening = false;
  private onTranscriptCallback: ((transcript: string, isFinal: boolean) => void) | null = null;
  private onStateChangeCallback: ((isListening: boolean) => void) | null = null;
  private onErrorCallback: ((error: string) => void) | null = null;

  public isSpeechRecognitionSupported(): boolean {
    if (typeof window === 'undefined') return false;
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  public isSpeechSynthesisSupported(): boolean {
    if (typeof window === 'undefined') return false;
    return 'speechSynthesis' in window;
  }

  // Text-to-Speech
  public speak(text: string, lang = 'en-IN'): Promise<void> {
    return new Promise((resolve) => {
      if (!this.isSpeechSynthesisSupported() || !text.trim()) {
        resolve();
        return;
      }

      window.speechSynthesis.cancel(); // Stop any pending speech

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.95;
      utterance.pitch = 1.0;
      utterance.lang = lang;

      // Select matching voice if available
      const voices = window.speechSynthesis.getVoices();
      const preferredVoice =
        voices.find((v) => v.lang.includes('en-IN')) ||
        voices.find((v) => v.lang.startsWith('en')) ||
        voices[0];

      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }

      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();

      window.speechSynthesis.speak(utterance);
    });
  }

  public stopSpeaking() {
    if (this.isSpeechSynthesisSupported()) {
      window.speechSynthesis.cancel();
    }
  }

  // Speech-to-Text (Reverse Mode)
  public startListening(callbacks: {
    onTranscript: (transcript: string, isFinal: boolean) => void;
    onStateChange: (isListening: boolean) => void;
    onError: (error: string) => void;
  }) {
    if (!this.isSpeechRecognitionSupported()) {
      callbacks.onError('Speech recognition is not supported in this browser. Please use Chrome, Edge, or Safari.');
      return;
    }

    if (this.isListening) {
      this.stopListening();
    }

    this.onTranscriptCallback = callbacks.onTranscript;
    this.onStateChangeCallback = callbacks.onStateChange;
    this.onErrorCallback = callbacks.onError;

    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) return;

    try {
      this.recognition = new SpeechRec();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = 'en-US';

      this.recognition.onstart = () => {
        this.isListening = true;
        this.onStateChangeCallback?.(true);
      };

      this.recognition.onend = () => {
        this.isListening = false;
        this.onStateChangeCallback?.(false);
      };

      this.recognition.onerror = (e) => {
        this.isListening = false;
        this.onStateChangeCallback?.(false);
        this.onErrorCallback?.(`Microphone error: ${e.error}`);
      };

      this.recognition.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const res = event.results[i];
          if (res.isFinal) {
            finalTranscript += res[0].transcript;
          } else {
            interimTranscript += res[0].transcript;
          }
        }

        const text = (finalTranscript || interimTranscript).trim();
        if (text) {
          this.onTranscriptCallback?.(text, !!finalTranscript);
        }
      };

      this.recognition.start();
    } catch (err: unknown) {
      this.isListening = false;
      this.onStateChangeCallback?.(false);
      const msg = err instanceof Error ? err.message : String(err);
      this.onErrorCallback?.(msg || 'Could not start microphone');
    }
  }

  public stopListening() {
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {
        // Ignore
      }
      this.recognition = null;
    }
    this.isListening = false;
    this.onStateChangeCallback?.(false);
  }
}

export const speechService = new SpeechService();
