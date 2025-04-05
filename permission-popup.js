// Get DOM elements
const step1 = document.getElementById('step1');
const step2 = document.getElementById('step2');
const step3 = document.getElementById('step3');
const requestBtn = document.getElementById('requestPermissionBtn');
const statusEl = document.getElementById('status');
const helpText = document.getElementById('helpText');
const resultIcon = document.getElementById('resultIcon');
const resultStatus = document.getElementById('resultStatus');
const closeButton = document.getElementById('closeButton');

// Log messages to console
function log(message) {
  console.log('' + message);
}

// Function to request microphone permission
async function requestMicrophonePermission() {
  log('Requesting microphone permission from popup');
  
  // Show step 2
  step1.classList.add('hidden');
  step2.classList.remove('hidden');
  
  try {
    // Show help text after a delay in case the dialog doesn't appear
    setTimeout(() => {
      helpText.classList.remove('hidden');
    }, 3000);
    
    // Request microphone access with echo cancellation and noise suppression enabled
    const stream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });
    
    log('Microphone permission granted');
    
    // Stop tracks immediately (we just needed the permission)
    stream.getTracks().forEach(track => {
      log('Stopping track: ' + track.kind);
      track.stop();
    });
    
    // Show success state
    showResult(true);
    
    // Send success message to background script
    chrome.runtime.sendMessage({
      source: 'permission-popup',
      action: 'permissionResult',
      success: true
    });
    
  } catch (error) {
    log('Error requesting microphone permission: ' + error.message);
    
    // Determine error type
    let errorMessage = '';
    let isDismissed = false;
    let isDenied = false;
    
    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
      if (error.message && (
          error.message.toLowerCase().includes('dismiss') || 
          error.message.includes('closed'))) {
        errorMessage = 'Microphone permission dialog was dismissed.';
        isDismissed = true;
      } else {
        errorMessage = 'Microphone permission was denied.';
        isDenied = true;
      }
    } else if (error.name === 'NotFoundError') {
      errorMessage = 'No microphone found. Please connect a microphone and try again.';
    } else {
      errorMessage = 'Error accessing microphone: ' + error.message;
    }
    
    // Show error state
    showResult(false, errorMessage);
    
    // Send error message to background script
    chrome.runtime.sendMessage({
      source: 'permission-popup',
      action: 'permissionResult',
      success: false,
      error: errorMessage,
      permissionDenied: isDenied,
      permissionDismissed: isDismissed,
      errorName: error.name
    });
  }
}

// Function to show the result state
function showResult(success, errorMessage = '') {
  step2.classList.add('hidden');
  step3.classList.remove('hidden');
  
  if (success) {
    resultIcon.textContent = '✓';
    resultStatus.textContent = 'Permission granted successfully!';
    resultStatus.className = 'status success';
  } else {
    resultIcon.textContent = '✗';
    resultStatus.textContent = errorMessage;
    resultStatus.className = 'status error';
  }
}

// Add event listeners
requestBtn.addEventListener('click', requestMicrophonePermission);

closeButton.addEventListener('click', () => {
  window.close();
});

// Log that we're ready
log('Permission popup loaded and ready'); 