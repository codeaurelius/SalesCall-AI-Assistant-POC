// Mock WebSocket switch for debugging
const MOCK_WEBSOCKET_CONNECTION = false;

// Recording state
let recordingState = {
  isRecording: false,
  tabStream: null,
  micStream: null,
  mixedStream: null,
  mediaRecorder: null,
  audioChunks: [],
  audioBlob: null,
  audioURL: null,
  audioContext: null,
  stopResolve: null, // For resolving the stop promise
  transcriptionEnabled: false, // Track if transcription is enabled
  transcriptionConnected: false, // Track if connected to Deepgram
  transcriptionLanguage: 'en' // Track transcription language
};

// Log for debugging
function logDebug(message, data = null) {
  // Temporarily disable less critical logs for cleaner debugging
  const disabledMessages = [
    'Offscreen document script loaded',
    'Received message in offscreen document:', // Keep errors though
    'Received hello message from sidepanel:',
    'HELLO MESSAGE RECEIVED IN OFFSCREEN DOCUMENT',
    'KEEPING OFFSCREEN DOCUMENT ACTIVE',
    'Error sending hello response',
    'Sent keep-alive ping',
    'Started keep-alive interval',
    'Stopped keep-alive interval',
    'Creating media stream from stream ID',
    'Tab media stream created successfully',
    'Getting microphone stream',
    'Microphone stream created successfully',
    'Mixing tab and microphone streams',
    'Connected tab audio to recording destination and audio output',
    'Connected microphone audio to recording destination',
    'Created mixed audio stream',
    'Created new AudioContext',
    'Connected stream to audio output',
    'Using tab stream for recording',
    'Using mixed stream for recording',
    'Error sending warning:',
    'Error sending connecting status:',
    'Error sending final connected status:',
    'Error sending disconnection status update:',
    'Error sending API key missing status:',
    'Error sending connection error status:',
    'Recorded chunk of size:', // Too noisy
    'Converting Blob to ArrayBuffer for Deepgram',
    'Sent ArrayBuffer to Deepgram, size:',
    'Sent data directly to Deepgram',
    'MediaRecorder stopped', // Keep the onstop handler start log
    'Blob created.',
    'Object URL created:',
    'Stopping media stream tracks...',
    '- Stopped tab track:',
    '- Stopped mic track:',
    '- Stopped mixed track:',
    'Media stream tracks stopped.',
    'Closing AudioContext...',
    'Audio context closed successfully.',
    'No AudioContext to close.',
    'Sending recordingResult message to background...',
    'recordingResult message sent successfully.',
    'Error sending recording result:', // Keep critical errors
    'Resolving stopPromise...',
    'stopPromise resolved.',
    'Set recordingState.isRecording to false.'
    // Can add more messages to disable here
  ];

  // Special cases for error checking
  if (message.includes('Error handling message') || 
      message.includes('Error sending response')) {
      // Keep these logs
  } else if (disabledMessages.some(disabled => message.includes(disabled))) {
    return; // Skip logging this message
  }

  const logMessage = `[Offscreen] ${message}`;
  if (data) {
    console.log(logMessage, data);
  } else {
    console.log(logMessage);
  }
}

// Delay function 
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Create a user media stream from a tab capture stream ID
async function createMediaStreamFromTab(streamId) {
  try {
    logDebug('Creating media stream from stream ID:', streamId);
    
    // Create constraints with the stream ID
    const constraints = {
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: streamId,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      },
      video: false
    };
    
    // Get user media with the constraints
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    logDebug('Tab media stream created successfully');
    
    // Connect to audio output to ensure playback continues during recording
    connectStreamToAudioOutput(stream);
    
    return stream;
  } catch (error) {
    logDebug('Error creating tab media stream:', error);
    throw error;
  }
}

// Get microphone stream
async function getMicrophoneStream() {
  try {
    logDebug('Getting microphone stream');
    
    // Skip permission check that's causing errors and go straight to requesting access
    logDebug('Requesting microphone access directly');
    
    // Request with specific constraints
    const stream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        echoCancellation: { exact: false },
        noiseSuppression: true,
        autoGainControl: true
      }
    });
    
    logDebug('Microphone stream created successfully');
    return stream;
  } catch (err) {
    logDebug('Error accessing microphone:', err);
    
    // Check for permission errors
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      throw new Error('Permission dismissed: Microphone access was denied');
    } else if (err.name === 'NotFoundError') {
      throw new Error('No microphone found. Please connect a microphone and try again.');
    } else {
      throw new Error(`Error accessing microphone: ${err.message}`);
    }
  }
}

// Mix microphone and tab audio streams
function mixAudioStreams(tabStream, micStream) {
  try {
    logDebug('Mixing tab and microphone streams');
    
    // Create audio context
    const audioContext = new AudioContext();
    recordingState.audioContext = audioContext;
    
    // Create media stream destination
    const destination = audioContext.createMediaStreamDestination();
    
    // Handle tab audio
    if (tabStream) {
      // Create source for tab stream
      const tabSource = audioContext.createMediaStreamSource(tabStream);
      
      // Connect tab audio to destination for recording
      tabSource.connect(destination);
      
      // Also connect tab audio to output for listening
      tabSource.connect(audioContext.destination);
      logDebug('Connected tab audio to recording destination and audio output');
    }
    
    // Handle microphone audio with gain control (similar to the provided snippet)
    if (micStream) {
      // Create source for microphone stream
      const micSource = audioContext.createMediaStreamSource(micStream);
      
      // Create gain node to boost microphone volume
      const micGain = audioContext.createGain();
      // Set gain to make microphone more prominent in the mix
      micGain.gain.value = 2.0;
      
      // Connect microphone through gain to destination
      micSource.connect(micGain);
      micGain.connect(destination);
      
      logDebug('Connected microphone audio to recording destination with gain:', micGain.gain.value);
    }
    
    // Return mixed stream
    const mixedStream = destination.stream;
    logDebug('Created mixed audio stream');
    
    return mixedStream;
  } catch (error) {
    logDebug('Error mixing audio streams:', error);
    throw error;
  }
}

// Connect stream to audio output to ensure playback continues during recording
function connectStreamToAudioOutput(stream) {
  try {
    // Create audio context if needed
    if (!recordingState.audioContext) {
      recordingState.audioContext = new AudioContext();
      logDebug('Created new AudioContext');
    }
    
    // Create a source node from the stream
    const source = recordingState.audioContext.createMediaStreamSource(stream);
    
    // Connect the source to the destination (speakers)
    source.connect(recordingState.audioContext.destination);
    
    logDebug('Connected stream to audio output');
  } catch (error) {
    logDebug('Error connecting stream to audio output:', error);
  }
}

// Connect to Deepgram for transcription
async function connectToDeepgramForTranscription(apiKey, language = 'en') {
  logDebug('[connectToDeepgram] Attempting connection...');
  logDebug('[connectToDeepgram] Checking window.deepgramAPI:', typeof window.deepgramAPI);
  logDebug('[connectToDeepgram] Received API Key:', apiKey ? 'Exists' : 'Missing');
  logDebug('[connectToDeepgram] Received Language:', language);
  
  // Debug Deepgram API object
  if (window.deepgramAPI) {
    logDebug('[connectToDeepgram] deepgramAPI methods available:', 
      Object.keys(window.deepgramAPI).join(', '));
  } else {
    logDebug('[connectToDeepgram] deepgramAPI is not defined. This could indicate that deepgram.js did not load properly.');
    
    // Check if the script elements exist
    const scripts = document.querySelectorAll('script');
    logDebug('[connectToDeepgram] Script elements found:', scripts.length);
    scripts.forEach((script, index) => {
      logDebug(`[connectToDeepgram] Script ${index}:`, script.src || 'inline script');
    });
  }
  
  if (MOCK_WEBSOCKET_CONNECTION) {
    console.log('>>> MOCK: SIMULATING WEBSOCKET CONNECTION SUCCESS <<<');
    // Simulate necessary state update if needed
    recordingState.transcriptionConnected = true; // Assume mock connection works
    return true;
  }
  
  // --- Real Connection Logic --- 
  try {
    logDebug('Connecting to Deepgram for transcription (Real)');
    
    if (!apiKey || apiKey.trim() === '') {
      logDebug('No Deepgram API key provided, cannot connect');
      return false;
    }
    
    if (!window.deepgramAPI) {
      logDebug('Deepgram API not available');
      
      // Try reloading the script
      logDebug('[connectToDeepgram] Attempting to reload deepgram.js script...');
      const script = document.createElement('script');
      script.src = 'deepgram.js';
      script.onload = () => logDebug('[connectToDeepgram] deepgram.js reloaded');
      script.onerror = (err) => logDebug('[connectToDeepgram] Error reloading deepgram.js:', err);
      document.head.appendChild(script);
      
      // Wait a bit for the script to load
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Check if it worked
      if (!window.deepgramAPI) {
        logDebug('[connectToDeepgram] Still cannot access deepgramAPI');
        return false;
      } else {
        logDebug('[connectToDeepgram] Successfully reloaded deepgramAPI');
      }
    }

    // Set up transcript callback
    window.deepgramAPI.setTranscriptCallback((data) => {
      logDebug('Received transcript from Deepgram', data);
      
      // Process the transcript and send it to the background script
      // This will then be forwarded to the UI
      try {
        const processedData = processSpeakerInfo(data); // Gets { isFinal, segments, raw }

        // Send update if there are segments (even if text is empty for interim)
        if (processedData.segments) { 
           // Note: processSpeakerInfo now handles sending the message
           // so we don't need to duplicate that here
        } else {
          logDebug('No segments processed from the data');
        }
      } catch (err) {
        logDebug('Error processing transcript data:', err);
      }
    });
    
    // Connect to Deepgram
    await window.deepgramAPI.connectToDeepgram({
      encoding: "linear16",
      sample_rate: 48000,
      channels: 1,
      model: "nova-3",
      language: language,
      smart_format: true,
      diarize: true,
      punctuate: true,
      interim_results: true,
      apiKey: apiKey 
    });
    
    await delay(100);
    const state = window.deepgramAPI.getConnectionState ? window.deepgramAPI.getConnectionState() : 'UNKNOWN';
    logDebug(`[connectToDeepgram] Real connection initiated. State: ${state}`);
    
    if (state !== 'OPEN' && state !== 'CONNECTING') { 
        logDebug(`[connectToDeepgram] Real connection failed (State: ${state}).`);
        return false;
    }

    logDebug('[connectToDeepgram] Real connection attempt successful (or CONNECTING).');
    return true;

  } catch (error) {
    logDebug('>>> [connectToDeepgram] Error during REAL connection attempt:', error);
    return false;
  }
}

// Process speaker information from Deepgram response
function processSpeakerInfo(data) {
  // Log the structure to debug
  logDebug('Processing speaker info from data:', JSON.stringify(data, null, 2));

  // Check if we have the expected data structure
  if (!data) {
    logDebug('No data provided for processing speaker info');
    return { isFinal: false, segments: [], raw: data };
  }

  // Determine the isFinal status
  const isFinal = data.is_final === true;

  // Find the correct alternatives path
  let channel = null;
  if (data.channel) {
    channel = data.channel;
  } else if (data.results && data.results.channels && data.results.channels.length > 0) {
    channel = data.results.channels[0];
  }

  if (!channel || !channel.alternatives || channel.alternatives.length === 0) {
    logDebug('No valid alternatives found in the data');
    // Send an empty interim update if needed, or just return
    return { isFinal: isFinal, segments: [], raw: data }; 
  }

  const alternative = channel.alternatives[0];
  const words = alternative.words || [];
  const transcript = alternative.transcript || '';
  let processedSegments = [];

  // If we have words and diarization is enabled (words have speaker property)
  if (words.length > 0 && words[0].speaker !== undefined) {
    let currentSpeaker = -1;
    let currentSegmentWords = [];

    words.forEach((word, index) => {
      const wordSpeaker = word.speaker; // Speaker for this specific word

      // If speaker changes OR it's the first word
      if (currentSpeaker === -1 || wordSpeaker !== currentSpeaker) {
        // If there was a previous segment, push it
        if (currentSegmentWords.length > 0) {
          processedSegments.push({
            speakerId: currentSpeaker,
            text: currentSegmentWords.map(w => w.word).join(' ').trim(),
            isFinal: isFinal, // Apply overall final status to segment
            start_time: currentSegmentWords[0].start // Optional: add start time
          });
        }
        // Start new segment
        currentSpeaker = wordSpeaker;
        currentSegmentWords = [word];
      } else {
        // Continue current segment
        currentSegmentWords.push(word);
      }

      // If it's the last word, push the final segment
      if (index === words.length - 1 && currentSegmentWords.length > 0) {
        processedSegments.push({
          speakerId: currentSpeaker,
          text: currentSegmentWords.map(w => w.word).join(' ').trim(),
          isFinal: isFinal, // Apply overall final status
          start_time: currentSegmentWords[0].start // Optional: add start time
        });
      }
    });
  } else if (transcript.trim()) {
    // Fallback: If no words or no speaker info, use the whole transcript for Speaker 0
    logDebug('No speaker diarization info in words, using full transcript for Speaker 0');
    processedSegments.push({
      speakerId: 0,
      text: transcript.trim(),
      isFinal: isFinal
    });
  } else {
    // Handle cases with no transcript text (e.g., empty interim)
     processedSegments.push({
       speakerId: 0,
       text: '', 
       isFinal: isFinal
     });
  }

  // Filter out potentially empty segments just in case
  processedSegments = processedSegments.filter(segment => segment.text || !segment.isFinal);

  // Create the processed data object
  const processedData = {
    isFinal: isFinal,
    segments: processedSegments,
    raw: data // Keep raw data if needed
  };
  
  // Send the processed data to the background script
  // Only send if we have segments OR it's a final update (even if empty)
  if (processedSegments.length > 0 || isFinal) { 
    try {
      chrome.runtime.sendMessage({
        target: 'background',
        action: 'transcriptionUpdate',
        data: processedData
      }).catch(err => logDebug('Error sending transcript update:', err));
    } catch (err) {
      logDebug('Error sending processed transcript data:', err);
    }
  }
  
  // Return the processed data object (might still be useful locally)
  return processedData;
}

// Helper to map speaker indices to labels
function getSpeakerLabel(speakerIndex) {
  const labels = ['Speaker A', 'Speaker B', 'Speaker C', 'Speaker D'];
  return labels[speakerIndex] || `Speaker ${speakerIndex}`;
}

// Start recording
async function startRecording(options) {
  logDebug('[Offscreen Start] Starting recording process...', options);
  let success = false;
  let errorMsg = null;

  try {
    if (recordingState.isRecording) {
      logDebug('Recording already in progress in offscreen document');
      return { success: false, error: 'Recording already in progress' };
    }
    
    // First close any existing Deepgram connection to avoid creating a second one
    if (window.deepgramAPI) {
      try {
        const connectionState = window.deepgramAPI.getConnectionState();
        logDebug(`Pre-recording check: Deepgram connection state is "${connectionState}"`);
        
        if (connectionState === "OPEN" || connectionState === "CONNECTING") {
          logDebug('Found existing open connection, closing it before starting a new one');
          logDebug("IMPORTANT: Closing existing connection to prevent multiple connections");
          window.deepgramAPI.disconnectFromDeepgram();
          // Add a small delay to ensure connection is properly closed
          logDebug('Waiting for existing connection to fully close...');
          await new Promise(resolve => setTimeout(resolve, 500));
          logDebug('Continuing after waiting for connection to close');
        } else {
          logDebug(`No active connection to close (state: ${connectionState})`);
        }
      } catch (error) {
        logDebug('Error checking/closing existing Deepgram connection:', error);
      }
    }

    // Reset state
    recordingState.audioChunks = [];
    recordingState.audioBlob = null;
    recordingState.audioURL = null;
    recordingState.stopResolve = null;
    recordingState.transcriptionEnabled = options.enableTranscription !== false; // Enable by default
    recordingState.transcriptionConnected = false;
    
    // Get stream ID from options
    const streamId = options.streamId;
    const useMicrophone = options.useMicrophone || false;
    
    // Connect to Deepgram FIRST if transcription is enabled
    logDebug('[Offscreen Start] Checking transcription enabled status:', recordingState.transcriptionEnabled);
    if (recordingState.transcriptionEnabled) {
      logDebug('[Offscreen Start] Transcription enabled, attempting connection...');
      const connected = await connectToDeepgramForTranscription(options.apiKey, options.language);
      if (!connected) {
        throw new Error('Failed to connect to Deepgram for transcription');
      }
      recordingState.transcriptionConnected = true;
      logDebug('[Offscreen Start] Deepgram connection successful.');
    }
    
    // --- If transcription is disabled OR connection was successful, proceed --- 
    
    // Create tab media stream
    const tabStream = await createMediaStreamFromTab(streamId);
    recordingState.tabStream = tabStream;
    
    // Create microphone stream if needed
    let micStream = null;
    let fallbackToTabOnly = false;
    
    logDebug('[Offscreen Start] Checking if microphone is requested:', useMicrophone);
    if (useMicrophone) {
      try {
        logDebug('[Offscreen Start] Attempting to call getMicrophoneStream...');
        micStream = await getMicrophoneStream();
        recordingState.micStream = micStream;
        logDebug('[Offscreen Start] Successfully obtained microphone stream:', micStream);
      } catch (micError) {
        logDebug('>>> [Offscreen Start] FAILED to get microphone stream, falling back to tab audio only:', micError);
        fallbackToTabOnly = true;
      }
    } else {
      logDebug('[Offscreen Start] Microphone not requested.');
    }
    
    // Mix streams if using microphone
    logDebug('[Offscreen Start] Determining stream to record...', { useMicrophone, micStreamExists: !!micStream, fallback: fallbackToTabOnly });
    let streamToRecord;
    if (useMicrophone && micStream && !fallbackToTabOnly) {
      streamToRecord = mixAudioStreams(tabStream, micStream);
      recordingState.mixedStream = streamToRecord;
      logDebug('Using mixed stream for recording');
    } else {
      streamToRecord = tabStream;
      // Connect tab stream to audio output to ensure playback
      connectStreamToAudioOutput(tabStream);
      logDebug('Using tab stream for recording');
      
      // If this was a fallback, we should inform the user
      if (fallbackToTabOnly && useMicrophone) {
        // We'll return success but with a warning
        setTimeout(() => {
          chrome.runtime.sendMessage({
            target: 'background',
            action: 'recordingWarning',
            data: { 
              warning: 'Microphone access was denied. Recording tab audio only.'
            }
          }).catch(err => logDebug('Error sending warning:', err));
        }, 100);
      }
    }
    
    // Create media recorder
    logDebug('[Offscreen Start] Creating MediaRecorder with default mimeType (webm)...');
    const mediaRecorder = new MediaRecorder(streamToRecord); // Revert to default (likely webm)
    recordingState.mediaRecorder = mediaRecorder;
    
    // Handle data available event
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordingState.audioChunks.push(event.data);
        logDebug('Recorded chunk of size:', event.data.size);
        
        // Send audio data to Deepgram if connected
        if (recordingState.transcriptionEnabled && 
            recordingState.transcriptionConnected && 
            window.deepgramAPI) {
          
          if (!MOCK_WEBSOCKET_CONNECTION) {
            // --- Real Send Logic --- 
            try {
              if (event.data instanceof Blob) {
                logDebug('Converting Blob to ArrayBuffer for Deepgram');
                event.data.arrayBuffer().then(buffer => {
                  window.deepgramAPI.sendAudioToDeepgram(buffer);
                  logDebug('Sent ArrayBuffer to Deepgram, size:', buffer.byteLength);
                }).catch(err => {
                  logDebug('Error converting Blob to ArrayBuffer:', err);
                });
              } else {
                window.deepgramAPI.sendAudioToDeepgram(event.data);
                logDebug('Sent data directly to Deepgram');
              }
            } catch (error) {
              logDebug('Error sending audio data to Deepgram:', error);
            }
          } else {
            // --- Mock Send Logic --- 
            // console.log('>>> MOCK: Skipping sendAudioToDeepgram <<<'); // Optional log
          }
        }
      }
    };
    
    // Handle recording stop
    mediaRecorder.onstop = () => {
      logDebug('MediaRecorder stopped');
      
      // Create blob from chunks HERE
      logDebug('[Offscreen onstop] Creating Blob from audio chunks...', { numChunks: recordingState.audioChunks.length });
      if (recordingState.audioChunks.length === 0) {
          logDebug('>>> [Offscreen onstop] Warning: No audio chunks recorded.');
          // Handle error case - perhaps send an error message back?
          // For now, just log and don't create blob/URL
          recordingState.audioBlob = null;
          recordingState.audioURL = null;
      } else {
          const audioBlob = new Blob(recordingState.audioChunks, { type: 'audio/webm' }); // Revert Blob type to webm
          recordingState.audioBlob = audioBlob;
          
          // Create URL for the blob
          const audioURL = URL.createObjectURL(audioBlob);
          recordingState.audioURL = audioURL;
          logDebug('[Offscreen onstop] Blob and URL created.', { size: audioBlob.size, url: audioURL });

          // Send recording result to background script HERE
          chrome.runtime.sendMessage({
            target: 'background',
            action: 'recordingResult',
            data: { audioURL: audioURL }
          }).then(() => {
            logDebug('[Offscreen onstop] Recording result sent to background script');
          }).catch((error) => {
            logDebug('>>> [Offscreen onstop] Error sending recording result:', error);
          });
      }

      // Stop all tracks in the streams
      if (recordingState.tabStream) {
        recordingState.tabStream.getTracks().forEach(track => track.stop());
      }
      
      if (recordingState.micStream) {
        recordingState.micStream.getTracks().forEach(track => track.stop());
      }

      if (recordingState.mixedStream) {
        recordingState.mixedStream.getTracks().forEach(track => track.stop());
      }

      // Close audio context to free resources
      if (recordingState.audioContext) {
        recordingState.audioContext.close().then(() => {
          logDebug('Audio context closed');
          recordingState.audioContext = null;
        }).catch(error => {
          logDebug('Error closing audio context:', error);
        });
      }
      
      // Resolve the stop promise if it exists
      if (recordingState.stopResolve) {
        recordingState.stopResolve({
          success: true,
          audioURL: audioURL
        });
        recordingState.stopResolve = null;
      }
    };
    
    // Handle recording error
    mediaRecorder.onerror = (event) => {
      logDebug('MediaRecorder error:', event);
      
      // Stop recording if there's an error
      stopRecording();
    };
    
    // Start recording
    logDebug('[Offscreen Start] Starting MediaRecorder...');
    mediaRecorder.start(1000); 
    recordingState.isRecording = true;
    logDebug('[Offscreen Start] MediaRecorder started.');
    
    // Mark overall success
    success = true;

  } catch (error) {
    logDebug('>>> [Offscreen Start] CRITICAL ERROR during startRecording process:', error);
    errorMsg = error.message;
    // Clean up resources
    if (recordingState.tabStream) {
      recordingState.tabStream.getTracks().forEach(track => track.stop());
      recordingState.tabStream = null;
    }
    
    if (recordingState.micStream) {
      recordingState.micStream.getTracks().forEach(track => track.stop());
      recordingState.micStream = null;
    }
    
    if (recordingState.mixedStream) {
      recordingState.mixedStream.getTracks().forEach(track => track.stop());
    }
    
    if (recordingState.audioContext) {
      recordingState.audioContext.close().catch(err => {
        logDebug('Error closing audio context during cleanup:', err);
      });
      recordingState.audioContext = null;
    }
    
    // Disconnect from Deepgram if connected
    if (recordingState.transcriptionEnabled && 
        recordingState.transcriptionConnected && 
        window.deepgramAPI) {
      window.deepgramAPI.disconnectFromDeepgram();
      recordingState.transcriptionConnected = false;
    }
    
    success = false;
  }

  // --- Send Confirmation Message Back to Background --- 
  if (success) {
    logDebug('[Offscreen Start] Sending recordingActuallyStarted confirmation to background...');
    chrome.runtime.sendMessage({
      target: 'background',
      action: 'recordingActuallyStarted',
      data: {
          startTime: Date.now(), // Send start time from here
          useMicrophone: options.useMicrophone || false, // Confirm settings used
          transcriptionEnabled: recordingState.transcriptionEnabled,
          transcriptionConnected: recordingState.transcriptionConnected
      }
    }).catch(err => logDebug('Error sending recordingActuallyStarted message:', err));
    
    // Also send connected status if applicable (moved from earlier)
    if (recordingState.transcriptionConnected) {
        chrome.runtime.sendMessage({
          target: 'background',
          action: 'transcriptionConnectionUpdate',
          data: { status: 'connected' }
        }).catch(err => logDebug('Error sending final connected status:', err));
    }

  } else {
    logDebug('[Offscreen Start] Sending recordingStartFailed message to background...');
    chrome.runtime.sendMessage({
      target: 'background',
      action: 'recordingStartFailed',
      data: { error: errorMsg || 'Unknown error during offscreen start' }
    }).catch(err => logDebug('Error sending recordingStartFailed message:', err));
  }
  // NOTE: This function no longer returns anything directly to the caller via promise/sendResponse
}

// Stop recording
async function stopRecording() { 
  logDebug('>>> [Offscreen Stop] stopRecording function CALLED <<<');
  
  try {
    logDebug('[Offscreen Stop] Checking recording state...', { isRecording: recordingState.isRecording, recorderState: recordingState.mediaRecorder?.state });
    
    // Check if already stopped or stopping
    if (!recordingState.isRecording || !recordingState.mediaRecorder || recordingState.mediaRecorder.state === 'inactive') {
      logDebug('[Offscreen Stop] Recording already stopped or not active. Exiting.');
      // Return the existing URL if available, otherwise indicate no recording
      return { success: true, audioURL: recordingState.audioURL }; 
    }

    // Check if already stopped but URL not generated yet (rare race condition?)
    if (recordingState.audioURL) {
        logDebug('[Offscreen Stop] Recording stopped, URL already exists. Returning existing URL.');
        return { success: true, audioURL: recordingState.audioURL };
    }

    // 1. Disconnect Deepgram (if connected)
    logDebug('[Offscreen Stop] Disconnecting Deepgram (if applicable)...');
    if (window.deepgramAPI) {
      if (!MOCK_WEBSOCKET_CONNECTION) {
        try {
          // Log Deepgram connection state before disconnecting
          const stateBefore = window.deepgramAPI.getConnectionState ? window.deepgramAPI.getConnectionState() : 'UNKNOWN';
          logDebug(`[Offscreen Stop] Deepgram connection state before disconnect: ${stateBefore}`);
          
          if (stateBefore === 'OPEN' || stateBefore === 'CONNECTING') {
            // Enhanced disconnect logic - multiple ways to ensure WebSocket is closed
            logDebug('[Offscreen Stop] Calling disconnectFromDeepgram()...');
            window.deepgramAPI.disconnectFromDeepgram();
            
            // Also try to access the WebSocket directly as a failsafe
            if (window.deepgramAPI.socket && typeof window.deepgramAPI.socket.close === 'function') {
              logDebug('[Offscreen Stop] Also calling direct socket.close() as a failsafe...');
              window.deepgramAPI.socket.close(1000, 'User stopped recording');
            }
            
            // Force clear any internal reference to the socket
            if (window.deepgramAPI.setSocket && typeof window.deepgramAPI.setSocket === 'function') {
              logDebug('[Offscreen Stop] Setting socket to null in deepgramAPI...');
              window.deepgramAPI.setSocket(null);
            }
            
            // Check final state
            setTimeout(() => {
              const stateAfter = window.deepgramAPI.getConnectionState ? window.deepgramAPI.getConnectionState() : 'UNKNOWN';
              logDebug(`[Offscreen Stop] Deepgram connection state after disconnect: ${stateAfter}`);
            }, 300);
            
            // Ensure disconnected status is sent
            chrome.runtime.sendMessage({ 
              target:'background', 
              action:'transcriptionConnectionUpdate', 
              data:{
                status:'disconnected',
                message: 'Disconnected due to recording stop'
              } 
            }).catch(err => {
              logDebug('Error sending disconnection status update:', err);
            });
          } else {
            logDebug(`[Offscreen Stop] Deepgram not connected (state: ${stateBefore}), no need to disconnect.`);
          }
          
          recordingState.transcriptionConnected = false;
        } catch (wsError) {
          logDebug(`[Offscreen Stop] ERROR closing Deepgram connection: ${wsError.message}`, wsError);
          // Still mark as disconnected even if error occurred
          recordingState.transcriptionConnected = false;
        }
      } else {
        // ... (Mock disconnect logic) ...
        console.log('>>> MOCK: SIMULATING WEBSOCKET DISCONNECT <<<');
        recordingState.transcriptionConnected = false; 
      }
    }

    // 2. Stop MediaRecorder
    logDebug('>>> [Offscreen Stop] Calling mediaRecorder.stop() <<<', { stateBefore: recordingState.mediaRecorder.state });
    recordingState.mediaRecorder.stop();
    logDebug('[Offscreen Stop] mediaRecorder.stop() called.', { stateAfter: recordingState.mediaRecorder.state });
    recordingState.isRecording = false; // Set state immediately

    // 3. Stop Media Stream Tracks
    logDebug('[Offscreen Stop] Stopping media stream tracks...');
    try {
      if (recordingState.tabStream) { recordingState.tabStream.getTracks().forEach(track => track.stop()); }
      if (recordingState.micStream) { recordingState.micStream.getTracks().forEach(track => track.stop()); }
      if (recordingState.mixedStream) { recordingState.mixedStream.getTracks().forEach(track => track.stop()); }
      logDebug('[Offscreen Stop] Media stream tracks stopped.');
    } catch (trackError) {
      logDebug('>>> [Offscreen Stop] Error stopping tracks:', trackError);
    }

    // 5. Close Audio Context
    logDebug('[Offscreen Stop] Closing AudioContext (will be closed in onstop if still needed)...'); 
    // Note: Closing context here might be premature if onstop needs it briefly. 
    // Let's rely on onstop to close it.
    // if (recordingState.audioContext) { ... }

    // 7. Return success object (indicate stop was initiated)
    // The actual result URL will be sent via message from onstop.
    logDebug('>>> [Offscreen Stop] stopRecording function finished initiating stop <<<');
    return { success: true, stopped: true }; // Indicate stop was successfully initiated

  } catch (error) {
    logDebug('>>> [Offscreen Stop] CRITICAL ERROR in stopRecording function:', error);
    // ... (existing cleanup) ...
    recordingState.isRecording = false;
    return { success: false, error: error.message };
  }
}

// Download recording
function downloadRecording(audioURL) {
  logDebug('Downloading recording from offscreen document...');
  
  try {
    // If audio URL was provided in the message, use that instead
    const urlToDownload = audioURL || recordingState.audioURL;
    
    if (!urlToDownload) {
      logDebug('No audio URL for download');
      return { success: false, error: 'No recording available' };
    }
    
    if (!recordingState.audioBlob && !audioURL) {
      logDebug('No recording blob available for download');
      return { success: false, error: 'No recording available' };
    }
    
    // Create download link
    const downloadLink = document.createElement('a');
    downloadLink.href = urlToDownload;
    
    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15);
    downloadLink.download = `tab-audio-${timestamp}.webm`;
    
    // Trigger download
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    
    logDebug('Download initiated from offscreen document');
    return { success: true };
  } catch (error) {
    logDebug('Error downloading recording from offscreen document:', error);
    return { success: false, error: error.message };
  }
}

// Handle microphone permission request without starting recording
async function requestMicrophonePermission() {
  logDebug('Handling microphone permission request in offscreen document');
  logDebug('Current URL:', window.location.href);
  logDebug('Document visibility state:', document.visibilityState);
  logDebug('Attempting to call getUserMedia...');
  
  try {
    // Request microphone access directly with more detailed constraints for testing
    const constraints = { 
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    };
    
    logDebug('Using constraints:', JSON.stringify(constraints));
    
    // Add a timeout to ensure we don't wait forever
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('getUserMedia timeout after 10 seconds')), 10000);
    });
    
    const mediaPromise = navigator.mediaDevices.getUserMedia(constraints);
    const stream = await Promise.race([mediaPromise, timeoutPromise]);
    
    // Stop all tracks right away (we just needed the permission)
    stream.getTracks().forEach(track => {
      logDebug('Stopping track:', track.kind, track.label);
      track.stop();
    });
    
    logDebug('Microphone permission granted in offscreen document');
    return { success: true };
  } catch (error) {
    logDebug('Error requesting microphone permission in offscreen document:', error);
    logDebug('Error name:', error.name);
    logDebug('Error message:', error.message);
    logDebug('Error stack:', error.stack);
    
    // Create a more detailed error response
    const response = { 
      success: false, 
      error: null,
      errorName: error.name,
      errorMessage: error.message
    };
    
    // Check for different types of permission errors
    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
      // The NotAllowedError can happen for multiple reasons:
      // 1. User explicitly denied permission (clicked "Block")
      // 2. User dismissed the dialog (clicked the X)
      // 3. Permission was already denied previously
      
      if (error.message && (
          error.message.toLowerCase().includes('dismiss') || 
          error.message.includes('closed'))) {
        response.error = 'Microphone permission request was dismissed by user';
      } else {
        response.error = 'Microphone permission denied by user';
      }
    } else if (error.name === 'NotFoundError') {
      response.error = 'No microphone found. Please connect a microphone and try again.';
    } else if (error.name === 'AbortError') {
      response.error = 'Microphone permission request was dismissed by user';
    } else if (error.name === 'TimeoutError' || error.message.includes('timeout')) {
      response.error = 'Microphone permission request timed out - dialog may not be visible';
    } else {
      response.error = `Error accessing microphone: ${error.message}`;
    }
    
    logDebug('Formatted permission error response:', response);
    return response;
  }
}

// Handle messages from background script
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  // Validate message format and target
  if (!message || typeof message !== 'object') {
    logDebug('Invalid message format received:', message);
    return false;
  }
  
  if (message.target !== 'offscreen' && message.target !== 'any') {
    return false; // Not for us
  }
  
  logDebug('Received message in offscreen document:', message);
  let response = { success: false };
  
  try {
    if (message.action === 'startRecording') {
      logDebug('Handling startRecording message');
      const data = message.data || {};
      
      if (!data.streamId) {
        sendResponse({ success: false, error: 'No stream ID provided' });
      } else if (data.enableTranscription && !data.apiKey) {
        sendResponse({ success: false, error: 'API Key missing for transcription' });
      } else {
        // Fire and forget - startRecording now sends its own confirmation messages
        startRecording(data); 
        // Return true because startRecording is async, even though we don't use its direct return value for sendResponse
        return true; 
      }
    } else if (message.action === 'stopRecording') {
      logDebug('Handling stopRecording message');
      // Add a check to ensure Deepgram connection is properly closed
      if (window.deepgramAPI && typeof window.deepgramAPI.getConnectionState === 'function') {
        const stateBefore = window.deepgramAPI.getConnectionState();
        logDebug(`[MessageHandler] Deepgram connection state before stop: ${stateBefore}`);
      }
      
      // Call stopRecording with proper await
      const stopResult = await stopRecording();
      
      // Double-check that the Deepgram connection is really closed
      if (window.deepgramAPI && typeof window.deepgramAPI.getConnectionState === 'function') {
        const stateAfter = window.deepgramAPI.getConnectionState();
        logDebug(`[MessageHandler] Deepgram connection state after stop: ${stateAfter}`);
        
        // If it's still open somehow, try to force close it
        if (stateAfter !== "CLOSED") {
          logDebug(`[MessageHandler] WARNING: Deepgram connection still not CLOSED after stopRecording! Forcing disconnect...`);
          try {
            window.deepgramAPI.disconnectFromDeepgram();
            
            // Wait a moment and check again
            await new Promise(resolve => setTimeout(resolve, 300));
            const finalState = window.deepgramAPI.getConnectionState();
            logDebug(`[MessageHandler] Deepgram connection state after force disconnect: ${finalState}`);
          } catch (forceError) {
            logDebug(`[MessageHandler] Error during force disconnect: ${forceError.message}`);
          }
        }
      }
      
      sendResponse(stopResult);
      return true; // Indicate async response
    } else if (message.action === 'downloadRecording') {
      logDebug('Handling downloadRecording message');
      const data = message.data || {};
      sendResponse(downloadRecording(data.audioURL));
    } else if (message.action === 'requestMicrophonePermission') {
      logDebug('Handling requestMicrophonePermission message');
      requestMicrophonePermission().then(sendResponse);
      return true; // Indicates async response
    } else if (message.action === 'updateDeepgramSettings') {
      // Update Deepgram settings in the document
      logDebug('Updating Deepgram settings in offscreen document');
      const data = message.data || {};
      
      // Store the settings for use in future recordings
      if (data.apiKey) {
        // Update API key in the deepgram.js module if it's loaded
        if (window.deepgramAPI && typeof window.deepgramAPI.setApiKey === 'function') {
          window.deepgramAPI.setApiKey(data.apiKey);
          logDebug('Updated Deepgram API key in deepgram.js module');
        } else {
          logDebug('Deepgram API not available, will use key on next connection');
        }
      }
      
      // Store the language setting for future connections
      if (data.language) {
        recordingState.transcriptionLanguage = data.language;
        logDebug('Updated transcription language to:', data.language);
      }
      
      response = { success: true };
    } else {
      logDebug('Unknown action:', message.action);
      response = { success: false, error: 'Unknown action' };
    }
  } catch (error) {
    logDebug('Error handling message:', error);
    response = { success: false, error: error.message };
  }
  
  // Send response if we haven't already
  if (response) {
    try {
      sendResponse(response);
    } catch (error) {
      logDebug('Error sending response:', error);
    }
  }
  
  return false; // Default to synchronous response
});

// Signal that the offscreen document is ready
logDebug('Offscreen document script loaded');
chrome.runtime.sendMessage({
  target: 'background',
  action: 'offscreenReady',
  data: { timestamp: Date.now() }
}).catch(error => {
  logDebug('Error sending ready message:', error);
});

// Add unload event listener to close WebSocket connections when page is closed
window.addEventListener('beforeunload', (event) => {
  console.log("Offscreen document being unloaded, attempting to close WebSocket...");
  // Use the correct API exposed by deepgram.js
  if (window.deepgramAPI && typeof window.deepgramAPI.disconnectFromDeepgram === 'function') {
    logDebug('[beforeunload] Calling disconnectFromDeepgram...');
    window.deepgramAPI.disconnectFromDeepgram();
  } else {
    logDebug('[beforeunload] deepgramAPI or disconnect function not found.');
  }
}); 