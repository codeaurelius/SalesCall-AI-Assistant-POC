import React, { useRef, useState, useEffect } from 'react';
import Controls from './Controls';
import TranscriptionView from './TranscriptionView';
import InsightsPanel from './InsightsPanel';
import { useTranscription } from '../hooks/useTranscription';
import { useAutomaticAnalysis } from '../hooks/useAutomaticAnalysis';

// Assuming these are available from a shared types file
import type { CallSetupData, GeminiAnalysisResult, GeminiResponse } from '../../background/types';

// For logging - replace with your actual logger if needed
const logDebug = (...args: any[]) => console.log("[LiveRecording]", ...args);

// Define props for LiveRecording
interface LiveRecordingProps {
  isRecording: boolean;
  timerValue: string;
  elapsedSeconds: number;
  onStartRecording: () => void;
  onStopRecording: () => void;
  isMicEnabled: boolean;
  isTabAudioEnabled: boolean;
  micPermissionGranted: boolean;
  onRequestMicPermission: () => void;
  audioUrl: string | null;
  connectionStatus: string;
}

const LiveRecording: React.FC<LiveRecordingProps> = ({
  isRecording,
  timerValue,
  elapsedSeconds,
  onStartRecording,
  onStopRecording,
  isMicEnabled,
  isTabAudioEnabled,
  micPermissionGranted,
  onRequestMicPermission,
  audioUrl,
  connectionStatus,
}) => {
  // Hook for transcription data
  const showInterimMessages = false;
  const { transcriptSegments } = useTranscription({
    showInterimMessages,
    enforceTwoSpeakers: true
  });

  // Add WebSocket connection status monitoring
  useEffect(() => {
    console.log('[LiveRecording] Connection status changed:', connectionStatus);
    
    const connectionStatusHandler = (event: any) => {
      if (event.action === 'transcriptionConnectionUpdate') {
        console.log('[LiveRecording] WebSocket connection update received:', event.data);
      }
    };
    
    chrome.runtime.onMessage.addListener(connectionStatusHandler);
    
    return () => {
      chrome.runtime.onMessage.removeListener(connectionStatusHandler);
    };
  }, [connectionStatus]);

  // --- State for loaded setup data --- START
  const [loadedSetupData, setLoadedSetupData] = useState<CallSetupData | null>(null);
  const [sessionId, setSessionId] = useState<string>('');
  // --- State for loaded setup data --- END

  // Use our custom hook for automatic analysis
  const {
    // triggerAnalysis, // Manual trigger no longer needed from UI
    // autoAnalysisEnabled, // No longer needed for UI toggle
    // setAutoAnalysisEnabled, // No longer needed for UI toggle
    isAnalyzing,
    analysisError,
    geminiInsights
  } = useAutomaticAnalysis({
    transcriptSegments,
    isRecording,
    isAnalyzing: false, // Initial value, will be managed by the hook
    loadedSetupData,
    autoAnalysisThreshold: 2, // Guest messages to trigger
    minSegmentsSinceLastAnalysis: 5, // Min new segments before re-triggering
    minConversationTurns: 1, // Min turns before any trigger
    debounceDelay: 1500, // Delay before triggering analysis (ms)
    initialAutoAnalysisEnabled: true, // Feature is now always enabled
  });

  // Log when transcript segments change
  useEffect(() => {
    if (transcriptSegments.length > 0) {
      logDebug(`🔄 Transcript updated: ${transcriptSegments.length} segments total, ${transcriptSegments.filter(s => s.isFinal).length} final`);
      
      const lastSegment = transcriptSegments[transcriptSegments.length - 1];
      if (lastSegment) {
        logDebug(`📝 Last segment: Speaker ${lastSegment.speakerId}, ID: ${lastSegment.id || 'none'}, Final: ${lastSegment.isFinal}, Text: "${lastSegment.text.substring(0, 30)}..."`);
      }
    }
  }, [transcriptSegments]);

  // Log when insights change
  useEffect(() => {
    if (geminiInsights) {
      logDebug(`✨ Insights updated:`, geminiInsights);
    }
  }, [geminiInsights]);

  // Save data to local storage when recording stops
  useEffect(() => {
    // Only save when we have transcript data and we've stopped recording
    if (!isRecording && transcriptSegments.length > 0 && loadedSetupData) {
      const timestamp = Date.now();
      const sessionId = `session_${timestamp}`;
      setSessionId(sessionId);
      
      // Use elapsed seconds directly from props
      console.log('[LiveRecording] Saving session with duration in seconds:', elapsedSeconds);
      
      // Create the session data - removed audioUrl from the stored data
      const sessionData = {
        id: sessionId,
        timestamp,
        // audioUrl removed intentionally
        durationSeconds: elapsedSeconds, // Store seconds directly from props
        transcriptSegments: transcriptSegments.filter(s => s.isFinal).map(segment => ({
          speakerId: segment.speakerId,
          text: segment.text,
          start_time: segment.start_time || null
          // isFinal property is intentionally excluded
        })),
        insights: geminiInsights,
        setupData: loadedSetupData
      };
      
      // Save to local storage
      chrome.storage.local.get(['recordingSessions'], (result) => {
        const existingSessions = result.recordingSessions || [];
        const updatedSessions = [sessionData, ...existingSessions];
        
        chrome.storage.local.set({ 
          recordingSessions: updatedSessions,
          currentSession: sessionData // Also save as current session for easy access
        }, () => {
          console.log('[LiveRecording] Session data saved to local storage:', sessionId);
        });
      });
    }
  }, [isRecording, transcriptSegments, geminiInsights, loadedSetupData, elapsedSeconds]);

  // Helper function to convert timer value (MM:SS) to seconds
  const convertTimerToSeconds = (timer: string): number => {
    if (!timer || typeof timer !== 'string') return 0;
    
    try {
      // Make sure it's in MM:SS format
      const validFormat = /^\d{2}:\d{2}$/;
      if (!validFormat.test(timer)) {
        // If not in proper format, try to extract numbers
        const digits = timer.replace(/\D/g, '');
        if (digits.length >= 4) {
          // If we have at least 4 digits, assume MM:SS
          const minutes = parseInt(digits.slice(0, 2), 10);
          const seconds = parseInt(digits.slice(2, 4), 10);
          return (minutes * 60) + seconds;
        }
        // If we have fewer digits, just use as is with a reasonable cap
        const num = parseInt(digits, 10);
        return Math.min(num, 7200); // Cap at 2 hours (7200 seconds)
      }
      
      // Parse properly formatted MM:SS
      const [minutes, seconds] = timer.split(':').map(part => parseInt(part, 10));
      return (minutes * 60) + seconds;
    } catch (error) {
      console.error('[LiveRecording] Error converting timer to seconds:', error);
      return 0;
    }
  };

  // Dummy handler for insight clicks (keep for potential future use)
  const handleInsightClick = (insightId: string) => {
    console.log(`[LiveRecording] Insight clicked: ${insightId}. Attempting scroll...`);
    if (transcriptionContainerRef.current) {
      const scrollHeight = transcriptionContainerRef.current.scrollHeight;
      const randomScroll = Math.random() * scrollHeight;
      transcriptionContainerRef.current.scrollTo({
        top: randomScroll,
        behavior: 'smooth'
      });
    } else {
      console.warn('[LiveRecording] Transcription container ref not found for scrolling.');
    }
  };

  // --- Load Setup Data from Storage --- START
  useEffect(() => {
    logDebug('Attempting to load call setup data from storage...');
    chrome.storage.local.get('currentCallSetupData', (result) => {
      if (chrome.runtime.lastError) {
        console.error("Error loading call setup data:", chrome.runtime.lastError);
      } else if (result.currentCallSetupData) {
        logDebug('Loaded call setup data from storage:', result.currentCallSetupData);
        setLoadedSetupData(result.currentCallSetupData);
      } else {
        logDebug('No call setup data found in storage. Using default mock data...');
        const mockCallData = {
          meetingTopic: "Sales Demo",
          hostName: "Sales Rep",
          guestName: "Prospect"
        };
        logDebug('Using mock call data:', mockCallData);
        setLoadedSetupData(mockCallData);
        // Optionally save mock data if needed for persistence during testing
        // chrome.storage.local.set({ currentCallSetupData: mockCallData });
      }
    });
  }, []); // Empty dependency array means run only on mount
  // --- Load Setup Data from Storage --- END

  // --- Log Setup Data --- START
  useEffect(() => {
    if (loadedSetupData) { // Use the state variable now
      console.log('[LiveRecording] Call setup data state updated:', loadedSetupData);
    }
  }, [loadedSetupData]); // Depend on the state variable
  // --- Log Setup Data --- END

  // Function to download transcript and insights as JSON
  const handleDownloadData = () => {
    if (transcriptSegments.length === 0) {
      alert("No transcript data available to download.");
      return;
    }

    // Create the data object
    const downloadData = {
      sessionInfo: {
        id: sessionId || `session_${Date.now()}`,
        timestamp: Date.now(),
        durationSeconds: elapsedSeconds, // Use elapsed seconds from props
        formattedDuration: timerValue, // Keep formatted string for display
        callWith: loadedSetupData?.guestName || "Unknown Guest",
        topic: loadedSetupData?.meetingTopic || "Untitled Meeting"
      },
      transcript: transcriptSegments.filter(s => s.isFinal).map(segment => ({
        speaker: segment.speakerId === 0 ? 
          (loadedSetupData?.hostName || "You") : 
          (loadedSetupData?.guestName || "Guest"),
        speakerId: segment.speakerId,
        text: segment.text,
        start_time: segment.start_time || Date.now()
      })),
      insights: geminiInsights || {}
    };

    // Convert to JSON string
    const jsonData = JSON.stringify(downloadData, null, 2);
    
    // Create download link
    const blob = new Blob([jsonData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    
    // Generate filename with date and guest name
    const date = new Date().toISOString().split('T')[0];
    const guestName = (loadedSetupData?.guestName || "guest").replace(/\s+/g, '_').toLowerCase();
    a.download = `call_${date}_${guestName}.json`;
    
    a.href = url;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Local state/logic for display
  const transcriptionContainerRef = useRef<HTMLDivElement>(null);
  // Always render TranscriptionView, let it handle its empty state
  const showTranscriptionView = true; 
  const segmentsToDisplay = showInterimMessages 
    ? transcriptSegments 
    : transcriptSegments.filter(s => s.isFinal);

  return (
    <div className="live-recording-container">
      {/* Header for Call Info & Controls */}
      <div className="live-call-header">
        <div className="call-participant-info">
          {loadedSetupData?.guestName ? (
            <span>Call with: <strong>{loadedSetupData.guestName}</strong></span>
          ) : (
            <span>Live Call</span>
          )}
        </div>
        {/* Always show timer regardless of recording state */}
        <div className="timer-display live-timer-display">
          {isRecording && <span className="record-dot"></span>}
          <span>{timerValue}</span>
        </div>
        <Controls
          isRecording={isRecording}
          onStartRecording={onStartRecording}
          onStopRecording={onStopRecording}
          isMicEnabled={isMicEnabled}
          isTabAudioEnabled={isTabAudioEnabled}
          micPermissionGranted={micPermissionGranted}
          onRequestMicPermission={onRequestMicPermission}
          hasTranscriptData={!isRecording && transcriptSegments.length > 0}
          onDownload={handleDownloadData}
        />
      </div>

      {/* Split view for Transcript and Insights */}
      <div className="live-recording-split"> 
        {/* Left Side: Transcription */}
        <div className="live-recording-left transcript-section">
          {/* Always render TranscriptionView now */}
          <TranscriptionView 
            segments={segmentsToDisplay} 
            connectionStatus={connectionStatus}
            containerRef={transcriptionContainerRef}
          />
        </div>

        {/* Right Side: Insights Panel */}
        <div className="live-recording-right">
          <InsightsPanel
            insights={geminiInsights}
            isLoading={isAnalyzing}
            error={analysisError}
            onInsightClick={handleInsightClick}
            // onTriggerAnalysis prop removed
          />
        </div>
      </div>
    </div>
  );
};

export default LiveRecording; 