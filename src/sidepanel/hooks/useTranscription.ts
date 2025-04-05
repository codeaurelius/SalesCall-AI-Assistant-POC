import { useState, useEffect } from 'react';

// TODO: Move to a shared types file
export interface TranscriptSegment {
  speakerId: number;
  start_time?: number;
  text: string;
  id?: string;
  isFinal: boolean;
  word?: string;
  speaker?: string;
}

interface UseTranscriptionOptions {
  showInterimMessages?: boolean; // Default to false if not provided
  enforceTwoSpeakers?: boolean; // Default to true
}

export const useTranscription = (options?: UseTranscriptionOptions) => {
  const [transcriptSegments, setTranscriptSegments] = useState<TranscriptSegment[]>([]);
  const showInterim = options?.showInterimMessages ?? false;
  const enforceTwoSpeakers = options?.enforceTwoSpeakers ?? true; // Default to true

  useEffect(() => {
    const messageHandler = (message: any) => {
      if (message.action === 'transcriptionUpdate') {
        // console.log('[useTranscription] Received transcriptionUpdate:', message.data); // Keep commented unless debugging
        if (message.data && Array.isArray(message.data.segments) && message.data.segments.length > 0) {
          setTranscriptSegments((prevSegments) => {
            let finalSegments = prevSegments.filter(s => s.isFinal);
            let currentInterimSegments = prevSegments.filter(s => !s.isFinal);

            const incomingIsFinal = message.data.isFinal;
            let incomingSegments: TranscriptSegment[] = message.data.segments; 

            // --- Speaker ID Enforcement --- START
            if (enforceTwoSpeakers) {
              incomingSegments = incomingSegments.map(seg => ({
                ...seg,
                speakerId: seg.speakerId % 2 // Force speaker ID to 0 or 1
              }));
            }
            // --- Speaker ID Enforcement --- END

            if (incomingIsFinal) {
              currentInterimSegments = []; // Clear previous interim on final
              incomingSegments.forEach(finalSeg => {
                if (!finalSegments.some(existing => existing.text === finalSeg.text && existing.speakerId === finalSeg.speakerId)) {
                   finalSegments.push({ ...finalSeg, isFinal: true });
                }
              });
              // console.log(`[useTranscription] Processed FINAL update.`);
            } else {
               // Replace previous interim with new ones if showing interim is enabled
              if (showInterim) {
                 currentInterimSegments = incomingSegments.map(interimSeg => ({ ...interimSeg, isFinal: false }));
                 // console.log(`[useTranscription] Processed INTERIM update.`);
              } else {
                 // If not showing interim, we don't need to store them
                 currentInterimSegments = [];
              }
            }

            const updatedSegments = [...finalSegments, ...currentInterimSegments];
            // Optional: Sort by start_time if available
            // updatedSegments.sort((a, b) => (a.start_time ?? Infinity) - (b.start_time ?? Infinity));
            // console.log('[useTranscription] New transcriptSegments state:', updatedSegments);
            return updatedSegments;
          });
        }
      }
      // Add handling for other relevant messages if needed in the future
    };

    chrome.runtime.onMessage.addListener(messageHandler);

    // Cleanup listener
    return () => {
      chrome.runtime.onMessage.removeListener(messageHandler);
    };
  }, [showInterim, enforceTwoSpeakers]); // Re-run effect if showInterim or enforceTwoSpeakers changes

  const clearTranscript = () => {
    console.log('[useTranscription] Clearing transcript.');
    setTranscriptSegments([]);
  };

  return { transcriptSegments, clearTranscript };
}; 