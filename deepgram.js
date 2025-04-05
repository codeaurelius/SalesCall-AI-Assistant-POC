// Deepgram API integration for CloseAssist

// API key is no longer hardcoded, must be set via settings
let DEEPGRAM_API_KEY = "";

// Function to set API key from outside
function setApiKey(key) {
  console.log("Setting API key");
  DEEPGRAM_API_KEY = key;
  return true;
}

// Manage the Deepgram connection state
let connection = null;
let connectionState = "CLOSED"; // CONNECTING, OPEN, CLOSED, ERROR
let transcriptCallback = null;

// Add a keep-alive timer
let keepAliveTimer = null;

// Add a queue for data received before connection is established
// This prevents data loss during connection establishment
let pendingAudioDataQueue = [];
const MAX_QUEUE_SIZE = 50; // Limit queue size to prevent memory issues

// Start the keep-alive timer to maintain the connection
function startKeepAlive() {
  // Clear any existing timer
  if (keepAliveTimer) {
    clearInterval(keepAliveTimer);
  }
  
  // Send a keep-alive message every 30 seconds
  keepAliveTimer = setInterval(() => {
    if (connection && connectionState === "OPEN") {
      try {
        console.log("Sending KeepAlive message to Deepgram");
        const keepAliveMessage = JSON.stringify({ type: "KeepAlive" });
        connection.send(keepAliveMessage);
      } catch (error) {
        console.error("Error sending keep-alive message:", error);
      }
    } else {
      // If connection is no longer open, stop the timer
      stopKeepAlive();
    }
  }, 30000); // Every 30 seconds
}

// Stop the keep-alive timer
function stopKeepAlive() {
  if (keepAliveTimer) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  }
}

// Connect to Deepgram with specified options
async function connectToDeepgram(options = {}) {
  console.log("Connecting to Deepgram with API key:", DEEPGRAM_API_KEY ? "Key exists" : "No key");
  
  // Stop any existing keep-alive timer
  stopKeepAlive();
  
  // Use provided API key from options if available
  const apiKeyToUse = options.apiKey || DEEPGRAM_API_KEY;
  
  if (!apiKeyToUse || apiKeyToUse.trim() === "") {
    throw new Error("Deepgram API key not configured. Please configure an API key in the settings.");
  }
  
  try {
    // Create WebSocket connection to Deepgram with all parameters in the URL
    let queryParams = new URLSearchParams({
      model: options.model || 'nova-3',
      diarize: options.diarize !== undefined ? options.diarize.toString() : 'true',
      interim_results: options.interim_results !== undefined ? options.interim_results.toString() : 'true',
      smart_format: options.smart_format !== undefined ? options.smart_format.toString() : 'true',
      punctuate: options.punctuate !== undefined ? options.punctuate.toString() : 'true',
      utterance_end_ms: options.utterance_end_ms || '3000',
      word_timings: options.word_timings !== undefined ? options.word_timings.toString() : 'true',
      multichannel: options.multichannel !== undefined ? options.multichannel.toString() : 'false',
      numerals: true,
    }).toString();
    
    // Add language parameter if specified
    if (options.language) {
      queryParams += `&language=${options.language}`;
    }
    
    const deepgramUrl = `wss://api.deepgram.com/v1/listen?${queryParams}`;
    console.log("Connecting to URL:", deepgramUrl);
    
    // Close any existing connection
    if (connection && connection.readyState === WebSocket.OPEN) {
      console.log("Closing existing connection");
      connection.close();
    }
    
    // Create a new WebSocket connection
    // According to the documentation, the WebSocket protocol should be used for authentication
    console.log("Creating new WebSocket connection with token protocol");
    connection = new WebSocket(deepgramUrl, ["token", apiKeyToUse]);
    connectionState = "CONNECTING";
    
    // Set up event handlers
    connection.onopen = () => {
      console.log("Deepgram WebSocket connection opened successfully");
      connectionState = "OPEN";
      
      // Process any pending audio data that was queued while connecting
      if (pendingAudioDataQueue.length > 0) {
        console.log(`Processing ${pendingAudioDataQueue.length} queued audio chunks`);
        
        // Make a copy of the queue and clear the original
        const queueToProcess = [...pendingAudioDataQueue];
        pendingAudioDataQueue = [];
        
        // Process each queued item
        queueToProcess.forEach(item => {
          try {
            connection.send(item);
            console.log("Sent queued audio data to Deepgram");
          } catch (error) {
            console.error("Error sending queued audio data:", error);
          }
        });
      }
      
      // Start the keep-alive timer
      startKeepAlive();
    };
    
    connection.onclose = (event) => {
      console.log("Deepgram WebSocket connection closed", event);
      console.log("Close code:", event.code);
      console.log("Close reason:", event.reason);
      connectionState = "CLOSED";
    };
    
    connection.onerror = (error) => {
      console.error("Deepgram WebSocket error:", error);
      console.error("Connection state at error time:", connectionState);
      connectionState = "ERROR";
    };
    
    connection.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log("Received message from Deepgram:", data);
        
        // Handle different message types from Deepgram
        if (data.type === "Results" || 
            data.type === "Transcript" || 
            data.type === undefined) {
          
          // If no type field, or it's a Results or Transcript type, it's likely a transcript
          if (transcriptCallback && typeof transcriptCallback === 'function') {
            transcriptCallback(data);
          }
        } else if (data.type === "UtteranceEnd") {
          console.log("Utterance end detected");
          // We could handle utterance end here if needed
        } else if (data.type === "Metadata") {
          console.log("Metadata received:", data);
          // Metadata could be processed if needed
        } else if (data.type === "Error") {
          console.error("Deepgram error:", data);
          // Handle Deepgram error
          connectionState = "ERROR";
        }
      } catch (error) {
        console.error("Error parsing Deepgram message:", error);
      }
    };
    
    // Return a promise that resolves when the connection is open
    return new Promise((resolve, reject) => {
      // Set timeout to prevent hanging
      const timeout = setTimeout(() => {
        reject(new Error("Timeout connecting to Deepgram"));
      }, 10000);
      
      // Check if the connection is already open
      if (connectionState === "OPEN") {
        clearTimeout(timeout);
        resolve();
        return;
      }
      
      // Wait for the connection to open
      const checkConnection = () => {
        if (connectionState === "OPEN") {
          clearTimeout(timeout);
          resolve();
        } else if (connectionState === "ERROR" || connectionState === "CLOSED") {
          clearTimeout(timeout);
          reject(new Error("Failed to connect to Deepgram"));
        } else {
          setTimeout(checkConnection, 100);
        }
      };
      
      checkConnection();
    });
  } catch (error) {
    console.error("Error connecting to Deepgram:", error);
    connectionState = "ERROR";
    throw error;
  }
}

// Disconnect from Deepgram
function disconnectFromDeepgram() {
  console.log("--- STARTING DISCONNECTION PROCEDURE ---");
  // Stop the keep-alive timer
  stopKeepAlive();
  console.log("Keep-alive timer stopped");
  
  // Clear any queued audio data
  pendingAudioDataQueue = [];
  console.log("Pending audio queue cleared");
  
  const localConnection = connection; // Keep local reference
  const stateBeforeDisconnect = connectionState;

  if (localConnection) {
    console.log("Connection exists, readyState:", localConnection.readyState, "connectionState:", stateBeforeDisconnect);
    
    // Always ensure the internal state is marked as CLOSED immediately
    connectionState = "CLOSED";
    console.log("Internal connection state set to CLOSED");
    
    try {
      // Remove event listeners to prevent interference during closure
      console.log("Removing WebSocket event listeners...");
      localConnection.onopen = null;
      localConnection.onmessage = null;
      localConnection.onerror = null;
      localConnection.onclose = null; // Remove our custom handler too, if any
      
      // Check state before sending control messages
      if (localConnection.readyState === WebSocket.OPEN) {
        console.log("Connection is OPEN, attempting to send control messages...");
        try {
          console.log("Sending CloseStream control message...");
          const closeStreamMessage = JSON.stringify({ type: "CloseStream" });
          localConnection.send(closeStreamMessage);
          console.log("CloseStream sent.");

          console.log("Sending Finalize control message...");
          const finalizeMessage = JSON.stringify({ type: "Finalize" });
          localConnection.send(finalizeMessage);
          console.log("Finalize sent.");
        } catch (msgError) {
          console.error("Error sending control messages (might be normal if closing):", msgError);
        }
      } else {
        console.log("Connection not OPEN, skipping control messages.");
      }
      
      // Log readyState *before* calling close()
      console.log("WebSocket readyState BEFORE close():", localConnection.readyState);
      
      // Always attempt to close the connection
      if (localConnection.readyState === WebSocket.OPEN || localConnection.readyState === WebSocket.CONNECTING) {
        console.log("Calling WebSocket close(1000, 'Disconnected by user')...");
        localConnection.close(1000, "Disconnected by user");
        console.log("WebSocket close() method called.");
      } else {
        console.log("WebSocket not in OPEN or CONNECTING state, close() not called.");
      }
      
      // Log readyState *immediately after* calling close()
      // Note: It might still be CLOSING here, not yet CLOSED.
      console.log("WebSocket readyState AFTER close():", localConnection.readyState);
      
    } catch (error) {
      console.error("Error during disconnection attempt:", error);
    } finally {
      // Ensure the global connection variable is cleared
      console.log("Clearing global connection reference.");
      connection = null;
    }
  } else {
    console.log("No connection object existed to close.");
    // Ensure state is CLOSED if no connection object exists
    if (connectionState !== "CLOSED") {
       console.log("Setting connection state to CLOSED as no connection object was found.");
       connectionState = "CLOSED";
    }
  }
  
  console.log("--- DISCONNECTION PROCEDURE COMPLETE --- State:", connectionState);
}

// Send audio data to Deepgram
function sendAudioToDeepgram(audioData) {
  // Check if connection exists and is actually OPEN (readyState === 1)
  // WebSocket readyState: 0 (CONNECTING), 1 (OPEN), 2 (CLOSING), 3 (CLOSED)
  if (connection && connection.readyState === WebSocket.OPEN) {
    // Connection is open, send data immediately
    try {
      console.log("Sending audio data to Deepgram, type:", 
                  audioData instanceof Blob ? "Blob" : 
                  audioData instanceof ArrayBuffer ? "ArrayBuffer" : 
                  typeof audioData);
      
      // If we have a Blob, convert it to ArrayBuffer first
      if (audioData instanceof Blob) {
        audioData.arrayBuffer().then(buffer => {
          // Double-check connection is still open before sending
          if (connection && connection.readyState === WebSocket.OPEN) {
            connection.send(buffer);
            console.log("Sent ArrayBuffer to Deepgram, size:", buffer.byteLength);
          } else {
            console.warn("Connection closed while processing Blob, data not sent");
          }
        }).catch(err => {
          console.error("Error converting Blob to ArrayBuffer:", err);
        });
        return true;
      }
      
      // Otherwise, send directly
      connection.send(audioData);
      return true;
    } catch (error) {
      console.error("Error sending audio data to Deepgram:", error);
      return false;
    }
  } else if (connection && connection.readyState === WebSocket.CONNECTING) {
    // Connection is still connecting, queue the data for later transmission
    try {
      // If it's a Blob, convert to ArrayBuffer before queuing
      if (audioData instanceof Blob) {
        audioData.arrayBuffer().then(buffer => {
          // Make sure we haven't exceeded the maximum queue size
          if (pendingAudioDataQueue.length < MAX_QUEUE_SIZE) {
            pendingAudioDataQueue.push(buffer);
            console.log("Queued audio data for later transmission, queue size:", 
                        pendingAudioDataQueue.length);
          } else {
            console.warn("Audio data queue full, dropping oldest chunk");
            // Remove oldest item and add new one
            pendingAudioDataQueue.shift();
            pendingAudioDataQueue.push(buffer);
          }
        }).catch(err => {
          console.error("Error converting Blob to ArrayBuffer for queue:", err);
        });
      } else {
        // Queue the data directly if it's not a Blob
        if (pendingAudioDataQueue.length < MAX_QUEUE_SIZE) {
          pendingAudioDataQueue.push(audioData);
          console.log("Queued audio data for later transmission, queue size:", 
                      pendingAudioDataQueue.length);
        } else {
          console.warn("Audio data queue full, dropping oldest chunk");
          pendingAudioDataQueue.shift();
          pendingAudioDataQueue.push(audioData);
        }
      }
      return true; // Successfully queued
    } catch (error) {
      console.error("Error queuing audio data:", error);
      return false;
    }
  } else {
    // Give more detailed information about why we can't send
    const state = connection ? 
      ["CONNECTING", "OPEN", "CLOSING", "CLOSED"][connection.readyState] : 
      "NULL";
    console.log(`Can't send audio data, WebSocket is in ${state} state`);
    return false;
  }
}

// Register a callback to receive transcript updates
function setTranscriptCallback(callback) {
  transcriptCallback = callback;
}

// Get the current connection state
function getConnectionState() {
  return connectionState;
}

// Export functions to window object
window.deepgramAPI = {
  connectToDeepgram,
  disconnectFromDeepgram,
  sendAudioToDeepgram,
  setTranscriptCallback,
  getConnectionState,
  setApiKey
};

// Log that deepgramAPI has been set to help with debugging
console.log("deepgramAPI has been set on window object:", 
  window.deepgramAPI ? "Success" : "Failed", 
  "Methods:", Object.keys(window.deepgramAPI || {}).join(", "));

// Log for debugging
function logDebug(message, data = null) {
  // Temporarily disable less critical logs for cleaner debugging
  const disabledMessages = [
    'sendAudioToDeepgram called', // Only log errors
    'Deepgram WebSocket message received', // Only log non-audio or errors
    'Processing transcription data', 
    'Sending transcription update to background script'
    // Add more messages to disable here if needed
  ];

  // Check for specific data types or messages to keep
  if (message.includes('Sending audio data')) {
    // Maybe log only the first time or occasionally, not every chunk
    // For now, let's disable it by adding to disabledMessages
    return; // Disable noisy audio sending logs
  }

  if (disabledMessages.some(disabled => message.includes(disabled))) {
    return; // Skip logging this message
  }

  const logMessage = `[Deepgram API] ${message}`;
  if (data) {
    console.log(logMessage, data);
  } else {
    console.log(logMessage);
  }
}

// Ensure this code runs only once
if (!window.deepgramAPISetup) {
  window.deepgramAPISetup = true;
} 