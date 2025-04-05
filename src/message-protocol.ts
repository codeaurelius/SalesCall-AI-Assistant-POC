/**
 * CloseAssist - Message Protocol
 * 
 * This file defines the standard message format for communication between
 * different components of the extension (background script, offscreen document,
 * and React sidepanel).
 */

// Message target types
export enum MessageTarget {
  BACKGROUND = 'background',
  OFFSCREEN = 'offscreen',
  SIDEPANEL = 'sidepanel',
  CONTENT_SCRIPT = 'content-script',
  ANY = 'any' // For broadcasts
}

// Message action types organized by sender
export enum BackgroundAction {
  // Actions sent by background script
  RECORDING_STARTED = 'recordingStarted',
  RECORDING_STOPPED = 'recordingStopped',
  RECORDING_STATE_CHANGED = 'recordingStateChanged',
  TRANSCRIPTION_UPDATE = 'transcriptionUpdate',
  TRANSCRIPTION_CONNECTION_UPDATE = 'transcriptionConnectionUpdate',
  MICROPHONE_PERMISSION_CHANGED = 'microphonePermissionChanged',
  OFFSCREEN_READY_RESPONSE = 'offscreenReadyResponse'
}

export enum SidepanelAction {
  // Actions sent by sidepanel
  START_RECORDING = 'startRecording',
  STOP_RECORDING = 'stopRecording',
  DOWNLOAD_RECORDING = 'downloadRecording',
  GET_RECORDING_STATE = 'getRecordingState',
  REQUEST_MICROPHONE_PERMISSION = 'requestMicrophonePermission',
  OPEN_SIDE_PANEL = 'openSidePanel',
  GET_TRANSCRIPTION_STATE = 'getTranscriptionState',
  UPDATE_DEEPGRAM_SETTINGS = 'updateDeepgramSettings',
  SETUP_OFFSCREEN_DOCUMENT = 'setupOffscreenDocument'
}

export enum OffscreenAction {
  // Actions sent by offscreen document
  OFFSCREEN_READY = 'offscreenReady',
  RECORDING_RESULT = 'recordingResult',
  RECORDING_WARNING = 'recordingWarning',
  TRANSCRIPTION_UPDATE = 'transcriptionUpdate',
  TRANSCRIPTION_CONNECTION_UPDATE = 'transcriptionConnectionUpdate'
}

export enum ContentScriptAction {
  // Actions sent by content script
  PERMISSION_RESULT = 'permissionResult',
  TEST = 'test'
}

// Message interfaces
export interface BaseMessage {
  target: MessageTarget;
  action: string;
  data?: any;
}

// Background to Offscreen
export interface StartRecordingMessage extends BaseMessage {
  action: SidepanelAction.START_RECORDING;
  data: {
    streamId: string;
    useMicrophone: boolean;
    enableTranscription: boolean;
    apiKey?: string;
    language?: string;
  };
}

export interface StopRecordingMessage extends BaseMessage {
  action: SidepanelAction.STOP_RECORDING;
}

export interface DownloadRecordingMessage extends BaseMessage {
  action: SidepanelAction.DOWNLOAD_RECORDING;
  data?: {
    audioURL?: string;
  };
}

export interface UpdateDeepgramSettingsMessage extends BaseMessage {
  action: SidepanelAction.UPDATE_DEEPGRAM_SETTINGS;
  data: {
    apiKey?: string;
    language?: string;
  };
}

// Offscreen to Background
export interface OffscreenReadyMessage extends BaseMessage {
  action: OffscreenAction.OFFSCREEN_READY;
}

export interface RecordingResultMessage extends BaseMessage {
  action: OffscreenAction.RECORDING_RESULT;
  data: {
    audioURL: string;
  };
}

export interface RecordingWarningMessage extends BaseMessage {
  action: OffscreenAction.RECORDING_WARNING;
  data: {
    warning: string;
  };
}

export interface TranscriptionUpdateMessage extends BaseMessage {
  action: OffscreenAction.TRANSCRIPTION_UPDATE;
  data: {
    isFinal: boolean;
    segments: TranscriptSegment[];
    raw?: any; // Optional raw data
  };
}

export interface TranscriptionConnectionUpdateMessage extends BaseMessage {
  action: OffscreenAction.TRANSCRIPTION_CONNECTION_UPDATE;
  data: {
    status: 'disconnected' | 'connecting' | 'connected' | 'error' | 'apiKeyMissing';
    error?: string;
  };
}

// Background to Sidepanel
export interface RecordingStartedMessage extends BaseMessage {
  action: BackgroundAction.RECORDING_STARTED;
  data: {
    transcription: boolean;
    warning?: string;
    startTime: number;
  };
}

export interface RecordingStoppedMessage extends BaseMessage {
  action: BackgroundAction.RECORDING_STOPPED;
  data: {
    audioURL: string | null;
    error: string | null;
  };
}

export interface RecordingStateChangedMessage extends BaseMessage {
  action: BackgroundAction.RECORDING_STATE_CHANGED;
  data: {
    isRecording: boolean;
    audioURL: string | null;
    startTime: number | null;
  };
}

// Interface for transcript segments
export interface TranscriptSegment {
  speakerId: number;
  text: string;
  speaker?: string;
  start_time?: number;
  end_time?: number;
  id?: string;
  isFinal: boolean;
  timestamp?: number;
}

// Sidepanel to Background
export interface GetRecordingStateMessage extends BaseMessage {
  action: SidepanelAction.GET_RECORDING_STATE;
}

export interface GetTranscriptionStateMessage extends BaseMessage {
  action: SidepanelAction.GET_TRANSCRIPTION_STATE;
}

// Utility function to send messages with proper error handling
export const sendMessage = (message: BaseMessage): Promise<any> => {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          // Only log as error if it's not the expected "receiving end does not exist" error
          const errorMessage = chrome.runtime.lastError.message || 'Unknown runtime error';
          if (!errorMessage.includes('receiving end does not exist')) {
            console.error('Error sending message:', errorMessage);
          }
          reject(new Error(errorMessage));
        } else {
          resolve(response);
        }
      });
    } catch (error) {
      console.error('Error in sendMessage:', error);
      reject(error);
    }
  });
};

// Helper function to create standardized messages
export const createMessage = <T extends BaseMessage>(
  target: MessageTarget, 
  action: string, 
  data?: any
): T => {
  return {
    target,
    action,
    data
  } as T;
}; 