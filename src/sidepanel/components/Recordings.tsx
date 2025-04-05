import React, { useState, useEffect } from 'react';

interface RecordingsProps {
  onNavigateToSetup: () => void;
  onNavigateToRecap: (sessionId: string) => void;
}

// Interface for a recorded session
interface RecordedSession {
  id: string;
  timestamp: number;
  audioUrl?: string; // Make audioUrl optional since we no longer store it
  // Support both old (timerValue string) and new (durationSeconds number) format
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

const Recordings: React.FC<RecordingsProps> = ({ 
  onNavigateToSetup,
  onNavigateToRecap
}) => {
  const [recordingSessions, setRecordingSessions] = useState<RecordedSession[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState<boolean>(false);

  // Load recordings from local storage
  useEffect(() => {
    setLoading(true);
    chrome.storage.local.get(['recordingSessions'], (result) => {
      if (chrome.runtime.lastError) {
        console.error("Error loading recording sessions:", chrome.runtime.lastError);
        setLoading(false);
        return;
      }
      
      const sessions = result.recordingSessions || [];
      console.log("[Recordings] Loaded sessions:", sessions);
      
      // Fix any corrupted duration values
      const fixedSessions = sessions.map(fixSessionDuration);
      
      // If any durations were fixed, save the updated sessions
      const needsUpdate = JSON.stringify(sessions) !== JSON.stringify(fixedSessions);
      if (needsUpdate) {
        console.log("[Recordings] Fixing corrupted duration values in storage");
        chrome.storage.local.set({ recordingSessions: fixedSessions }, () => {
          console.log("[Recordings] Fixed durations saved to storage");
        });
      }
      
      setRecordingSessions(fixedSessions);
      setLoading(false);
    });
  }, []);

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

  // Helper function to fix corrupted duration values
  const fixSessionDuration = (session: RecordedSession): RecordedSession => {
    // If we already have durationSeconds, no need to fix anything
    if (typeof session.durationSeconds === 'number') {
      return session;
    }
    
    // If no timerValue, set a default
    if (!session.timerValue) {
      return { 
        ...session, 
        durationSeconds: 0,
        timerValue: "00:00" 
      };
    }
    
    // Check if already in valid MM:SS format
    const validFormat = /^\d{2}:\d{2}$/;
    if (validFormat.test(session.timerValue)) {
      // Convert MM:SS to seconds and add durationSeconds
      const [minutes, seconds] = session.timerValue.split(':').map(part => parseInt(part, 10));
      const durationInSeconds = (minutes * 60) + seconds;
      return { 
        ...session, 
        durationSeconds: durationInSeconds
      };
    }
    
    // Fix the corrupted duration
    try {
      // Try to parse as a number (seconds or milliseconds)
      const num = parseInt(session.timerValue.replace(/[^\d]/g, ''), 10);
      if (isNaN(num)) {
        return { 
          ...session, 
          durationSeconds: 0,
          timerValue: "00:00" 
        };
      }
      
      // Determine if it's seconds or milliseconds based on size
      const seconds = num > 1000000 ? Math.floor(num / 1000) : num;
      
      // Cap at reasonable values (between 1 second and 2 hours)
      const cappedSeconds = Math.max(1, Math.min(seconds, 7200));
      
      return { 
        ...session, 
        durationSeconds: cappedSeconds,
        timerValue: formatDurationSeconds(cappedSeconds)
      };
    } catch (e) {
      console.error("Error fixing session duration:", e);
      return { 
        ...session, 
        durationSeconds: 0,
        timerValue: "00:00" 
      };
    }
  };

  // Helper function to format seconds to MM:SS
  const formatDurationSeconds = (totalSeconds: number): string => {
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

  // Handle clicking on view recap button
  const handleViewRecap = (sessionId: string) => {
    console.log(`[Recordings] Navigating to recap view for session: ${sessionId}`);
    // Save selected session ID to storage for faster access in the recap view
    chrome.storage.local.set({ selectedSessionId: sessionId }, () => {
      // Navigate to the recap view
      onNavigateToRecap(sessionId);
    });
  };

  // Get formatted duration string for display
  const getFormattedDuration = (session: RecordedSession): string => {
    // Prefer durationSeconds if available
    if (typeof session.durationSeconds === 'number') {
      return formatDurationSeconds(session.durationSeconds);
    }
    
    // Fall back to timerValue if present and valid
    if (session.timerValue && /^\d{2}:\d{2}$/.test(session.timerValue)) {
      return session.timerValue;
    }
    
    // Default value
    return "00:00";
  };

  // Handle downloading all recordings
  const handleDownloadAll = () => {
    if (recordingSessions.length === 0) {
      alert("No recordings to download.");
      return;
    }

    const allRecordings = {
      exportDate: new Date().toISOString(),
      recordings: recordingSessions.map(session => ({
        id: session.id,
        timestamp: session.timestamp,
        date: formatDate(session.timestamp),
        durationSeconds: session.durationSeconds || 0,
        formattedDuration: getFormattedDuration(session),
        meetingTopic: session.setupData?.meetingTopic || "Untitled Meeting",
        host: session.setupData?.hostName || "Host",
        guest: session.setupData?.guestName || "Guest",
        transcriptSegments: session.transcriptSegments.map(segment => ({
          speakerId: segment.speakerId,
          text: segment.text,
          start_time: segment.start_time
          // isFinal property is intentionally excluded
        })),
        insights: session.insights || {}
      }))
    };

    // Convert to JSON string
    const jsonData = JSON.stringify(allRecordings, null, 2);
    
    // Create download link
    const blob = new Blob([jsonData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    
    // Generate filename with date
    const date = new Date().toISOString().split('T')[0];
    a.download = `all_recordings_${date}.json`;
    
    a.href = url;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Handle deleting all recordings
  const handleDeleteAll = () => {
    setDeleteConfirmOpen(true);
  };

  // Confirm deletion of all recordings
  const confirmDeleteAll = () => {
    chrome.storage.local.set({ recordingSessions: [] }, () => {
      console.log("[Recordings] All recordings deleted");
      setRecordingSessions([]);
      setDeleteConfirmOpen(false);
    });
  };

  // Cancel deletion
  const cancelDelete = () => {
    setDeleteConfirmOpen(false);
  };

  return (
    <div className="recordings-view">
      <div className="recordings-header">
        <h2 className="page-title">Call History & Recordings</h2>
        <div className="recordings-actions">
          {recordingSessions.length > 0 && (
            <>
              <button 
                className="secondary-button" 
                onClick={handleDownloadAll}
                title="Download all recordings as JSON"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                Download All
              </button>
              <button 
                className="delete-button" 
                onClick={handleDeleteAll}
                title="Delete all recordings"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
                Delete All
              </button>
            </>
          )}
          <button 
            className="primary-button start-new-call-button" 
            onClick={onNavigateToSetup}
            title="Prepare and start a new call"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
              <line x1="12" y1="19" x2="12" y2="23"></line>
              <line x1="8" y1="23" x2="16" y2="23"></line>
            </svg>
            Start New Call
          </button>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      {deleteConfirmOpen && (
        <div className="delete-confirm-overlay">
          <div className="delete-confirm-dialog">
            <h3>Delete All Recordings?</h3>
            <p>This action cannot be undone. All recordings and their associated data will be permanently deleted.</p>
            <div className="delete-confirm-actions">
              <button onClick={cancelDelete} className="cancel-button">Cancel</button>
              <button onClick={confirmDeleteAll} className="confirm-delete-button">
                Yes, Delete All
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="loading-state">Loading recordings...</div>
      ) : recordingSessions.length === 0 ? (
        <div className="empty-state">
          <p>No recordings found. Start a new call to create your first recording.</p>
          <button 
            className="primary-button" 
            onClick={onNavigateToSetup}
            style={{ marginTop: '15px' }}
          >
            Start Your First Call
          </button>
        </div>
      ) : (
        <ul className="call-list">
          {recordingSessions.map((session) => (
            <li key={session.id} className="call-card">
              <div className="call-info">
                <p className="guest-name">{session.setupData?.guestName || "Unknown Guest"}</p>
                <p className="company-topic">{session.setupData?.meetingTopic || "Untitled Meeting"}</p>
                <p className="call-date">{formatDate(session.timestamp)}</p>
              </div>
              <div className="call-actions">
                <span className="duration">Duration: {getFormattedDuration(session)}</span>
                <button 
                  className="view-recap-button" 
                  onClick={() => handleViewRecap(session.id)}
                >
                  View Recap →
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default Recordings; 