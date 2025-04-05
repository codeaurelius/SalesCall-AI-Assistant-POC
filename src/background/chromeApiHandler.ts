// Functions directly interacting with Chrome APIs (offscreen, permissions, context menus, side panel, etc.)

import { logDebug, delay } from "./utils";
import { recordingState, transcriptionState, deepgramTestState } from "./state";
import type { RecordingState, TranscriptionState, DeepgramTestState, CallSetupData, GeminiAnalysisResult } from "./types";
import { 
    startRecording, 
    stopRecording, 
    downloadRecording, 
    getRecordingState, 
    saveRecordingState, 
    loadRecordingState, 
    notifyRecordingStateChanged, 
    toggleRecording 
} from "./recording";
import { 
    handleTranscriptionUpdate, 
    handleTranscriptionConnectionUpdate 
} from "./transcription";
import { analyzeTranscriptWithGemini } from "./gemini";

// === Exports for other modules ===

// Set badge to indicate recording in progress
export function setRecordingBadge(): void { // Added export
    chrome.action.setBadgeText({ text: "REC" });
    chrome.action.setBadgeBackgroundColor({ color: "#DD0000" });
    logDebug('Recording badge set');
}

// Clear badge when recording stops
export function clearRecordingBadge(): void { // Added export
    chrome.action.setBadgeText({ text: "" });
    logDebug('Recording badge cleared');
}

// Update context menu items based on recording state
export async function updateContextMenuItems(): Promise<void> { // Added export
    try {
        const title = recordingState.isRecording ? 'Stop Recording' : 'Quick Record (Tab Only)';
        // Use chrome.contextMenus.update, creating if it doesn't exist is handled by initialize
        await chrome.contextMenus.update('toggleRecording', { title: title });
        logDebug('Updated context menu item title:', title);
    } catch (error) {
        // This might fail if the menu hasn't been created yet, especially on first load.
        // The initialize function handles creation.
        logDebug('Error updating context menu (may be expected if not created yet):', error);
    }
}

// Set up the side panel
export async function setupSidePanel(): Promise<boolean> { 
    try {
        // Check if we can access the side panel API
        if (!chrome.sidePanel) {
            throw new Error('Side panel API not available');
        }

        // Instead of setOptions which might conflict with manifest,
        // just ensure the side panel is enabled for all windows
        await chrome.sidePanel.setOptions({
            enabled: true
        });
        
        // Verify side panel works by getting its state for current window
        const sidePanel = await chrome.sidePanel.getOptions({});
        logDebug('Side panel check completed:', { 
            enabled: sidePanel.enabled,
            path: sidePanel.path || 'default path from manifest' 
        });
        
        return true;
    } catch (error: any) {
        logDebug('Error setting up side panel:', error);
        throw error; 
    }
}

// Create or get offscreen document
export async function setupOffscreenDocument(): Promise<boolean> { // Added export
    const offscreenUrl = chrome.runtime.getURL('offscreen.html');
    logDebug('Attempting to set up offscreen document...');
  
    recordingState.offscreenReady = false;
  
    try {
        logDebug('Checking for existing offscreen contexts...');
        // Correct type usage
        const existingContexts = await chrome.runtime.getContexts({ 
            contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
            documentUrls: [offscreenUrl]
        });
  
        if (existingContexts && existingContexts.length > 0) { // Check if contexts array exists
            logDebug(`Found ${existingContexts.length} existing offscreen document(s). Waiting for ready signal...`);
            return await waitForOffscreenReady();
        }
  
        logDebug('No existing offscreen document found. Creating a new one...');
        // Correct type usage for Reason
        await chrome.offscreen.createDocument({ 
            url: offscreenUrl,
            reasons: [chrome.offscreen.Reason.USER_MEDIA], 
            justification: 'Record tab audio and handle transcriptions'
        });
        logDebug('New offscreen document creation initiated. Waiting for ready signal...');
      
        return await waitForOffscreenReady();
  
    } catch (error: any) { // Added type
        logDebug('Error during offscreen document setup:', error);
        if (error.message?.toLowerCase().includes('already has an active document')) {
            logDebug('Caught error indicating document already exists. Waiting for ready signal...');
            try {
                return await waitForOffscreenReady();
            } catch (waitError) {
                logDebug('Error waiting for ready signal after encountering existing document error:', waitError);
                throw waitError; 
            }
        }
        throw error; 
    }
}
  
// Wait for offscreen document to be ready (Internal helper, no export needed)
async function waitForOffscreenReady(): Promise<boolean> { 
    logDebug('Waiting for offscreenReady signal...');
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            logDebug('Timeout waiting for offscreen document ready signal.');
            reject(new Error('Timeout waiting for offscreen document to become ready'));
        }, 10000); 
        
        let checkCounter = 0;
        function checkReady() {
            checkCounter++;
            if (recordingState.offscreenReady) {
                logDebug(`Offscreen document signaled ready after ${checkCounter} checks.`);
                clearTimeout(timeout);
                resolve(true);
                return;
            }
            setTimeout(checkReady, 100); 
        }
        checkReady();
    });
}
  
// Get media stream ID for tab capture
export async function getTabCaptureMediaStreamId(tabId: number): Promise<string> { // Added export and type
    return new Promise((resolve, reject) => {
        try {
            chrome.tabCapture.getMediaStreamId(
                { targetTabId: tabId },
                (streamId) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                        return;
                    }
                    if (!streamId) { // Handle case where streamId is unexpectedly falsy
                         reject(new Error('Failed to get media stream ID, received null or empty value.'));
                         return;
                    }
                    resolve(streamId);
                }
            );
        } catch (error: any) { // Added type
            reject(error);
        }
    });
}

// === Message Listener ===

// Define message structure for clarity
interface BackgroundMessage {
    action: string;
    target?: string; // Optional target (e.g., 'offscreen', 'sidepanel')
    data?: any;      // Generic payload for simplicity, consider more specific types
    useMicrophone?: boolean; // For startRecording
    useTabAudio?: boolean;   // For startRecording
    tabId?: number;          // For startRecording
    payload?: any; // For analyzeTranscript
}

// Use correct signature for listener
chrome.runtime.onMessage.addListener((message: BackgroundMessage, sender: chrome.runtime.MessageSender, sendResponse: (response?: any) => void): boolean | undefined | Promise<any> => {
    logDebug(`Message received [Action: ${message?.action}]`, { message, sender });

    if (!message || typeof message !== 'object' || !message.action) {
        logDebug('Invalid message format received, ignoring.');
        // Return false for sync response indicating message won't be handled (or won't send response)
        return false; 
    }

    // --- Handle actions initiated FROM Offscreen Document --- 
    if (sender.url?.includes('offscreen.html')) {
        logDebug('Handling message from Offscreen Document...');
        switch (message.action) {
            case 'recordingResult':
                if (message.data && message.data.audioURL) {
                    logDebug('Received recording result from offscreen:', message.data);
                    recordingState.audioURL = message.data.audioURL;
                    logDebug('[Background] Updated recordingState.audioURL:', recordingState.audioURL);
                    notifyRecordingStateChanged(); // Use imported function
                }
                return false; // Synchronous
            
            case 'offscreenReady':
                logDebug('Offscreen document ready signal received');
                recordingState.offscreenReady = true;
                sendResponse({ success: true }); 
                return true; // Asynchronous 
    
            case 'recordingActuallyStarted':
                logDebug('[Background] Received confirmation: recordingActuallyStarted', message.data);
                if (!recordingState.isRecording) { 
                    recordingState.isRecording = true;
                    recordingState.startTime = message.data?.startTime || Date.now(); // Safely access startTime
                    recordingState.useMicrophone = message.data?.useMicrophone || false; // Safely access useMicrophone
                    recordingState.error = null; 
                    recordingState.warning = null;
                    
                    setRecordingBadge(); // Use imported function
                    updateContextMenuItems(); // Use imported function
                    saveRecordingState(); // Use imported function
                    
                    chrome.runtime.sendMessage({ action: 'recordingStarted' })
                        .catch(err => logDebug('Error sending recordingStarted to UI (expected if closed):', err));
                } else {
                    logDebug('[Background] Warning: Received recordingActuallyStarted but state was already recording.');
                }
                return false; // Synchronous (no response needed back to offscreen)
    
            case 'recordingStartFailed':
                logDebug('>>> [Background] Received confirmation: recordingStartFailed', message.data);
                recordingState.isRecording = false; 
                recordingState.error = message.data?.error || 'Offscreen document failed to start recording';
                chrome.runtime.sendMessage({ action: 'recordingStopped', data: { error: recordingState.error } })
                    .catch(err => logDebug('Error sending recordingStartFailed error to UI (expected if closed):', err));
                saveRecordingState(); // Use imported function
                return false; // Synchronous
    
            case 'recordingWarning':
                if (message.data && message.data.warning) {
                    logDebug('Recording warning received from offscreen:', message.data.warning);
                    recordingState.warning = message.data.warning;
                    notifyRecordingStateChanged(); // Use imported function
                }
                return false; // Synchronous
    
            case 'transcriptionUpdate':
                if (message.data) {
                    handleTranscriptionUpdate(message.data); // Use imported function
                }
                return false; // Synchronous
    
            case 'transcriptionConnectionUpdate':
                if (message.data) {
                    handleTranscriptionConnectionUpdate(message.data); // Use imported function
                }
                return false; // Synchronous
                
            case 'keepAlive':
                logDebug('Received keep-alive ping from offscreen.');
                return false; // Synchronous
    
            default:
                logDebug('Unrecognized action from Offscreen Document:', message.action);
                return false;
        }
    }
  
    // --- Handle actions initiated FROM UI (Sidepanel/Popup) --- 
    logDebug('Handling message from UI (Sidepanel/Popup)...');
    switch (message.action) {
        case 'startRecording':
            const startUseMic = message.useMicrophone ?? false;
            const startUseTab = message.useTabAudio ?? true; 
            const startTabId = message.tabId;
            
            // Extract deepgramApiKey and language from message.data if provided
            const messageApiKey = message.data?.deepgramApiKey;
            const messageLanguage = message.data?.language;
            
            logDebug('[BG Listener] Extracted start options:', { 
                startUseMic, 
                startUseTab, 
                startTabId,
                hasApiKey: !!messageApiKey,
                language: messageLanguage
            });
            
            // If API key was provided in the message, update storage
            if (messageApiKey) {
                chrome.storage.local.set({
                    deepgramApiKey: messageApiKey,
                    transcriptionLanguage: messageLanguage || 'en'
                }, () => {
                    logDebug('Updated Deepgram settings from startRecording message');
                });
            }
    
            // Return promise directly for async handling
            return startRecording(startUseMic, startUseTab, startTabId) 
                .then(result => { 
                    sendResponse(result); 
                })
                .catch(error => {
                     logDebug('Error during startRecording call:', error);
                     sendResponse({ success: false, error: error?.message || 'Unknown error starting recording' });
                });
            
        case 'stopRecording':
             // Return promise directly for async handling
            return stopRecording()
                .then(result => {
                    sendResponse(result);
                })
                .catch(error => {
                     logDebug('Error during stopRecording call:', error);
                     sendResponse({ success: false, error: error?.message || 'Unknown error stopping recording' });
                });
            
        case 'downloadRecording':
            // Return promise directly for async handling
            return downloadRecording()
                .then(result => {
                    sendResponse(result);
                })
                .catch(error => {
                     logDebug('Error during downloadRecording call:', error);
                     sendResponse({ success: false, error: error?.message || 'Unknown error downloading recording' });
                });
            
        case 'getRecordingState':
            sendResponse(getRecordingState()); // Use imported function
            return false; // Synchronous
            
        case 'requestMicrophonePermission':
             // Return promise directly for async handling
            return requestMicrophonePermissionViaOffscreen() // Use exported function 
                .then(result => {
                    sendResponse(result);
                })
                .catch(error => {
                     logDebug('Error during requestMicrophonePermission call:', error);
                     sendResponse({ success: false, error: error?.message || 'Unknown error requesting permission' });
                });
            
        case 'openSidePanel': 
            const tabIdToOpen = sender.tab?.id;
            if (tabIdToOpen) {
                // Correct API usage - requires windowId or uses current window if only tabId specified
                chrome.sidePanel.open({ tabId: tabIdToOpen }) 
                    .then(() => {
                        logDebug('Side panel opened for tab:', tabIdToOpen);
                        sendResponse({ success: true });
                    })
                    .catch((error: any) => {
                        logDebug('Error opening side panel:', error);
                        sendResponse({ success: false, error: error?.message || 'Unknown error opening side panel' });
                    });
                return true; // Asynchronous
            } else {
                logDebug('Sender tab ID not available for openSidePanel');
                sendResponse({ success: false, error: 'Sender tab ID not available' });
                return false; // Synchronous
            }
            
        case 'getTranscriptionState':
            sendResponse({
                status: transcriptionState.status,
                error: transcriptionState.error,
                segments: transcriptionState.segments,
                currentText: transcriptionState.currentText
            });
            return false; // Synchronous
            
        case 'updateDeepgramSettings':
            logDebug('Updating Deepgram settings:', { 
                apiKey: message.data?.apiKey ? 'Provided' : 'Not Provided', 
                language: message.data?.language 
            });
            chrome.storage.local.set({
                deepgramApiKey: message.data?.apiKey,
                transcriptionLanguage: message.data?.language
            }, () => { 
                logDebug('Deepgram settings saved locally.'); 
                // Forward to offscreen if ready (fire and forget)
                if (recordingState.offscreenReady) {
                    chrome.runtime.sendMessage({
                        // No target needed
                        action: 'updateDeepgramSettings',
                        data: message.data
                    }).catch(err => logDebug('Error forwarding settings update to offscreen (expected if not running):', err));
                }
                sendResponse({ success: true }); 
            });
            return true; // Asynchronous due to storage.local.set callback
    
        case 'setupOffscreenDocument': 
            logDebug('Handling setupOffscreenDocument request from UI...');
             // Return promise directly for async handling
            return setupOffscreenDocument()
                .then(success => {
                    logDebug(`Offscreen setup ${success ? 'successful' : 'failed'}`);
                    sendResponse({ success: success, error: success ? null : 'Failed to set up offscreen document' });
                })
                .catch((error: any) => {
                    logDebug('Error setting up offscreen document:', error);
                    sendResponse({ success: false, error: error.message });
                });
            
        // --- Handle Live Insights Analysis --- START
        case 'analyzeTranscript':
            // Explicitly type the payload for clarity
            const payload = message.payload as { 
              transcriptText: string; 
              callData: CallSetupData | null; 
              isPartial?: boolean; // Add isPartial flag
            } | undefined;
            
            if (!payload || !payload.transcriptText) {
                logDebug('❌ analyzeTranscript action received, but missing transcriptText in payload.');
                sendResponse({ success: false, error: 'Missing transcript text for analysis.' });
                return false; // Synchronous response
            }
            
            const { transcriptText, callData, isPartial = false } = payload; // Destructure isPartial
            logDebug('📥 Received analyzeTranscript action.', { 
                transcriptLength: transcriptText.length, 
                callData,
                isPartial, // Log isPartial
                transcriptSample: transcriptText.substring(0, 100) + '...',
                sender: sender.url || 'unknown source'
            });

            console.log('📊 [INSIGHTS DEBUG] Received analysis request:');
            console.log('- Transcript length:', transcriptText.length, 'characters');
            console.log('- First 50 chars:', transcriptText.substring(0, 50) + '...');
            console.log('- Call data topic:', callData?.meetingTopic);
            console.log('- Speaker count:', (transcriptText.match(/Speaker \d+:/g) || []).length);
            console.log('- Is partial transcript:', isPartial); // Log isPartial

            // Call the actual analysis function, passing isPartial
            analyzeTranscriptWithGemini(transcriptText, callData, isPartial) 
                .then((analysisResult: GeminiAnalysisResult) => {
                    logDebug('✅ [Background Listener] Gemini analysis complete.');
                    console.log('🎯 [INSIGHTS DEBUG] Analysis result:', 
                        analysisResult.success ? 'SUCCESS' : 'FAILED');
                    
                    if (analysisResult.success && analysisResult.insights) {
                        console.log('🔍 [INSIGHTS DEBUG] Insights received:', {
                            keywordCount: analysisResult.insights.keywords?.length || 0,
                            objectionCount: analysisResult.insights.objections?.length || 0,
                            painPointCount: analysisResult.insights.pain_points?.length || 0,
                            actionItemCount: analysisResult.insights.action_items?.length || 0
                        });
                    } else if (!analysisResult.success) {
                        console.error('❌ [INSIGHTS DEBUG] Analysis error:', analysisResult.error);
                    }
                    
                    // Send the result back to the sender (side panel)
                    sendResponse(analysisResult); 
                })
                .catch((error: any) => {
                    logDebug('❌ [Background Listener] CRITICAL Error during analyzeTranscriptWithGemini call:', error);
                    console.error('❌ [INSIGHTS DEBUG] Critical error:', error.message || 'Unknown error');
                    // Send an error response back
                    sendResponse({ 
                        success: false, 
                        error: `Background error during analysis: ${error.message || 'Unknown error'}` 
                    });
                });

            return true; // Indicate that the response will be sent asynchronously
        // --- Handle Live Insights Analysis --- END
            
        default:
            logDebug('Unrecognized action from UI or unknown source:', message.action);
            return false; // Synchronous (no response sent)
    }
});


// === Initialization ===
export async function initialize(): Promise<void> { // Added export
    try {
        logDebug('Initializing background script');
      
        // Use type assertion for storage result
        const storageResult = await new Promise<{ recordingState?: Partial<RecordingState> }>(resolve => {
            chrome.storage.local.get('recordingState', resolve);
        });
        const initialRecordingState = storageResult.recordingState;
        
        if (initialRecordingState?.isRecording) { // Check safely
            logDebug('Found interrupted recording session from previous browser session');
            
            // Reset the recording state in memory
            recordingState.isRecording = false;
            recordingState.startTime = 0;
            recordingState.audioURL = null;
            recordingState.error = 'Interrupted session';
            recordingState.warning = null;
            recordingState.offscreenReady = false;
            recordingState.useMicrophone = false;
            
            await saveRecordingState(); // Update storage
            
            try {
                await chrome.offscreen.closeDocument();
                logDebug('Closed offscreen document from previous session');
            } catch (error: any) { // Added type
                logDebug('No offscreen document to close or error closing:', error);
            }
        }
      
        // Set up side panel - more robust approach
        let sidePanelSuccess = false;
        try {
            sidePanelSuccess = await setupSidePanel();
            logDebug('Side panel setup completed successfully during init');
        } catch (error) {
            logDebug('Side panel setup failed during init, will retry with delay:', error);
            
            // Retry with increasing delays
            for (let attempt = 1; attempt <= 3 && !sidePanelSuccess; attempt++) {
                await delay(1000 * attempt); // Increase delay with each attempt
                try {
                    sidePanelSuccess = await setupSidePanel();
                    logDebug(`Side panel setup retry #${attempt} successful`);
                    break;
                } catch (retryError) {
                    logDebug(`Side panel setup retry #${attempt} failed:`, retryError);
                }
            }
            
            if (!sidePanelSuccess) {
                logDebug('All side panel setup attempts failed. Side panel may not be available.');
            }
        }
      
        await loadRecordingState(); // Load potentially cleaned state
      
        // No need to re-check recordingState.isRecording here, already handled above
      
        // Add action click handler to open the side panel
        chrome.action.onClicked.addListener((tab) => {
            if (!tab.id) {
                logDebug('Action clicked but tab ID is missing');
                return;
            }
            
            logDebug('Action clicked without popup, opening side panel...');
            chrome.sidePanel.open({ tabId: tab.id })
                .then(() => logDebug('Side panel opened via action click'))
                .catch((error) => logDebug('Error opening side panel via action click:', error));
        });
      
        // Context Menu Setup
        try {
            await chrome.contextMenus.removeAll();
            logDebug('Removed existing context menu items');
            
            await chrome.contextMenus.create({
                id: 'openSidePanel',
                title: 'Open CloseAssist',
                contexts: ['action']
            });
            
            await chrome.contextMenus.create({
                id: 'toggleRecording',
                // Initialize title based on loaded state
                title: recordingState.isRecording ? 'Stop Recording' : 'Quick Record (Tab Only)', 
                contexts: ['action']
            });
            
            await chrome.contextMenus.create({
                id: 'divider',
                type: 'separator',
                contexts: ['action']
            });
            
            chrome.contextMenus.onClicked.addListener((info, tab) => {
                const tabId = tab?.id;
                if (!tabId) {
                    logDebug('Context menu clicked but no tab ID found.');
                    return;
                }

                if (info.menuItemId === 'openSidePanel') {
                    chrome.sidePanel.open({ tabId: tabId })
                        .then(() => logDebug('Side panel opened from context menu'))
                        .catch((error: any) => logDebug('Error opening side panel from context menu:', error));
                } else if (info.menuItemId === 'toggleRecording') {
                    toggleRecording(tabId) // Use imported function
                        .then(result => {
                            if (!result.success) {
                                logDebug('Error toggling recording from context menu:', result.error);
                                // Optionally show a user-facing error?
                            }
                        })
                        .catch((error: any) => logDebug('Unhandled error in toggle recording from context menu:', error));
                }
            });
            logDebug('Context menu created successfully');
        } catch (error: any) { // Added type
            logDebug('Error creating context menu (not critical):', error);
        }
      
        logDebug('CloseAssist extension initialized successfully');
    } catch (error: any) { // Added type
        logDebug('CRITICAL Error initializing CloseAssist extension:', error);
        try {
            chrome.action.setBadgeText({ text: "ERR" });
            chrome.action.setBadgeBackgroundColor({ color: "#FF0000" });
            chrome.action.setTitle({ title: "CloseAssist - INIT ERROR: " + error.message });
        } catch (notificationError) {
            logDebug('Failed to show init error notification:', notificationError);
        }
    }
}

// === Permission Handling ===

// Define the expected response structure for permission requests
interface PermissionResultPayload {
    success: boolean; 
    error?: string; 
    permissionDenied?: boolean; 
    permissionDismissed?: boolean; 
}

// Export the main entry point.
export async function requestMicrophonePermissionViaOffscreen(): Promise<PermissionResultPayload> { 
    logDebug('Requesting microphone permission');
    try {
        return await requestMicrophonePermissionViaOffscreenDocument();
    } catch (error: any) { 
        logDebug('Error requesting microphone permission:', error);
        return { success: false, error: error.message };
    }
}

// Original method using offscreen document (Internal helper)
async function requestMicrophonePermissionViaOffscreenDocument(): Promise<PermissionResultPayload> {
    logDebug('Requesting microphone permission via offscreen document');
    try {
        const offscreenReady = await setupOffscreenDocument();
        if (!offscreenReady) {
            throw new Error('Failed to initialize offscreen document for permission request');
        }
        
        logDebug('Sending requestMicrophonePermission message to offscreen document');
        
        // Call sendMessage without the generic type, then assert the type of the result.
        const permissionResult = await chrome.runtime.sendMessage({ 
            action: 'requestMicrophonePermission' 
        }) as PermissionResultPayload | undefined; // Type assertion here
        
        if (permissionResult === undefined) {
            throw new Error('No response received from offscreen document for permission request.');
        }

        // Now permissionResult is typed as PermissionResultPayload
        if (!permissionResult.success) { 
            const errorMsg = permissionResult.error || 'Failed to request microphone permission via offscreen';
            const wasDenied = permissionResult.permissionDenied ?? errorMsg.includes('denied by user');
            const wasDismissed = permissionResult.permissionDismissed ?? errorMsg.includes('dismissed');
            
            if (wasDismissed) {
                logDebug('Microphone permission dialog was dismissed by user (via offscreen)', errorMsg);
                return { success: false, error: errorMsg, permissionDismissed: true, permissionDenied: false }; 
            } else if (wasDenied) {
                logDebug('Microphone permission explicitly denied by user (via offscreen)', errorMsg);
                return { success: false, error: errorMsg, permissionDenied: true, permissionDismissed: false }; 
            } else {
                 throw new Error(errorMsg);
            }
        }
        
        logDebug('Microphone permission granted successfully via offscreen');
        chrome.storage.local.set({ microphonePermissionGranted: true }, () => {
            logDebug('Microphone permission state saved to storage');
        });
        return { success: true }; 
    } catch (error: any) { 
        logDebug('Error in requestMicrophonePermissionViaOffscreenDocument:', error);
        return { 
             success: false, 
             error: error.message || 'Unknown error requesting permission via offscreen' 
        }; 
    }
}

// NOTE: requestMicrophonePermissionDirectly and requestMicrophonePermissionViaContentScript 
// are removed for simplification, assuming the offscreen method is sufficient for now.
// They can be added back later if needed.