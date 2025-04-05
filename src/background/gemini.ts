import { GoogleGenerativeAI } from "@google/generative-ai";
import { logDebug } from './utils';
import type { CallSetupData, GeminiAnalysisResult, GeminiResponse } from './types';

// === Gemini Helper Functions ===
export function constructGeminiPrompt(transcriptText: string, callData: CallSetupData | null, isPartial: boolean = false): string {
  const topic = callData?.meetingTopic || 'Not specified';
  const host = callData?.hostName || 'Host';
  const guest = callData?.guestName || 'Guest';

  const partialNote = isPartial 
    ? "Note: This is a recent excerpt from an ongoing conversation. Focus on insights relevant to this specific segment, but consider it might lack earlier context."
    : "";

  const prompt = `
Analyze the following sales call transcript excerpt. The transcript includes speaker labels (e.g., "Speaker 0:", "Speaker 1:"). Assign Speaker 0 to the Host (${host}) and Speaker 1 to the Guest (${guest}).
${partialNote}

The meeting topic is: "${topic}"
The participants are: ${host} (Speaker 0) and ${guest} (Speaker 1).

Extract the following information, focusing primarily on what the Guest (Speaker 1) says:
- keywords: Salient terms or topics mentioned in the conversation (3-5 items).
- objections: Identify concerns, hesitations, or reasons the Guest (Speaker 1) might be reluctant to proceed. Focus ONLY on objections raised by the Guest. Briefly rephrase or summarize the core objection concisely (1-3 items). Example: If the guest says "just not now", rephrase as "Guest needs more time" or "Timing issue".
- pain_points: Problems, challenges, or frustrations mentioned specifically by the Guest (Speaker 1). Extract the core point concisely (1-3 items).
- action_items: Specific tasks or follow-ups mentioned for either the Host (Speaker 0) or the Guest (Speaker 1) (1-3 items). Include who the action item is for (e.g., "Host to send follow-up email").

For objections and pain_points, ONLY include those explicitly expressed by the Guest (Speaker 1). Do not infer objections or pain points from the Host's statements.

Respond ONLY with a valid JSON object adhering to this structure, using empty arrays if no items are found for a category:
{
  "keywords": ["string", ...],
  "objections": ["string", ...],
  "pain_points": ["string", ...],
  "action_items": ["string", ...]
}

Transcript Text (with speaker labels):
---
${transcriptText}
---
`;
  return prompt;
}

export async function analyzeTranscriptWithGemini(
  transcript: string,
  callData: CallSetupData | null,
  isPartial: boolean = false
): Promise<GeminiAnalysisResult> {
  logDebug('[Gemini] Received transcript for analysis:', transcript.substring(0, 100) + '...');
  logDebug('[Gemini] Call data for context:', callData);
  logDebug('[Gemini] Is partial transcript:', isPartial);

  try {
    const storageResult = await chrome.storage.local.get(['geminiApiKey']);
    const apiKey = storageResult.geminiApiKey;

    if (!apiKey) {
      logDebug('[Gemini] API Key not found in storage.');
      return { success: false, error: 'Gemini API Key not set in Settings.' };
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

    const prompt = constructGeminiPrompt(transcript, callData, isPartial);
    logDebug('[Gemini] Constructed Prompt.');

    logDebug('[Gemini] Sending request to API...');
    const result = await model.generateContent(prompt);
    const response = result.response;
    const responseText = response.text();
    logDebug('[Gemini] Raw Response Text:', responseText);

    // Use regex to extract JSON content between ```json and ```
    const jsonRegex = /```json\s*([\s\S]*?)\s*```/;
    const match = responseText.match(jsonRegex);
    
    if (!match || !match[1]) {
        logDebug('[Gemini] Failed to extract JSON block from response.', { rawText: responseText });
        return { success: false, error: `Failed to extract JSON block from Gemini response. Raw: ${responseText}` };
    }
    
    const extractedJsonString = match[1].trim();
    logDebug('[Gemini] Extracted JSON String:', extractedJsonString);

    try {
      const insights: GeminiResponse = JSON.parse(extractedJsonString);
      logDebug('[Gemini] Parsed Insights:', insights);
      if (insights && typeof insights.keywords === 'object' && typeof insights.objections === 'object' && typeof insights.pain_points === 'object' && typeof insights.action_items === 'object') {
        return { success: true, insights };
      } else {
        logDebug('[Gemini] Parsed JSON missing expected structure.', insights);
        return { success: false, error: `Gemini response missing expected structure. Raw: ${responseText}` };
      }
    } catch (parseError) {
      logDebug('[Gemini] Failed to parse JSON response:', parseError);
      logDebug('[Gemini] Cleaned JSON String was:', extractedJsonString);
      return { success: false, error: `Failed to parse Gemini response. Raw: ${responseText}` };
    }

  } catch (error: any) {
    logDebug('[Gemini] Error during analysis:', error);
    return { success: false, error: error.message || 'Unknown error during analysis.' };
  }
} 