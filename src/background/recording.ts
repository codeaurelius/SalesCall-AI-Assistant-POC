// Recording logic (start, stop, state, badge)

import { logDebug } from "./utils";
import { recordingState, transcriptionState } from "./state"; // Import state
import type { RecordingState, TranscriptionState } from "./types"; // Import types
import { 
    setupOffscreenDocument, 
    getTabCaptureMediaStreamId, 
    updateContextMenuItems,
    setRecordingBadge, 
    clearRecordingBadge 
} from "./chromeApiHandler"; 

// Define a type for the data sent to the offscreen document
interface OffscreenStartData {
    streamId: string;
    useMicrophone: boolean;
    enableTranscription: boolean;
    apiKey?: string; 
    language?: string;
}

// Toggle recording state from context menu
// Needs chromeApiHandler context, likely move this function there. Exporting for now.
export async function toggleRecording(tabId: number | undefined) { 
    // If already recording, stop recording
    if (recordingState.isRecording) {
        logDebug('Toggle recording: stopping current recording');
        return await stopRecording(); 
    } else {
        // Start recording (Assuming default useMic=false, useTab=true for quick record)
        logDebug('Toggle recording: starting new recording for tab:', tabId);
        return await startRecording(false, true, tabId); 
    }
}

// Start recording
export async function startRecording(useMic: boolean, useTab: boolean, requestedTabId?: number) { // Added export and types
    logDebug('Starting recording...', { useMic, useTab, requestedTabId });

    // <<< Use function arguments directly >>>
    const enableTranscription = true; // Assuming transcription is always wanted if possible? Or pass as arg?
    // For now, let's assume enableTranscription is always true if API key exists.

    logDebug('[BG Start] Arguments received:', { useMic, useTab, requestedTabId });

    // Check if we already have an active recording
    if (recordingState.isRecording) {
        logDebug('Recording already in progress');
        return { success: false, error: 'Recording already in progress' };
    }

    try {
        // Get Deepgram settings 
        let deepgramApiKey: string | null = null;
        let transcriptionLanguage: string = 'en';
        // Check if transcription should be enabled (e.g., based on API key existence)
        // Add type assertion for settingsResult
        const settingsResult = await new Promise<{ deepgramApiKey?: string; transcriptionLanguage?: string }>(resolve => { 
            chrome.storage.local.get(['deepgramApiKey', 'transcriptionLanguage'], resolve);
        });
        deepgramApiKey = settingsResult.deepgramApiKey || null;
        transcriptionLanguage = settingsResult.transcriptionLanguage || 'en';
        const actualEnableTranscription = !!deepgramApiKey;
        logDebug('[BG Start] Determined transcription settings:', { actualEnableTranscription, language: transcriptionLanguage });

        // Reset states
        recordingState.error = null;
        recordingState.warning = null;
        recordingState.audioURL = null;

        // Reset transcription state
        transcriptionState.status = 'disconnected';
        transcriptionState.error = null;
        transcriptionState.segments = [];
        transcriptionState.currentText = null;

        // <<< Permission check uses 'useMic' argument >>>
        let finalUseMic = useMic; // Start with the requested value
        logDebug('[BG Start PermCheck] Checking permission based on argument useMic:', finalUseMic);
        if (finalUseMic) {
            // Add type assertion for permissionResult
            const permissionResult = await new Promise<boolean | undefined>(resolve => { 
                chrome.storage.local.get('microphonePermissionGranted', (result) => {
                    logDebug('[BG Start PermCheck] Raw result from storage:', result);
                    resolve(result?.microphonePermissionGranted); // Access safely
                });
            });
            logDebug('[BG Start PermCheck] Resolved permissionResult:', permissionResult);
            if (!permissionResult) {
                logDebug('>>> [BG Start PermCheck] PERMISSION NOT GRANTED. Setting finalUseMic to false. <<<');
                finalUseMic = false; // Update the local variable
                recordingState.warning = 'Microphone permission not granted...';
            } else {
                logDebug('[BG Start PermCheck] PERMISSION GRANTED. Proceeding.');
            }
        } else {
            logDebug('[BG Start PermCheck] Microphone use not requested.');
        }

        // Get tab ID (using argument)
        let tabId = requestedTabId;
        if (!tabId) {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tabs || tabs.length === 0) {
                throw new Error('No active tab found');
            }
            if (tabs[0].id === undefined) {
                 throw new Error('Active tab has no ID');
            }
            tabId = tabs[0].id;
        }

        logDebug('Recording tab:', tabId);

        // Get stream ID (Ensure getTabCaptureMediaStreamId handles potential errors)
        const streamId = await getTabCaptureMediaStreamId(tabId); 
        logDebug('Got tab capture media stream ID:', streamId);

        // Set up offscreen document ONLY if it's not already marked as ready
        if (!recordingState.offscreenReady) {
            logDebug('[Background Start] Offscreen document not ready, calling setupOffscreenDocument...');
            await setupOffscreenDocument(); // Use imported function
        } else {
            logDebug('[Background Start] Offscreen document already ready, skipping setup.');
            // Optional: Add a quick check to ensure the context *actually* exists, just in case
            try {
                // Use correct context type
                const contexts = await chrome.runtime.getContexts({ contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT] });
                if (!contexts || contexts.length === 0) { // Check if contexts is defined
                    logDebug('[Background Start] Warning: offscreenReady was true, but no context found. Attempting setup anyway.');
                    await setupOffscreenDocument(); // Use imported function
                }
            } catch (err: any) { // Add type
                logDebug('[Background Start] Error checking existing contexts despite ready flag:', err);
                // Attempt setup as a fallback
                await setupOffscreenDocument(); // Use imported function
            }
        }

        // Prepare data for offscreen document (using finalUseMic)
        // Use the defined interface
        const offscreenData: OffscreenStartData = {
            streamId: streamId,
            useMicrophone: finalUseMic, // Use the potentially updated local variable
            enableTranscription: actualEnableTranscription
        };
        if (offscreenData.enableTranscription) {
            offscreenData.apiKey = deepgramApiKey ?? undefined; // Ensure undefined if null
            offscreenData.language = transcriptionLanguage;
        }
        logDebug('[Background Start] Data being sent to offscreen:', offscreenData);

        // Send message to offscreen document to start recording
        logDebug('[Background Start] Sending startRecording message to offscreen...');
        try {
            // Make sure we notify about transcription status
            chrome.runtime.sendMessage({
                action: 'transcriptionConnectionUpdate',
                data: {
                    status: actualEnableTranscription ? 'connecting' : 'disconnected',
                    error: actualEnableTranscription ? null : 'Transcription disabled (no API key)'
                }
            }).catch(err => {
                // Expected if no sidepanel is open
                logDebug('[Background Start] Error sending initial transcription status (expected if no UI):', err);
            });
        
            // We won't rely on the response for success state anymore
            chrome.runtime.sendMessage({
                action: 'startRecording',
                target: 'offscreen',
                data: offscreenData
            });
            logDebug('[Background Start] startRecording message sent to offscreen. Waiting for confirmation message...');
            // Don't set isRecording = true here. Wait for 'recordingActuallyStarted' message.
        } catch (sendMessageError: any) { // Add type
            logDebug('>>> [Background Start] CRITICAL ERROR sending message to offscreen:', sendMessageError);
            // If sending fails, report error immediately
            throw new Error(`Failed to send start command to offscreen document: ${sendMessageError.message}`);
        }

        // Indicate that the start command was sent, but success is pending confirmation
        return { success: true, pendingConfirmation: true };

    } catch (error: any) { // Add type
        logDebug('Error starting recording:', error);
        recordingState.error = `Error: ${error.message}`;
        return { success: false, error: recordingState.error };
    }
}

// Stop recording
export async function stopRecording() { // Added export
    logDebug('Stopping recording...');

    try {
        if (!recordingState.isRecording) {
            logDebug('No active recording to stop');
            return { success: false, error: 'No active recording' };
        }

        // Send message to offscreen document to stop recording AND AWAIT RESPONSE
        logDebug('Sending stopRecording message to offscreen document and awaiting response...');
        // Add type assertion for result
        const result: { success: boolean, audioURL?: string, error?: string, stopped?: boolean } | undefined = await chrome.runtime.sendMessage({ 
            target: 'offscreen', // Ensure target is specified
            action: 'stopRecording'
        });
        logDebug('Received response from offscreen stopRecording:', result);

        // Update recording state AFTER confirmation or failure
        recordingState.isRecording = false; 
        clearRecordingBadge(); // Use imported function
        await updateContextMenuItems(); // Use imported function

        // Process the result from offscreen
        if (result && result.success) {
            recordingState.audioURL = result.audioURL || null;
            if (recordingState.audioURL) {
                logDebug('Audio URL saved from offscreen response:', recordingState.audioURL);
            } else {
                logDebug('Offscreen stopped successfully, but no audio URL was returned (might be expected).');
            }
            
            // Notify sidepanel AFTER successful stop
            chrome.runtime.sendMessage({
                action: 'recordingStopped',
                data: { audioURL: recordingState.audioURL, error: null } // Send data structure
            }).catch(err => logDebug('Error sending recordingStopped to UI (expected if closed):', err));
            
            logDebug('Recording stopped successfully (confirmed by offscreen).');
            return { success: true, audioURL: recordingState.audioURL };

        } else {
            // Handle failure reported by offscreen or communication error
            const errorMsg = result?.error || 'Failed to communicate with offscreen document or stop failed there.';
            logDebug('>>> Error stopping recording (reported by offscreen or comms failure):', errorMsg);
            recordingState.error = errorMsg;
            
            // Notify sidepanel about the error
            chrome.runtime.sendMessage({
                action: 'recordingStopped',
                data: { audioURL: null, error: errorMsg } // Send data structure
            }).catch(err => logDebug('Error sending recordingStopped error to UI (expected if closed):', err));
            
            return { success: false, error: errorMsg };
        }

    } catch (error: any) { // Add type
        logDebug('>>> CRITICAL Error in background stopRecording function:', error);
        recordingState.error = `Error: ${error.message}`;
        recordingState.isRecording = false; // Ensure state is false on error
        clearRecordingBadge(); // Use imported function
        updateContextMenuItems().catch(e => logDebug('Error updating context menu during cleanup:', e)); // Update context menu even if there was an error

        // Notify sidepanel about the critical error
        chrome.runtime.sendMessage({
            action: 'recordingStopped',
            data: { audioURL: null, error: recordingState.error } // Send data structure
        }).catch(err => logDebug('Error sending critical recordingStopped error to UI (expected if closed):', err));
        
        return { success: false, error: recordingState.error };
    }
}

// Download recording
export async function downloadRecording() { // Added export
    logDebug('Downloading recording...');

    try {
        if (!recordingState.audioURL) {
            logDebug('No recording to download');
            return { success: false, error: 'No recording available' };
        }

        // Send message to offscreen document to download recording
        logDebug('Sending downloadRecording message to offscreen document');
        // Add type assertion for result
        const result: { success: boolean; error?: string } | undefined = await chrome.runtime.sendMessage({ 
            action: 'downloadRecording',
            data: { audioURL: recordingState.audioURL }
        });

        if (!result || !result.success) {
            throw new Error(result?.error || 'Failed to download recording');
        }

        logDebug('Download initiated via offscreen');
        return { success: true };
    } catch (error: any) { // Add type
        logDebug('Error downloading recording:', error);
        return { success: false, error: `Download error: ${error.message}` };
    }
}

// Save recording state to storage
export async function saveRecordingState(): Promise<void> { // Added export and return type
    const stateToSave: Partial<RecordingState> = { // Use Partial type for safety
        isRecording: recordingState.isRecording,
        startTime: recordingState.startTime,
        audioURL: recordingState.audioURL,
        useMicrophone: recordingState.useMicrophone,
        warning: recordingState.warning
    };

    return new Promise((resolve) => {
        chrome.storage.local.set({ recordingState: stateToSave }, () => {
            logDebug('Recording state saved to storage:', stateToSave);
            resolve(undefined); // Explicitly resolve with undefined
        });
    });
}

// Load recording state from storage
export async function loadRecordingState(): Promise<void> { // Added export and return type
    return new Promise(async (resolve) => {
        // Add type assertion for result
        chrome.storage.local.get('recordingState', async (result: { recordingState?: Partial<RecordingState> }) => { 
            if (result.recordingState) {
                logDebug('Loaded recording state from storage:', result.recordingState);

                // Restore properties safely
                recordingState.isRecording = result.recordingState.isRecording ?? false;
                recordingState.startTime = result.recordingState.startTime ?? 0;
                recordingState.audioURL = result.recordingState.audioURL ?? null;
                recordingState.useMicrophone = result.recordingState.useMicrophone ?? false;
                recordingState.warning = result.recordingState.warning ?? null;

                // Update badge based on recording state (Use imported functions)
                if (recordingState.isRecording) {
                    setRecordingBadge(); 
                } else {
                    clearRecordingBadge(); 
                }

                // Update context menu (Use imported function)
                await updateContextMenuItems(); 
            }

            resolve(undefined); // Explicitly resolve with undefined
        });
    });
}

// Notify popup about recording state change
export async function notifyRecordingStateChanged(): Promise<void> { // Added export and return type
    const stateToSend: Partial<RecordingState> = { // Use Partial type
        isRecording: recordingState.isRecording,
        startTime: recordingState.startTime,
        audioURL: recordingState.audioURL,
        error: recordingState.error,
        warning: recordingState.warning
    };
    logDebug('[Background] Sending recordingStateChanged notification with data:', stateToSend);
    try {
        await chrome.runtime.sendMessage({
            target: 'sidepanel', // Specify target ???
            action: 'recordingStateChanged',
            data: stateToSend
        }).catch((error: any) => { // Add type
            // This error is expected when no popup is open to receive the message
            if (!error.message?.includes('receiving end does not exist')) {
                logDebug('Error sending state change notification:', error);
            }
        });
        logDebug('Recording state change notification sent');
    } catch (error: any) { // Add type
        // This error is expected when no popup is open to receive the message
        if (!error.message?.includes('receiving end does not exist')) {
            logDebug('Error sending state change notification:', error);
        }
    }

    // Save state to storage
    await saveRecordingState();
}

// Get current recording state
export function getRecordingState(): RecordingState { // Added export and return type
    const state: RecordingState = { // Use full type
        isRecording: recordingState.isRecording,
        startTime: recordingState.startTime,
        audioURL: recordingState.audioURL,
        error: recordingState.error,
        warning: recordingState.warning,
        useMicrophone: recordingState.useMicrophone,
        offscreenReady: recordingState.offscreenReady // Include offscreenReady if needed by UI
    };

    logDebug('Returning recording state:', state);
    return state;
}

// Note: setRecordingBadge and clearRecordingBadge definitions were removed
// as they are assumed to be imported from chromeApiHandler.ts