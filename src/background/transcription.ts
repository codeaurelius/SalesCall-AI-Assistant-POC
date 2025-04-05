// Transcription message handling

import { transcriptionState } from "./state";
import { logDebug } from "./utils";
import type { TranscriptSegment, ConnectionStatus } from "./types"; // Import types

// Define types for the incoming message data
interface TranscriptionUpdateData {
    isFinal: boolean;
    segments: TranscriptSegment[];
    raw?: any; // Keep raw data if needed, but type it loosely
}

interface TranscriptionConnectionUpdateData {
    status: ConnectionStatus;
    error?: string | null;
}

// Handle transcription update from offscreen document
export function handleTranscriptionUpdate(data: TranscriptionUpdateData): void { // Added export and type
    logDebug('Handling transcription update:', data);
    
    // Type guard to ensure data and segments exist
    if (!data || !Array.isArray(data.segments)) { 
      logDebug('Invalid transcription update data received (missing segments array)');
      return;
    }
    
    // Forward the processed data to the sidepanel using standardized format
    try {
      chrome.runtime.sendMessage({
          // REMOVED target: 'sidepanel'
          action: 'transcriptionUpdate',
          data: data // Contains { isFinal, segments, raw }
      }).catch(err => {
        // Only log real errors, not "receiving end does not exist" which is expected
        if (err && err.message && !err.message.includes('receiving end does not exist') && !err.message.includes('Could not establish connection')) { // Added check for connection error
          logDebug('Error sending transcription update:', err);
        }
      });
    } catch (error: any) { // Added type
      logDebug('Error notifying transcription update:', error);
    }
}
  
// Handle transcription connection update from offscreen document
export function handleTranscriptionConnectionUpdate(data: TranscriptionConnectionUpdateData): void { // Added export and type
    logDebug('[background] Handling transcription connection update:', data);
    
    if (!data || !data.status) {
      logDebug('[background] Invalid transcription connection update data (missing status)');
      return;
    }
    
    // Update local state (optional, could remove if not used elsewhere)
    transcriptionState.status = data.status;
    transcriptionState.error = data.error || null;
    
    // Notify sidepanel of connection status update using standardized format
    logDebug('[background] Attempting to send transcriptionConnectionUpdate to UI:', data);
    try {
      chrome.runtime.sendMessage({ 
        // REMOVED target: 'sidepanel'
        action: 'transcriptionConnectionUpdate', 
        data: data // Forward the connection update { status, error }
      }).catch((error: any) => { // Added type
        // Log error only if it's not the expected "no receiving end" error
        if (error && error.message && !error.message.includes('Could not establish connection') && !error.message.includes('receiving end does not exist')) { // Combined checks
           logDebug('[background] Error sending connection update to UI (expected if panel closed):', error);
        }
      }); 
    } catch (error: any) { // Added type
      logDebug('[background] Unexpected error notifying connection update:', error);
    }
}



