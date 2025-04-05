import React, { useRef, useState, useEffect } from 'react';
import TranscriptionView from './TranscriptionView';
import InsightsPanel from './InsightsPanel';

// BackArrowIcon component for the back button
const BackArrowIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
    <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
  </svg>
);

const DownloadIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
    <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
    <line x1="12" y1="19" x2="12" y2="23"></line>
    <line x1="8" y1="23" x2="16" y2="23"></line>
  </svg>
);

// Interface for the session data
interface RecordedSession {
  id: string;
  timestamp: number;
  audioUrl?: string;
  timerValue?: string;
  durationSeconds?: number;
  transcriptSegments: any[];
  insights: any;
  setupData: {
    meetingTopic: string;
    hostName: string;
    guestName: string;
  };
}

interface RecapViewProps {
  sessionId: string;
  onBack: () => void;
}

const RecapView: React.FC<RecapViewProps> = ({ sessionId, onBack }) => {
  const [session, setSession] = useState<RecordedSession | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const transcriptionContainerRef = useRef<HTMLDivElement>(null);

  // Load session data from local storage
  useEffect(() => {
    setLoading(true);
    
    // First try to find the session by ID from recordingSessions
    chrome.storage.local.get(['recordingSessions'], (result) => {
      if (chrome.runtime.lastError) {
        console.error("Error loading session data:", chrome.runtime.lastError);
        setLoading(false);
        return;
      }
      
      const sessions = result.recordingSessions || [];
      const foundSession = sessions.find((s: RecordedSession) => s.id === sessionId);
      
      if (foundSession) {
        console.log('[RecapView] Found session:', foundSession);
        
        // Check if duration needs to be fixed
        if (foundSession.timerValue && !isValidDuration(foundSession.timerValue)) {
          foundSession.timerValue = formatDuration(foundSession.timerValue);
          
          // Fix the session data in the stored sessions list
          const updatedSessions = sessions.map((s: RecordedSession) => 
            s.id === sessionId ? {...s, timerValue: foundSession.timerValue} : s
          );
          
          // Save the corrected data back to storage
          chrome.storage.local.set({ recordingSessions: updatedSessions }, () => {
            console.log('[RecapView] Fixed corrupted duration format');
          });
        }
        
        setSession(foundSession);
        setLoading(false);
      } else {
        console.error(`[RecapView] Session with ID ${sessionId} not found.`);
        setLoading(false);
      }
    });
  }, [sessionId]);

  // Helper function to validate duration format
  const isValidDuration = (durationStr: string): boolean => {
    const validFormat = /^\d{2}:\d{2}$/;
    return validFormat.test(durationStr);
  };

  // Function to download transcript and insights as JSON
  const handleDownloadData = () => {
    if (!session) {
      alert("No session data available to download.");
      return;
    }

    // Create the data object
    const downloadData = {
      sessionInfo: {
        id: session.id,
        timestamp: session.timestamp,
        durationSeconds: session.durationSeconds || 0, // Prefer durationSeconds
        formattedDuration: getFormattedDuration(), // Include formatted for display
        callWith: session.setupData?.guestName || "Unknown Guest",
        topic: session.setupData?.meetingTopic || "Untitled Meeting"
      },
      transcript: session.transcriptSegments.map(segment => ({
        speaker: segment.speakerId === 0 ? 
          (session.setupData?.hostName || "You") : 
          (session.setupData?.guestName || "Guest"),
        speakerId: segment.speakerId,
        text: segment.text,
        start_time: segment.start_time || null
        // isFinal property is intentionally excluded
      })),
      insights: session.insights || {}
    };

    // Convert to JSON string
    const jsonData = JSON.stringify(downloadData, null, 2);
    
    // Create download link
    const blob = new Blob([jsonData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    
    // Generate filename with date and guest name
    const date = new Date(session.timestamp).toISOString().split('T')[0];
    const guestName = (session.setupData?.guestName || "guest").replace(/\s+/g, '_').toLowerCase();
    a.download = `call_${date}_${guestName}.json`;
    
    a.href = url;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Handle insight click (for potential future implementation)
  const handleInsightClick = (insightId: string) => {
    console.log(`[RecapView] Insight clicked: ${insightId}`);
    // Future implementation to highlight or scroll to related transcript
  };

  // Format date from timestamp
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hour12: true
    }).format(date);
  };

  // Format seconds to MM:SS display format
  const formatDurationSeconds = (totalSeconds: number | undefined): string => {
    if (typeof totalSeconds !== 'number' || isNaN(totalSeconds)) {
      return "00:00";
    }
    
    // Ensure non-negative value
    totalSeconds = Math.max(0, totalSeconds);
    
    // Convert to minutes:seconds
    const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const seconds = Math.floor(totalSeconds % 60).toString().padStart(2, '0');
    
    return `${minutes}:${seconds}`;
  };

  // Get formatted duration for display
  const getFormattedDuration = (): string => {
    if (!session) return "00:00";
    
    // Prefer durationSeconds if available
    if (typeof session.durationSeconds === 'number') {
      return formatDurationSeconds(session.durationSeconds);
    }
    
    // Fall back to timerValue
    if (session.timerValue) {
      // If it matches MM:SS format, use directly
      if (/^\d{2}:\d{2}$/.test(session.timerValue)) {
        return session.timerValue;
      }
      
      // Try to parse and fix
      try {
        const num = parseInt(session.timerValue.replace(/[^\d]/g, ''), 10);
        if (!isNaN(num)) {
          const seconds = num > 1000000 ? Math.floor(num / 1000) : num;
          return formatDurationSeconds(seconds);
        }
      } catch (e) {
        console.error("Error parsing timer value:", e);
      }
    }
    
    return "00:00";
  };

  // Format and validate duration (keep for backward compatibility)
  const formatDuration = (durationStr: string | undefined): string => {
    if (!durationStr) return "00:00";
    
    // Check if it's already in valid MM:SS format
    const validFormat = /^\d{2}:\d{2}$/;
    if (validFormat.test(durationStr)) {
      return durationStr;
    }
    
    try {
      // Try to parse as a number (seconds or milliseconds)
      const num = parseInt(durationStr.replace(/[^\d]/g, ''), 10);
      if (isNaN(num)) return "00:00";
      
      // Determine if it's seconds or milliseconds based on size
      const seconds = num > 1000000 ? Math.floor(num / 1000) : num;
      
      // Cap at reasonable values (between 1 second and 2 hours)
      const cappedSeconds = Math.max(1, Math.min(seconds, 7200));
      
      // Format as MM:SS
      const minutes = Math.floor(cappedSeconds / 60).toString().padStart(2, '0');
      const secs = (cappedSeconds % 60).toString().padStart(2, '0');
      
      return `${minutes}:${secs}`;
    } catch (e) {
      console.error("Error formatting duration:", e);
      return "00:00";
    }
  };

  if (loading) {
    return <div className="loading-state">Loading recording data...</div>;
  }

  if (!session) {
    return (
      <div className="error-state">
        <h3>Error Loading Recording</h3>
        <p>Could not find the recording you requested.</p>
        <button className="primary-button" onClick={onBack}>
          Back to Recordings
        </button>
      </div>
    );
  }

  return (
    <div className="recap-view">
      {/* Header Section - Simplified with light gray background */}
      <div className="recap-header recap-header-simplified">
        <div className="recap-header-content">
          <h2>{session.setupData?.meetingTopic || "Untitled Meeting"}</h2>
          <div className="recap-meta">
            <span className="recap-date">{formatDate(session.timestamp)}</span>
            <span className="recap-duration">Duration: {getFormattedDuration()}</span>
            <span className="recap-participants">
              <strong>Host:</strong> {session.setupData?.hostName || "You"}{' | '}
              <strong>Guest:</strong> {session.setupData?.guestName || "Guest"}
            </span>
          </div>
        </div>
        <div className="recap-header-actions">
          <button
            className="download-button"
            onClick={handleDownloadData}
            title="Download transcript and insights as JSON"
          >
            <DownloadIcon />
            Download Recording
          </button>
        </div>
      </div>

      {/* Content Section - Split view like in LiveRecording */}
      <div className="live-recording-split">
        {/* Left Side: Transcription */}
        <div className="live-recording-left transcript-section">
          <TranscriptionView 
            segments={session.transcriptSegments} 
            containerRef={transcriptionContainerRef}
          />
        </div>

        {/* Right Side: Insights Panel */}
        <div className="live-recording-right">
          <InsightsPanel
            insights={session.insights}
            isLoading={false} // Never loading in recap
            error={null} // No errors in recap
            onInsightClick={handleInsightClick}
          />
        </div>
      </div>
    </div>
  );
};

export default RecapView; 