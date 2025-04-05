import React, { useState, useEffect, useRef } from 'react';

// Define SVGs as constants for readability
const MicIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.49 6-3.31 6-6.72h-1.7z"/>
  </svg>
);

const StopIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M6 6H18V18H6V6Z" fill="currentColor"/>
  </svg>
);

const DownloadIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
    <polyline points="7 10 12 15 17 10"></polyline>
    <line x1="12" y1="15" x2="12" y2="3"></line>
  </svg>
);

interface ControlsProps {
  isRecording: boolean;
  isMicEnabled: boolean;
  isTabAudioEnabled: boolean;
  micPermissionGranted: boolean;
  onRequestMicPermission: () => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  hasTranscriptData?: boolean;
  onDownload?: () => void;
}

const Controls: React.FC<ControlsProps> = ({
  isRecording,
  isMicEnabled,
  isTabAudioEnabled,
  micPermissionGranted,
  onRequestMicPermission,
  onStartRecording,
  onStopRecording,
  hasTranscriptData = false,
  onDownload = () => {},
}) => {
  // Add state for confirmation and timeout
  const [pendingStop, setPendingStop] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const timerRef = useRef<number | null>(null);

  // Determine if recording is possible (at least one audio source is enabled)
  const canRecord = (isMicEnabled && micPermissionGranted) || isTabAudioEnabled;
  
  // Determine what message to show if recording is disabled
  const getRecordingDisabledMessage = () => {
    if (!isMicEnabled && !isTabAudioEnabled) {
      return 'Please enable at least one audio source in settings';
    }
    if (isMicEnabled && !micPermissionGranted) {
      return 'Microphone permission required';
    }
    return '';
  };

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
      }
    };
  }, []);

  // Update countdown and reset if isRecording changes
  useEffect(() => {
    if (!isRecording) {
      // Reset confirmation state if not recording
      setPendingStop(false);
      setCountdown(5);
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [isRecording]);

  // Handle stop button click
  const handleStopClick = () => {
    if (!pendingStop) {
      // First click - set pending state
      setPendingStop(true);
      setCountdown(5);
      
      // Start countdown
      timerRef.current = window.setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            // Reset when countdown reaches 0
            setPendingStop(false);
            clearInterval(timerRef.current!);
            timerRef.current = null;
            return 5;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      // Second click - confirm stop
      setPendingStop(false);
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      onStopRecording();
    }
  };

  // Determine title based on state
  const getButtonTitle = () => {
    if (isRecording) {
      return pendingStop ? 'Click again to confirm stopping' : 'Stop recording';
    }
    if (hasTranscriptData) {
      return 'Download transcript and insights as JSON';
    }
    if (!canRecord) {
      return getRecordingDisabledMessage();
    }
    return 'Start recording';
  };

  // Render the download button if we have transcript data and are not recording
  if (!isRecording && hasTranscriptData) {
    return (
      <div className="controls-header">
        <div className="record-buttons-container">
          <button
            className="download-button"
            onClick={onDownload}
            title="Download transcript and insights as JSON"
          >
            <DownloadIcon />
            Download Transcript & Insights
          </button>
        </div>
      </div>
    );
  }

  // Otherwise render the normal recording controls
  return (
    <div className="controls-header">
      <div className="record-buttons-container">
        <button
          className={`record-button ${isRecording ? (pendingStop ? 'stop-pending' : 'stop-active') : 'start-button'}`}
          onClick={isRecording ? handleStopClick : onStartRecording}
          disabled={!isRecording && !canRecord}
          title={getButtonTitle()}
        >
          {isRecording ? <StopIcon /> : <MicIcon />}
          {isRecording 
            ? (pendingStop 
               ? `Confirm Stop (${countdown}s)` 
               : 'Stop Recording') 
            : 'Start Recording'}
        </button>
      </div>
    </div>
  );
};

export default Controls;
