import { useState, useEffect, useCallback } from 'react';
import { 
  BaseMessage, 
  sendMessage, 
  createMessage,
  MessageTarget, 
  SidepanelAction,
  BackgroundAction,
  TranscriptSegment
} from '../../message-protocol';

interface UseExtensionMessagingOptions {
  onRecordingStarted?: (data: any) => void;
  onRecordingStopped?: (data: any) => void;
  onRecordingStateChanged?: (data: any) => void;
  onTranscriptionUpdate?: (data: any) => void;
  onTranscriptionConnectionUpdate?: (data: any) => void;
  onMicrophonePermissionChanged?: (data: any) => void;
}

export function useExtensionMessaging(options: UseExtensionMessagingOptions = {}) {
  const [isMessageListenerActive, setIsMessageListenerActive] = useState(false);

  // Handle incoming messages
  useEffect(() => {
    const messageHandler = (message: any) => {
      console.log('Message received in hook:', message);
      
      // Handle various actions from background script
      switch (message.action) {
        case BackgroundAction.RECORDING_STARTED:
          if (options.onRecordingStarted) options.onRecordingStarted(message.data);
          break;
          
        case BackgroundAction.RECORDING_STOPPED:
          if (options.onRecordingStopped) options.onRecordingStopped(message.data);
          break;
          
        case BackgroundAction.RECORDING_STATE_CHANGED:
          if (options.onRecordingStateChanged) options.onRecordingStateChanged(message.data);
          break;
          
        case BackgroundAction.TRANSCRIPTION_UPDATE:
          if (options.onTranscriptionUpdate) options.onTranscriptionUpdate(message.data);
          break;
          
        case BackgroundAction.TRANSCRIPTION_CONNECTION_UPDATE:
          if (options.onTranscriptionConnectionUpdate) 
            options.onTranscriptionConnectionUpdate(message.data);
          break;
          
        case BackgroundAction.MICROPHONE_PERMISSION_CHANGED:
          if (options.onMicrophonePermissionChanged) 
            options.onMicrophonePermissionChanged(message.data);
          break;
      }
    };

    // Add message listener
    chrome.runtime.onMessage.addListener(messageHandler);
    setIsMessageListenerActive(true);
    
    // Cleanup listener when component unmounts
    return () => {
      chrome.runtime.onMessage.removeListener(messageHandler);
      setIsMessageListenerActive(false);
    };
  }, [
    options.onRecordingStarted, 
    options.onRecordingStopped, 
    options.onRecordingStateChanged,
    options.onTranscriptionUpdate,
    options.onTranscriptionConnectionUpdate,
    options.onMicrophonePermissionChanged
  ]);

  // Standardized action methods
  const getRecordingState = useCallback(async () => {
    try {
      const message = createMessage<BaseMessage>(
        MessageTarget.BACKGROUND,
        SidepanelAction.GET_RECORDING_STATE
      );
      return await sendMessage(message);
    } catch (error) {
      console.error('Error getting recording state:', error);
      throw error;
    }
  }, []);

  const startRecording = useCallback(async (useMicrophone: boolean = false) => {
    try {
      const message = createMessage<BaseMessage>(
        MessageTarget.BACKGROUND,
        SidepanelAction.START_RECORDING,
        { useMicrophone }
      );
      return await sendMessage(message);
    } catch (error) {
      console.error('Error starting recording:', error);
      throw error;
    }
  }, []);

  const stopRecording = useCallback(async () => {
    try {
      const message = createMessage<BaseMessage>(
        MessageTarget.BACKGROUND,
        SidepanelAction.STOP_RECORDING
      );
      return await sendMessage(message);
    } catch (error) {
      console.error('Error stopping recording:', error);
      throw error;
    }
  }, []);

  const downloadRecording = useCallback(async () => {
    try {
      const message = createMessage<BaseMessage>(
        MessageTarget.BACKGROUND,
        SidepanelAction.DOWNLOAD_RECORDING
      );
      return await sendMessage(message);
    } catch (error) {
      console.error('Error downloading recording:', error);
      throw error;
    }
  }, []);

  const requestMicrophonePermission = useCallback(async () => {
    try {
      const message = createMessage<BaseMessage>(
        MessageTarget.BACKGROUND,
        SidepanelAction.REQUEST_MICROPHONE_PERMISSION
      );
      return await sendMessage(message);
    } catch (error) {
      console.error('Error requesting microphone permission:', error);
      throw error;
    }
  }, []);

  const getTranscriptionState = useCallback(async () => {
    try {
      const message = createMessage<BaseMessage>(
        MessageTarget.BACKGROUND,
        SidepanelAction.GET_TRANSCRIPTION_STATE
      );
      return await sendMessage(message);
    } catch (error) {
      console.error('Error getting transcription state:', error);
      throw error;
    }
  }, []);

  const updateDeepgramSettings = useCallback(async (apiKey?: string, language?: string) => {
    try {
      const message = createMessage<BaseMessage>(
        MessageTarget.BACKGROUND,
        SidepanelAction.UPDATE_DEEPGRAM_SETTINGS,
        { apiKey, language }
      );
      return await sendMessage(message);
    } catch (error) {
      console.error('Error updating Deepgram settings:', error);
      throw error;
    }
  }, []);

  // New function to ping the offscreen document directly (now just ensures it's set up)
  const pingOffscreenDocument = useCallback(async () => {
    try {
      // Ask the background script to ensure the offscreen document is created
      const setupMessage = createMessage<BaseMessage>(
        MessageTarget.BACKGROUND,
        SidepanelAction.SETUP_OFFSCREEN_DOCUMENT,
        { forPing: true } // Keep flag for potential background differentiation
      );
      
      // Wait for the background to confirm offscreen is ready or created
      const setupResult = await sendMessage(setupMessage);
      
      if (!setupResult || !setupResult.success) {
        console.warn('Failed to set up offscreen document:', setupResult?.error);
        return { 
          success: false, 
          error: setupResult?.error || 'Failed to set up offscreen document' 
        };
      }
      
      // If setup was successful, return success. No need to send 'hello' anymore.
      console.log('[useExtensionMessaging] Offscreen document setup confirmed by background.');
      return { success: true, message: 'Offscreen document setup confirmed.' };

    } catch (error: unknown) {
      console.error('Error ensuring offscreen document setup:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  }, []);

  return {
    isMessageListenerActive,
    getRecordingState,
    startRecording,
    stopRecording,
    downloadRecording,
    requestMicrophonePermission,
    getTranscriptionState,
    updateDeepgramSettings,
    pingOffscreenDocument
  };
} 