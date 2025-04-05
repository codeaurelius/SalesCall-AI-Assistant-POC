// src/background/types.ts

export interface CallSetupData {
  meetingTopic: string;
  hostName: string;
  guestName: string;
}

export interface GeminiResponse {
  keywords?: string[];
  objections?: string[];
  pain_points?: string[];
  action_items?: string[];
}

export interface GeminiAnalysisResult {
  success: boolean;
  insights?: GeminiResponse;
  error?: string;
}

// === NEW STATE TYPES ===

export interface TranscriptSegment {
  speakerId: number;
  start_time?: number;
  text: string;
  id?: string; // Optional UUID from transcription service? Not used yet.
  isFinal: boolean;
  word?: string; // Often included in detailed results
  speaker?: string; // Might be added during post-processing
}

export type RecordingStatus = 'inactive' | 'recording' | 'error'; // Consider if needed
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error' | 'apiKeyMissing';

export interface RecordingState {
  isRecording: boolean;
  startTime: number;
  audioURL: string | null;
  error: string | null;
  warning: string | null;
  offscreenReady: boolean;
  useMicrophone: boolean;
}

export interface TranscriptionState {
  enabled: boolean;
  status: ConnectionStatus;
  error: string | null;
  segments: TranscriptSegment[];
  currentText: string | null; // For interim results display if needed later
}

export interface DeepgramTestResult {
    success: boolean;
    transcription?: string; // Only present on success
    error?: string;       // Only present on failure
}

export interface DeepgramTestState {
  isRunning: boolean;
  lastResult: DeepgramTestResult | null;
  lastError: string | null;
}

// Add any other shared interfaces found in background.ts here...
// e.g., maybe for RecordingState or TranscriptionState if they become complex 