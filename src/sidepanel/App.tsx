import React, { useState, useEffect, useCallback, useRef } from 'react';
import Settings from './components/Settings';
import LiveRecording from './components/LiveRecording';
import Recordings from './components/Recordings';
import PrepareCall from './components/PrepareCall';
import RecapView from './components/RecapView';
import { useExtensionMessaging } from './hooks/useExtensionMessaging';
import { useTranscription } from './hooks/useTranscription';

// SVG for Back Arrow
const BackArrowIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
    <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
  </svg>
);

// Type for Call Setup Data (can be moved)
interface CallSetupData {
  meetingTopic: string;
  hostName: string;
  guestName: string;
}

const App: React.FC = () => {
  // State variables
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [hasRecording, setHasRecording] = useState<boolean>(false);
  const [recordingStartTime, setRecordingStartTime] = useState<number | null>(null);
  const [micPermissionGranted, setMicPermissionGranted] = useState<boolean>(false);
  const [isMicEnabled, setIsMicEnabled] = useState<boolean>(false);
  const [isTabAudioEnabled, setIsTabAudioEnabled] = useState<boolean>(true);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<string>('inactive');
  const [timerValue, setTimerValue] = useState<string>('00:00');
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [hasApiKey, setHasApiKey] = useState<boolean>(false);
  const [selectedLanguage, setSelectedLanguage] = useState<string>('en');
  const [currentApiKey, setCurrentApiKey] = useState<string>(''); // Deepgram Key
  const [geminiApiKey, setGeminiApiKey] = useState<string>(''); // State for Gemini Key
  
  // Add state for debug info
  const [debugInfo, setDebugInfo] = useState<string | null>(null);
  
  // Add state to manage the current view
  type AppView = 'recordings' | 'setup' | 'live' | 'recap';
  const [currentView, setCurrentView] = useState<AppView>('recordings');

  // Add state to hold setup data
  const [callSetupData, setCallSetupData] = useState<CallSetupData | null>(null);
  
  // Add state for selected session ID
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  
  // Initialize the messaging hook
  const { pingOffscreenDocument } = useExtensionMessaging();
  // Get clearTranscript function from the hook
  const { clearTranscript } = useTranscription();

  // Check for API key and load initial audio source settings when component mounts
  useEffect(() => {
    console.log('Loading storage data...');
    chrome.storage.local.get([
      'deepgramApiKey',
      'geminiApiKey', // Load Gemini key
      'transcriptionLanguage', // Also load language here
      'microphonePermissionGranted', 
      'isMicEnabled', 
      'isTabAudioEnabled'
    ], (result) => {
      console.log('Storage data loaded:', {
        hasDeepgramKey: !!result.deepgramApiKey,
        hasGeminiKey: !!result.geminiApiKey,
        lang: result.transcriptionLanguage || 'en',
        micPermission: result.microphonePermissionGranted || false
      });

      const keyFromStorage = result.deepgramApiKey || '';
      const hasKey = !!keyFromStorage && keyFromStorage.trim() !== '';
      
      setCurrentApiKey(keyFromStorage); // Store the loaded key value
      setHasApiKey(hasKey); // Make sure to update hasApiKey state based on loaded key
      setGeminiApiKey(result.geminiApiKey || ''); // Set Gemini key state
      setSelectedLanguage(result.transcriptionLanguage || 'en'); // Set language state
      setMicPermissionGranted(result.microphonePermissionGranted || false);
      setIsMicEnabled(result.isMicEnabled || false);
      // Load tab audio setting, default to true if not found
      setIsTabAudioEnabled(result.isTabAudioEnabled !== undefined ? result.isTabAudioEnabled : true); 
      
      // If no DEEPGRAM API key is set, automatically open settings dialog
      if (!hasKey) {
        setIsSettingsOpen(true);
      }
    });
    
    // Initialize and setup the offscreen document when component mounts
    pingOffscreenDocument().then(result => {
      console.log('Initial offscreen ping result:', result);
      if (result.success) {
        setDebugInfo('✅ Offscreen document is ready and available');
      } else {
        setDebugInfo('⚠️ Offscreen document is not ready yet. Check console for details.');
        console.warn('Offscreen document initialization failed:', result.error);
      }
    }).catch(error => {
      console.error('Error during initial offscreen document setup:', error);
      setDebugInfo('❌ Error setting up offscreen document: ' + error.message);
    });
  }, []);

  // Request initial state when component mounts (keep this for recording state)
  useEffect(() => {
    const getInitialState = async () => {
      try {
        chrome.runtime.sendMessage({ action: 'getRecordingState' }, (response) => {
          if (chrome.runtime.lastError) {
            console.error("Error getting recording state:", chrome.runtime.lastError.message);
            return;
          }
          if (response) {
            setIsRecording(response.isRecording || false);
            setAudioUrl(response.audioUrl || null);
            // Assuming transcription state is handled by connection updates
            // setConnectionStatus(response.transcriptionState || 'inactive');
            
            if (response.isRecording) {
              setRecordingStartTime(response.startTime || Date.now());
            }
          }
        });
      } catch (error) {
        console.error('Error getting initial state:', error);
      }
    };

    getInitialState();
  }, []);

  // Set up listener for messages from background.js
  useEffect(() => {
    const messageHandler = (message: any) => {
      console.log('Message received in side panel:', message);
      
      switch (message.action) {
        case 'recordingStarted':
          setIsRecording(true);
          setRecordingStartTime(message.startTime || Date.now());
          setAudioUrl(null); // Clear previous audio URL
          clearTranscript(); // Clear transcript using the hook function
          break;
        case 'recordingStopped':
          setIsRecording(false);
          setRecordingStartTime(null);
          setAudioUrl(message.audioUrl || null);
          break;
        case 'recordingStateChanged': // Handle generic state updates
          setIsRecording(message.data.isRecording || false);
          const receivedUrl = message.data.audioURL || null;
          setAudioUrl(receivedUrl);
          console.log('[App recordingStateChanged] Setting audioUrl to:', receivedUrl);
          if (message.data.isRecording) {
            setRecordingStartTime(message.data.startTime || Date.now());
          } else {
            setRecordingStartTime(null);
          }
          break;
        case 'transcriptionConnectionUpdate':
          setConnectionStatus(message.data?.status || 'inactive');
          if (message.data?.status === 'apiKeyMissing' && !isSettingsOpen) {
             // Automatically open settings if API key is missing
             setIsSettingsOpen(true);
          }
          // Do NOT open settings for generic errors like connection failures
          break;
        case 'microphonePermissionChanged': // Listen for direct permission changes
          setMicPermissionGranted(message.granted || false);
          // If permission was just revoked, disable mic
          if (!message.granted) {
             setIsMicEnabled(false);
             chrome.storage.local.set({ isMicEnabled: false });
          }
          break;
        default:
          // console.log("Unhandled message action:", message.action);
          break;
      }
    };

    // Add message listener
    chrome.runtime.onMessage.addListener(messageHandler);

    // Cleanup listener when component unmounts
    return () => {
      chrome.runtime.onMessage.removeListener(messageHandler);
    };
  }, [isSettingsOpen]); // Add isSettingsOpen dependency for apiKeyMissing check

  // Set up timer for recording duration
  useEffect(() => {
    let timerInterval: number | undefined;
    
    if (isRecording && recordingStartTime) {
      // Update immediately
      updateTimer();
      
      // Set up interval for timer updates
      timerInterval = window.setInterval(updateTimer, 1000);
    }
    
    function updateTimer() {
      if (recordingStartTime) {
        const elapsedTime = Math.floor((Date.now() - recordingStartTime) / 1000);
        setElapsedSeconds(elapsedTime); // Store raw seconds
        
        const minutes = Math.floor(elapsedTime / 60).toString().padStart(2, '0');
        const seconds = (elapsedTime % 60).toString().padStart(2, '0');
        setTimerValue(`${minutes}:${seconds}`);
      }
    }
    
    return () => {
      if (timerInterval) {
        clearInterval(timerInterval);
      }
    };
  }, [isRecording, recordingStartTime]);

  // Handler functions for UI interactions
  const handleStartRecording = () => {
    // Basic check: ensure at least one audio source is selected
    if (!isMicEnabled && !isTabAudioEnabled) {
       alert("Please enable at least one audio source (Microphone or Tab Audio) in Settings.");
       setIsSettingsOpen(true); // Open settings to fix it
       return;
    }
    
    // Set recording state immediately for UI feedback
    setIsRecording(true);
    setRecordingStartTime(Date.now());
    
    console.log('[App] Sending startRecording message with options:', {
      useMicrophone: isMicEnabled && micPermissionGranted, 
      useTabAudio: isTabAudioEnabled
    });
    
    // Properly format message according to our protocol
    chrome.runtime.sendMessage({ 
      target: 'background',  // Add target field
      action: 'startRecording',
      useMicrophone: isMicEnabled && micPermissionGranted, // Only use mic if enabled AND permission granted
      useTabAudio: isTabAudioEnabled, // Pass tab audio setting
      data: {
        // Include any other necessary data
        deepgramApiKey: currentApiKey,
        language: selectedLanguage
      }
    }, (response) => {
      // Handle response
      console.log('[App] startRecording response:', response);
      if (response && !response.success) {
        // Handle failure
        console.error('Failed to start recording:', response.error);
        // Reset UI if the actual recording failed
        setIsRecording(false);
        setRecordingStartTime(null);
      }
    });
  };

  const handleStopRecording = () => {
    setIsRecording(false);
    setRecordingStartTime(null);
    // Don't reset timer display on stop - keep the last value for reference
    // setTimerValue('00:00'); 
    chrome.runtime.sendMessage({ action: 'stopRecording' });
  };

  const handleMicToggle = (enabled: boolean) => {
    setIsMicEnabled(enabled);
    // Save setting immediately
    chrome.storage.local.set({ isMicEnabled: enabled }); 
    // If enabling mic without permission, prompt
    if (enabled && !micPermissionGranted) {
       handleRequestMicPermission();
    }
  };
  
  // Handler for the new tab audio toggle
  const handleTabAudioToggle = (enabled: boolean) => {
     setIsTabAudioEnabled(enabled);
     // Save setting immediately
     chrome.storage.local.set({ isTabAudioEnabled: enabled });
  };

  const handleRequestMicPermission = () => {
    // Ensure settings is closed before showing permission prompt potentially
    if (isSettingsOpen) {
      setIsSettingsOpen(false);
    }
    // Small delay to allow settings UI to close if needed
    setTimeout(() => {
      chrome.runtime.sendMessage({ action: 'requestMicrophonePermission' });
    }, 100); 
  };

  const handleSettingsToggle = () => {
    // No need to check apiKeyChanged on close here anymore
    // handleSettingsSave takes care of detecting actual key changes
    setIsSettingsOpen(!isSettingsOpen);
  };

  // Save settings handler
  const handleSettingsSave = useCallback((
    newDeepgramApiKey: string,
    newGeminiApiKey: string, // Add gemini key param
    language: string
  ) => {
    console.log('Settings saved. Deepgram Key:', !!newDeepgramApiKey, 'Gemini Key:', !!newGeminiApiKey, 'Language:', language);

    const deepgramKeyActuallyChanged = newDeepgramApiKey !== currentApiKey;
    const geminiKeyActuallyChanged = newGeminiApiKey !== geminiApiKey;

    // Update states
    setCurrentApiKey(newDeepgramApiKey);
    setGeminiApiKey(newGeminiApiKey); // Update gemini key state
    setHasApiKey(!!newDeepgramApiKey && newDeepgramApiKey.trim() !== '');
    setSelectedLanguage(language);

    // --- Save keys to storage --- 
    const storageUpdate: { [key: string]: any } = {
      deepgramApiKey: newDeepgramApiKey,
      geminiApiKey: newGeminiApiKey, // Save gemini key
      selectedLanguage: language, // Save language
    };

    // --- Handle Deepgram key change logic ---
    if (deepgramKeyActuallyChanged) {
      console.log('Deepgram API key VALUE changed.');
    }
    // --- End Deepgram key logic ---

    if (geminiKeyActuallyChanged) {
      console.log('Gemini API key changed.');
      // Add any logic specific to Gemini key change if needed later
    }

    chrome.storage.local.set(storageUpdate, () => {
       if (chrome.runtime.lastError) {
            console.error("Error saving settings:", chrome.runtime.lastError);
       } else {
           console.log("Settings saved to local storage.");
           
           // Also update background for Deepgram if changed
           if (deepgramKeyActuallyChanged) {
                chrome.runtime.sendMessage({ 
                  action: 'updateDeepgramSettings',
                  apiKey: newDeepgramApiKey,
                  language
                });
           }
       }
    });

  }, [currentApiKey, geminiApiKey]); // Add geminiApiKey dependency

  // Handler for pinging the offscreen document
  const handlePingOffscreen = async () => {
    try {
      setDebugInfo('Setting up offscreen document...');
      const result = await pingOffscreenDocument();
      
      // Use only the available properties: success, message, error
      if (result.success) {
        setDebugInfo(`✅ Success! ${result.message || 'Offscreen document setup confirmed.'}`);
        console.log('Ping successful:', result);
      } else {
        setDebugInfo(`❌ Failed: ${result.error || 'Unknown error during offscreen setup'}`);
        console.error('Ping failed:', result);
      }
    } catch (error) {
      setDebugInfo(`⚠️ Error during setup attempt: ${error instanceof Error ? error.message : String(error)}`);
      console.error('Error pinging offscreen:', error);
    }
    
    // Clear the message after 30 seconds
    // setTimeout(() => {
    //   setDebugInfo(null);
    // }, 30000); // Keep commented out for now to see final status
  };

  // Navigation handler
  const navigateToLive = () => {
    setCurrentView('live');
  };

  const navigateToRecordings = () => {
    setCurrentView('recordings');
  };

  const navigateToSetup = () => {
    setCurrentView('setup');
  };

  const navigateToRecap = (sessionId: string) => {
    setSelectedSessionId(sessionId);
    setCurrentView('recap');
  };

  // Handler for when setup is complete
  const handleSetupComplete = (data: CallSetupData) => {
    console.log('[App] Setup Complete. Data:', data);
    setCallSetupData(data); // Keep state update for potential immediate use
    // Save to local storage
    chrome.storage.local.set({ currentCallSetupData: data }, () => {
      if (chrome.runtime.lastError) {
        console.error("Error saving call setup data:", chrome.runtime.lastError);
      } else {
        console.log('[App] Call setup data saved to local storage.');
        // Navigate only after data is potentially saved
        navigateToLive(); 
      }
    });
  };

  return (
    <div className="app-container">
      <div className="app-header">
        {/* Left side of header */}
        <div className="app-header-left">
          {currentView !== 'recordings' && (
            <button 
              className={`back-button ${isRecording ? 'disabled' : ''}`}
              onClick={navigateToRecordings}
              title={isRecording ? "Cannot navigate while recording" : "Back to Recordings"}
              disabled={isRecording}
            >
              <BackArrowIcon />
              Back
            </button>
          )}
           {/* Render title only when not showing back button, or adjust styling */}
          {currentView === 'recordings' && (
             <h1>CloseAssist</h1>
          )}
          {/* Or always show title and adjust flex properties */}
          {/* <h1>CloseAssist</h1> */}
        </div>

        {/* Right side of header (Settings Button) */}
        <button 
          className={`settings-icon-button ${isRecording ? 'disabled' : ''}`}
          onClick={handleSettingsToggle}
          title={isRecording ? "Cannot access settings while recording" : "Settings"}
          disabled={isRecording}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
            <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/>
          </svg>
        </button>
      </div>

      {isSettingsOpen ? ( 
        <Settings 
          isOpen={isSettingsOpen} 
          onClose={() => {
            setIsSettingsOpen(false);
          }}
          initialDeepgramApiKey={currentApiKey} // Pass initial values
          initialGeminiApiKey={geminiApiKey} // Pass initial Gemini key
          initialLanguage={selectedLanguage}
          onSave={(savedDeepgramKey, savedGeminiKey, savedLanguage) => { // Update signature
            handleSettingsSave(savedDeepgramKey, savedGeminiKey, savedLanguage); // Pass all values
            setIsSettingsOpen(false); // Close settings on save
          }}
          isMicEnabled={isMicEnabled}
          onToggleMic={handleMicToggle} // Pass handlers directly
          isTabAudioEnabled={isTabAudioEnabled}
          onToggleTabAudio={handleTabAudioToggle} // Pass handlers directly
        />
      ) : (
        <>
          {(() => {
            // Check if both API keys exist
            const deepgramKeyExists = hasApiKey || (currentApiKey && currentApiKey.trim() !== '');
            const geminiKeyExists = !!geminiApiKey && geminiApiKey.trim() !== '';
            const apiKeyExists = deepgramKeyExists && geminiKeyExists;
            
            if (apiKeyExists) {
              // Show Recordings or LiveRecording based on state
              if (currentView === 'live') {
                return (
                  <LiveRecording
                    isRecording={isRecording}
                    timerValue={timerValue}
                    elapsedSeconds={elapsedSeconds}
                    onStartRecording={handleStartRecording}
                    onStopRecording={handleStopRecording}
                    isMicEnabled={isMicEnabled}
                    isTabAudioEnabled={isTabAudioEnabled}
                    micPermissionGranted={micPermissionGranted}
                    onRequestMicPermission={handleRequestMicPermission}
                    audioUrl={audioUrl}
                    connectionStatus={connectionStatus}
                  />
                );
              } else if (currentView === 'setup') {
                return (
                  <PrepareCall 
                    onSetupComplete={handleSetupComplete}
                  />
                );
              } else if (currentView === 'recap') {
                return (
                  <RecapView 
                    sessionId={selectedSessionId}
                    onBack={navigateToRecordings}
                  />
                );
              } else { // currentView === 'recordings'
                return (
                  <Recordings 
                    onNavigateToSetup={navigateToSetup}
                    onNavigateToRecap={navigateToRecap}
                  />
                );
              }
            } else {
              // Show message prompting user to add API key if none exists
              return (
                <div className="no-api-key-message" style={{ padding: '20px' }}>
                  <h2>Welcome to CloseAssist</h2>
                  <p>Please set all required API keys in the settings to get started.</p>
                  <button
                    className="primary-button"
                    onClick={() => setIsSettingsOpen(true)}
                  >
                    Open Settings
                  </button>
                </div>
              );
            }
          })()}
        </>
      )}
    </div> 
  );
};

export default App;
