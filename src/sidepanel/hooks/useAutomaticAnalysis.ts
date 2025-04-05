import { useState, useEffect, useCallback, useRef } from 'react';
// Import the core type directly
import type { TranscriptSegment } from '../../message-protocol'; 

// Assuming these are available from a shared types file
import type { CallSetupData, GeminiAnalysisResult, GeminiResponse } from '../../background/types';

// For logging - replace with your actual logger if needed
const logDebug = (...args: any[]) => console.log("[useAutomaticAnalysis]", ...args);

// Define limits per category
const MAX_KEYWORDS = 30;
const MAX_OBJECTIONS = 10;
const MAX_PAIN_POINTS = 10;
const MAX_ACTION_ITEMS = 10;

// Type for stored insights including timestamps
interface StoredInsight { 
  text: string;
  timestamp: number; // Timestamp (e.g., end time) of the last segment analyzed for this insight
}

// Update the internal state type to use StoredInsight
interface StoredInsightsState { 
  keywords: StoredInsight[];
  objections: StoredInsight[];
  pain_points: StoredInsight[];
  action_items: StoredInsight[];
}

// Helper function to merge insights, de-duplicate by text, and limit
const mergeAndLimitInsights = ( 
  currentInsights: StoredInsightsState | null, 
  newInsights: GeminiResponse,
  analysisEndTime: number // Timestamp for the new insights
): StoredInsightsState => {
  const merged: StoredInsightsState = { 
    keywords: [...(currentInsights?.keywords || [])], 
    objections: [...(currentInsights?.objections || [])], 
    pain_points: [...(currentInsights?.pain_points || [])], 
    action_items: [...(currentInsights?.action_items || [])]
  };

  // Function to add new items, ensuring uniqueness by text and limiting size
  const addUniqueItems = (
    currentList: StoredInsight[], 
    newListStrings: string[] | undefined,
    maxItems: number
  ): StoredInsight[] => {
    const safeNewList = newListStrings || [];
    // Map new strings to StoredInsight objects
    const newItems: StoredInsight[] = safeNewList.map(text => ({ text, timestamp: analysisEndTime }));
    
    // Combine, prioritizing new items
    const combined = [...newItems, ...currentList]; 
    
    // De-duplicate based on the text property
    const uniqueMap = new Map<string, StoredInsight>();
    combined.forEach(item => {
      if (!uniqueMap.has(item.text)) {
        uniqueMap.set(item.text, item);
      }
    });
    const unique = Array.from(uniqueMap.values());

    return unique.slice(0, maxItems); // Limit to max size
  };

  // Call addUniqueItems with the potentially undefined arrays from newInsights and specific limits
  merged.keywords = addUniqueItems(merged.keywords, newInsights.keywords, MAX_KEYWORDS);
  merged.objections = addUniqueItems(merged.objections, newInsights.objections, MAX_OBJECTIONS);
  merged.pain_points = addUniqueItems(merged.pain_points, newInsights.pain_points, MAX_PAIN_POINTS);
  merged.action_items = addUniqueItems(merged.action_items, newInsights.action_items, MAX_ACTION_ITEMS);

  logDebug('🔄 Merged insights:', { 
    newKeywordCount: newInsights.keywords?.length || 0,
    mergedKeywordCount: merged.keywords.length,
    newObjectionCount: newInsights.objections?.length || 0,
    mergedObjectionCount: merged.objections.length,
    newPainPointCount: newInsights.pain_points?.length || 0,
    mergedPainPointCount: merged.pain_points.length,
    newActionItemCount: newInsights.action_items?.length || 0,
    mergedActionItemCount: merged.action_items.length,
  });

  return merged;
};

interface UseAutomaticAnalysisProps {
  transcriptSegments: TranscriptSegment[];
  isRecording: boolean;
  isAnalyzing: boolean; // Prop to indicate if analysis is happening elsewhere (potentially)
  loadedSetupData: CallSetupData | null;
  autoAnalysisThreshold?: number; // Threshold for consecutive GUEST messages
  minSegmentsSinceLastAnalysis?: number;
  minConversationTurns?: number;
  debounceDelay?: number; // Delay in ms for debouncing triggers
  initialAutoAnalysisEnabled?: boolean;
}

interface UseAutomaticAnalysisResult {
  triggerAnalysis: (manual?: boolean) => void; // Add flag for manual trigger
  autoAnalysisEnabled: boolean;
  setAutoAnalysisEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  isAnalyzing: boolean; // State managed by the hook
  analysisError: string | null;
  // Update return type to match internal state
  geminiInsights: StoredInsightsState | null; 
}

export const useAutomaticAnalysis = ({
  transcriptSegments,
  isRecording,
  isAnalyzing: isAnalyzingProp, // Rename prop to avoid conflict
  loadedSetupData,
  autoAnalysisThreshold = 2, // Default to 2 consecutive GUEST messages
  minSegmentsSinceLastAnalysis = 5,
  minConversationTurns = 1, // Default to requiring only 1 turn
  debounceDelay = 1500, // Default debounce delay of 1.5 seconds
  initialAutoAnalysisEnabled = true
}: UseAutomaticAnalysisProps): UseAutomaticAnalysisResult => {
  // State for analysis - now stores accumulated StoredInsight objects
  const [geminiInsights, setGeminiInsights] = useState<StoredInsightsState | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [localIsAnalyzing, setLocalIsAnalyzing] = useState<boolean>(false); // Internal loading state

  // State for automatic analysis logic
  const [lastAnalyzedIndex, setLastAnalyzedIndex] = useState<number>(-1);
  const [consecutiveGuestMessageCount, setConsecutiveGuestMessageCount] = useState<number>(0);
  const [autoAnalysisEnabled, setAutoAnalysisEnabled] = useState<boolean>(initialAutoAnalysisEnabled);

  // Refs to hold latest values for stable callbacks
  const transcriptSegmentsRef = useRef(transcriptSegments);
  const loadedSetupDataRef = useRef(loadedSetupData);
  const lastAnalyzedIndexRef = useRef(lastAnalyzedIndex);
  const localIsAnalyzingRef = useRef(localIsAnalyzing);
  const autoAnalysisEnabledRef = useRef(autoAnalysisEnabled);
  const isRecordingRef = useRef(isRecording);

  // Ref for debounce timeout - Use number type for browser environments
  const debounceTimeoutRef = useRef<number | null>(null);

  // --- Update Refs --- 
  // Keep refs updated with the latest state/prop values
  useEffect(() => {
    transcriptSegmentsRef.current = transcriptSegments;
    loadedSetupDataRef.current = loadedSetupData;
    lastAnalyzedIndexRef.current = lastAnalyzedIndex;
    localIsAnalyzingRef.current = localIsAnalyzing;
    autoAnalysisEnabledRef.current = autoAnalysisEnabled;
    isRecordingRef.current = isRecording;
  }); // Run this effect on every render to capture latest values

  // --- Initialization & Cleanup --- 
  useEffect(() => {
    logDebug('🔵 Hook initialized/props updated:', {
      autoAnalysisEnabled,
      autoAnalysisThreshold,
      minSegmentsSinceLastAnalysis,
      minConversationTurns,
      debounceDelay,
      isRecording,
      isAnalyzingProp
    });
    // Cleanup timeout on unmount
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps 
  }, [autoAnalysisEnabled, autoAnalysisThreshold, minSegmentsSinceLastAnalysis, minConversationTurns, debounceDelay, isRecording, isAnalyzingProp]); // Re-log if props change

  // --- Core Analysis Function --- 
  // useCallback with empty dependency array, reads needed values from refs
  const triggerAnalysis = useCallback((manual = false) => {
    // Access latest values via refs
    const currentTranscriptSegments = transcriptSegmentsRef.current;
    const currentLoadedSetupData = loadedSetupDataRef.current;
    const currentLastAnalyzedIndex = lastAnalyzedIndexRef.current;

    // Clear any pending debounce timeout
    if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
        debounceTimeoutRef.current = null;
        logDebug('🚫 Debounce cancelled by triggerAnalysis call');
    }

    const triggerType = manual ? 'Manual' : 'Automatic';
    logDebug(`🔍 Triggering ${triggerType} Gemini analysis`);

    const finalSegments = currentTranscriptSegments.filter(s => s.isFinal);
    if (finalSegments.length === 0) {
      logDebug('❌ No final segments available to analyze.');
      // Use setAnalysisError directly since we are inside the hook
      setAnalysisError('No transcript text available to analyze.'); 
      return;
    }

    let segmentsToAnalyze: TranscriptSegment[];
    let analysisScope: string;
    let analysisEndTime = Date.now(); // Default timestamp

    if (manual || currentLastAnalyzedIndex === -1) {
      segmentsToAnalyze = finalSegments;
      analysisScope = 'Full Transcript';
      logDebug('📋 Analyzing full transcript');
    } else {
      const startIndex = currentLastAnalyzedIndex + 1;
      segmentsToAnalyze = finalSegments.slice(startIndex);
      analysisScope = `Segments ${startIndex}-${finalSegments.length - 1}`;
      logDebug(`📋 Analyzing new segments since index ${currentLastAnalyzedIndex}`);
      
      if (segmentsToAnalyze.length === 0) {
        logDebug('🤔 No new segments to analyze since last time, skipping.');
        return;
      }
    }
    
    if (segmentsToAnalyze.length > 0) {
      const lastSeg = segmentsToAnalyze[segmentsToAnalyze.length - 1];
      analysisEndTime = typeof lastSeg.timestamp === 'number' ? lastSeg.timestamp : Date.now(); 
    }

    logDebug(`📊 Analyzing ${segmentsToAnalyze.length} segments (${analysisScope}), end time: ${new Date(analysisEndTime).toLocaleTimeString()}`);

    if (!currentLoadedSetupData) {
      logDebug('❌ Call setup data not loaded yet, cannot analyze.');
      setAnalysisError('Call setup information not loaded.');
      return;
    }

    setLocalIsAnalyzing(true); // Set internal loading state
    setAnalysisError(null);
    
    const transcriptTextWithSpeakers = segmentsToAnalyze
      .map(s => `Speaker ${s.speakerId}: ${s.text}`)
      .join('\n');
      
    logDebug(`📝 Prepared transcript text for ${analysisScope} (${transcriptTextWithSpeakers.length} chars)`);
    logDebug('📤 Sending analyzeTranscript message to background');

    chrome.runtime.sendMessage<any, GeminiAnalysisResult>(
      {
        action: 'analyzeTranscript',
        payload: {
          transcriptText: transcriptTextWithSpeakers,
          callData: currentLoadedSetupData,
          isPartial: !manual && currentLastAnalyzedIndex !== -1 
        },
      },
      (response) => {
        setLocalIsAnalyzing(false); // Clear internal loading state
        if (chrome.runtime.lastError) {
          const errorMsg = `Error communicating with background: ${chrome.runtime.lastError.message}`;
          logDebug(`❌ ${errorMsg}`);
          setAnalysisError(errorMsg);
        } else if (response && response.success && response.insights) {
          logDebug('✅ Received successful analysis from background.');
          setGeminiInsights(prevInsights => 
            mergeAndLimitInsights(prevInsights, response.insights!, analysisEndTime)
          );
          setAnalysisError(null);
          
          if (!manual) {
             const newLastAnalyzedIndex = finalSegments.length - 1;
             logDebug(`📌 Setting last analyzed index after successful automatic analysis: ${newLastAnalyzedIndex}`);
             setLastAnalyzedIndex(newLastAnalyzedIndex); // Update state directly
             lastAnalyzedIndexRef.current = newLastAnalyzedIndex; // Also update ref
          }

        } else if (response && !response.success) {
          const errorMsg = `Analysis failed: ${response.error || 'Unknown error'}`;
          logDebug(`❌ ${errorMsg}`, response);
          setAnalysisError(errorMsg);
        } else {
          const errorMsg = 'Invalid or unexpected response received from background script.';
          logDebug(`❌ ${errorMsg}`, response);
          setAnalysisError(errorMsg);
        }
      }
    );
  }, []); // Empty dependency array - relies on refs for latest values

  // --- Debounced Trigger --- 
  // useCallback depends only on triggerAnalysis, which is now stable
  const debouncedTriggerAnalysis = useCallback(() => {
    logDebug(`⏳ Debounce delay ended. Triggering analysis.`);
    triggerAnalysis(false); 
  }, [triggerAnalysis]);

  // --- Conversation Turn Counter --- 
  const countConversationTurns = (segments: TranscriptSegment[]): number => {
    if (segments.length <= 1) return 0;
    let turns = 0;
    let lastSpeakerId = segments[0]?.speakerId ?? -1; // Handle potential empty array edge case
    for (let i = 1; i < segments.length; i++) {
      if (segments[i].speakerId !== lastSpeakerId) {
        turns++;
        lastSpeakerId = segments[i].speakerId;
      }
    }
    return turns;
  };

  // --- Main Effect for Trigger Logic --- 
  // Runs when transcriptSegments changes, or key boolean states change
  useEffect(() => {
    // Use refs for boolean checks inside the effect for stability
    const checkAutoAnalysisEnabled = autoAnalysisEnabledRef.current;
    const checkIsRecording = isRecordingRef.current;
    const checkIsAnalyzing = localIsAnalyzingRef.current;
    
    // Log with current state values
    logDebug('🔍 Checking auto-analysis conditions... [Hook State]', {
        autoAnalysisEnabled, isRecording, localIsAnalyzing 
    });
    // Log with ref values used for checks
    logDebug('🔍 Checking auto-analysis conditions... [Ref State]', {
        checkAutoAnalysisEnabled, checkIsRecording, checkIsAnalyzing
    });

    // --- Pre-checks --- 
    if (!checkAutoAnalysisEnabled || !checkIsRecording || checkIsAnalyzing) {
      if (!checkAutoAnalysisEnabled) logDebug('⏸️ Auto-analysis is disabled');
      if (!checkIsRecording) logDebug('⏹️ Not recording');
      if (checkIsAnalyzing) logDebug('⌛ Already analyzing');
       if (debounceTimeoutRef.current) {
          clearTimeout(debounceTimeoutRef.current);
          debounceTimeoutRef.current = null;
          logDebug('🚫 Debounce cancelled (pre-check failed)');
       }
      return;
    }
    
    const finalSegments = transcriptSegments.filter(s => s.isFinal);
    if (finalSegments.length === 0) {
      // logDebug('📝 No final segments'); // Reduce log noise
      return;
    }

    const currentIndex = finalSegments.length - 1;
    const currentLastAnalyzedIdx = lastAnalyzedIndexRef.current;

    if (currentIndex <= currentLastAnalyzedIdx) {
      // logDebug(`🔄 Latest segment already analyzed (index ${currentIndex} <= ${currentLastAnalyzedIdx})`); // Reduce log noise
      return;
    }

    const conversationTurns = countConversationTurns(finalSegments);
    if (conversationTurns < minConversationTurns) {
      logDebug(`⏱️ Not enough conversation turns yet (${conversationTurns}/${minConversationTurns})`);
      return;
    }
    
    const segmentsSinceLastAnalysis = currentLastAnalyzedIdx === -1 
      ? finalSegments.length 
      : currentIndex - currentLastAnalyzedIdx;
    if (currentLastAnalyzedIdx !== -1 && segmentsSinceLastAnalysis < minSegmentsSinceLastAnalysis) {
      logDebug(`⏳ Not enough new content since last analysis (${segmentsSinceLastAnalysis}/${minSegmentsSinceLastAnalysis})`);
      return;
    }
    
    // --- Trigger Logic --- 
    const latestSegment = finalSegments[currentIndex];
    const previousSegment = finalSegments[currentIndex - 1]; 

    let shouldDebounceTrigger = false;
    let triggerReason = '';
    
    if (latestSegment.speakerId === 1) { // GUEST
      // Use a temporary variable for calculation, then update state
      const newGuestCount = consecutiveGuestMessageCount + 1; 
      logDebug(`👤 Guest spoke: consecutive count now ${newGuestCount}`);
      setConsecutiveGuestMessageCount(newGuestCount);
      if (newGuestCount >= autoAnalysisThreshold) {
        shouldDebounceTrigger = true;
        triggerReason = `${newGuestCount} consecutive GUEST messages`;
        setConsecutiveGuestMessageCount(0); // Reset count state
      }
    } else { // HOST (Speaker 0 or other)
      const guestJustSpoke = previousSegment?.speakerId === 1;
      const guestCountBeforeHost = consecutiveGuestMessageCount;
      logDebug(`👥 Host spoke. Guest count reset. Guest just spoke: ${guestJustSpoke}`);
      // Reset guest count state only if the host spoke (latest segment is not guest)
      if (consecutiveGuestMessageCount > 0) { 
        setConsecutiveGuestMessageCount(0); 
      }
      
      if (guestJustSpoke) {
         shouldDebounceTrigger = true;
         triggerReason = `Host spoke after Guest (Guest count was ${guestCountBeforeHost})`;
      }
    }

    // --- Debounce Handling --- 
    if (shouldDebounceTrigger) {
        logDebug(`🎯 Potential Trigger: ${triggerReason}. Starting/Resetting debounce (${debounceDelay}ms)...`);
        if (debounceTimeoutRef.current) {
            clearTimeout(debounceTimeoutRef.current);
        }
        debounceTimeoutRef.current = window.setTimeout(debouncedTriggerAnalysis, debounceDelay);
    } else {
      // logDebug('🚫 No trigger conditions met this time.'); // Reduce log noise
    }
    
  // Watch relevant state and props that dictate *if* the logic should run
  // or define the conditions. Refs handle the values *inside* the stable callbacks.
  }, [ 
    transcriptSegments, // Re-run checks when transcript changes
    isRecording, 
    autoAnalysisEnabled, 
    minSegmentsSinceLastAnalysis, 
    autoAnalysisThreshold, 
    minConversationTurns, 
    debounceDelay, 
    debouncedTriggerAnalysis, // Stable callback
    consecutiveGuestMessageCount // Need current count for logic
  ]); 

  // --- Return Values --- 
  return {
    triggerAnalysis,
    autoAnalysisEnabled,
    setAutoAnalysisEnabled,
    isAnalyzing: localIsAnalyzing, // Return internal loading state
    analysisError,
    geminiInsights
  };
}; 