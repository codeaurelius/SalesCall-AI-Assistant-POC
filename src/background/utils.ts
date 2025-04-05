// src/background/utils.ts
import { recordingState } from "./state"; // Import state

// === Logging Helper ===
export function logDebug(message: string, data: any = null): void {
  const disabledMessages: string[] = [
    // Paste the content of your disabledMessages array here from background.ts
    'Initializing background script',
    'Side panel registration completed',
    'Side panel setup completed successfully',
    'Removed existing context menu items',
    'Context menu created successfully',
    'CloseAssist extension initialized successfully',
    'Action clicked without popup',
    'Side panel opened via action click',
    'Returning recording state:',
    'Received keep-alive ping from offscreen.',
    'Setting recording badge',
    'Clearing recording badge',
    'Updated context menu items',
    // Added based on user request:
    'Handling message from UI (Sidepanel/Popup)...', // Might be too broad, let's test
    'Handling setupOffscreenDocument request from UI...',
    'Attempting to set up offscreen document...',
    'Checking for existing offscreen contexts...',
    'No existing offscreen document found. Creating a new one...',
    'New offscreen document creation initiated. Waiting for ready signal...',
    'Waiting for offscreenReady signal...',
    'Offscreen document signaled ready after',
    'Offscreen setup successful',
    'Offscreen document ready signal received',
    'Found existing offscreen document(s). Waiting for ready signal...'
  ];
  if (disabledMessages.some(disabled => message.includes(disabled))) {
    return;
  }
  const logMessage = `[BG] ${message}`;
  if (data) {
    console.log(logMessage, data);
  } else {
    console.log(logMessage);
  }
}

// === Delay Function === 
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
} 

// Helper function to stop recording if it's currently active
// Export this if needed elsewhere, otherwise keep it internal
export function stopRecordingIfActive() {
  if (recordingState.isRecording) {
    console.log("Browser or window closing, stopping active recording");
    
    // Instead of importing stopRecording, use chrome.runtime.sendMessage
    // to call the background script to stop recording
    chrome.runtime.sendMessage({ action: 'stopRecording' })
      .catch(err => console.error("Error stopping recording:", err));
  }
}
