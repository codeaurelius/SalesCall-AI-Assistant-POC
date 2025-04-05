// src/background/state.ts
import type {
  RecordingState,
  TranscriptionState,
  DeepgramTestState
} from './types';

// TODO: Add explicit types for these states if not already done

// Global state for recording
export let recordingState: RecordingState = {
  isRecording: false,
  startTime: 0,
  audioURL: null,
  error: null,
  warning: null,
  offscreenReady: false,
  useMicrophone: false
};

// Transcription state
export let transcriptionState: TranscriptionState = {
  enabled: true, // Assuming default
  status: 'disconnected', // 'disconnected', 'connecting', 'connected', 'error'
  error: null,
  segments: [], // Array of transcription segments
  currentText: null // Current interim segment
};

// Test state for Deepgram connection
export let deepgramTestState: DeepgramTestState = {
  isRunning: false,
  lastResult: null,
  lastError: null
}; 