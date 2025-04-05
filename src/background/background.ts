import { logDebug } from "./utils";
import { initialize } from "./chromeApiHandler"; // Assuming initialize handles all setup

logDebug('Main background script loaded. Delegating message handling to chromeApiHandler.');

// Initialize the extension when the background script loads
initialize().catch(error => {
    console.error('Error during initialization:', error);
    // Store error in chrome.storage for potential diagnostics
    chrome.storage.local.set({ lastInitError: error.message || 'Unknown error' });
});

// Handle chrome extension update
chrome.runtime.onUpdateAvailable.addListener(details => {
    logDebug('Update available, details:', details);
});

// Listen for browser shutdown to clean up any active recording
chrome.runtime.onSuspend.addListener(() => {
    logDebug('Browser shutting down, cleaning up...');
    // No need to import stopRecordingIfActive as we can rely on utils
    // stopRecordingIfActive(); // Use imported utility
});

// Note: We're not adding an onMessage listener here anymore because it's
// already set up in chromeApiHandler.ts and we don't want to have duplicate
// handlers for the same actions.