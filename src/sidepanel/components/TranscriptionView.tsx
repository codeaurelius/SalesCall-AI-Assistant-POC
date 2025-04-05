import React, { useEffect, useRef, RefObject } from 'react';

interface TranscriptSegment {
  speakerId: number;
  text: string;
  isFinal: boolean;
  timestamp?: number;
}

interface TranscriptionViewProps {
  segments: TranscriptSegment[];
  connectionStatus?: string;
  containerRef: RefObject<HTMLDivElement>;
}

const TranscriptionView: React.FC<TranscriptionViewProps> = ({
  segments,
  connectionStatus,
  containerRef
}) => {
  // Auto-scroll to bottom when new segments arrive
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [segments, containerRef]);

  // Get speaker label (A, B, C, etc.) based on speaker ID
  const getSpeakerLabel = (speakerId: number): string => {
    return String.fromCharCode(65 + (speakerId % 8)); // A-H
  };

  // Map connection status to a display name
  const getStatusDisplayName = (status: string): string => {
    switch (status) {
      case 'inactive': return 'Not connected';
      case 'apiKeyMissing': return 'Not connected (API key needed)';
      case 'connecting': return 'Connecting...';
      case 'connected': return 'Connected';
      case 'disconnected': return 'Disconnected';
      case 'error': return 'Connection error';
      default: return 'Unknown';
    }
  };

  return (
    <>
      <div className="transcription-header">
        <h3>Transcription</h3>
        {connectionStatus && (
          <div className="transcription-status">
            <div className={`status-indicator status-${connectionStatus}`}></div>
            <span>{getStatusDisplayName(connectionStatus)}</span>
          </div>
        )}
      </div>
      
      <div className="transcription-container" ref={containerRef}>
        {segments.length === 0 ? (
          <div className="empty-state transcription-empty-state">
            Transcription will appear here once you start recording...
          </div>
        ) : (
          segments.map((segment, index) => {
            const prevSegment = index > 0 ? segments[index - 1] : null;
            const showSpeakerLabel = !prevSegment || prevSegment.speakerId !== segment.speakerId;
            const isNewGroup = showSpeakerLabel;

            return (
              <div
                key={`${segment.speakerId}-${index}-${segment.isFinal ? 'final' : 'interim'}-${segment.text.length}`}
                className={`segment speaker-${segment.speakerId % 2} ${isNewGroup ? 'new-group' : ''} ${segment.isFinal ? '' : 'interim'}`}
                data-speaker={segment.speakerId}
              >
                {showSpeakerLabel && (
                   <span className={`badge speaker-badge-${segment.speakerId % 8}`}>
                     {getSpeakerLabel(segment.speakerId)}
                   </span>
                 )}
                <span className="transcript-text">{segment.text}</span>
              </div>
            );
          })
        )}
      </div>
    </>
  );
};

export default TranscriptionView;
