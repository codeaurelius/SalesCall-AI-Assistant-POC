// CloseAssist - Content Script
console.log('Content script loaded');

// Function to inject the permission iframe
function injectPermissionIframe() {
  return new Promise((resolve, reject) => {
    try {
      console.log('Starting permission iframe injection');
      
      // Check if we already have an iframe
      let permissionFrame = document.getElementById('tab-audio-recorder-permission-frame');
      
      // If not, create one
      if (!permissionFrame) {
        console.log('Creating new permission iframe');
        permissionFrame = document.createElement('iframe');
        permissionFrame.id = 'tab-audio-recorder-permission-frame';
        permissionFrame.style.width = '1px';
        permissionFrame.style.height = '1px';
        permissionFrame.style.position = 'absolute';
        permissionFrame.style.top = '-100px';
        permissionFrame.style.left = '-100px';
        permissionFrame.style.border = 'none';
        permissionFrame.style.visibility = 'hidden';
        
        // Set source to our permission page
        const frameUrl = chrome.runtime.getURL('permission-frame.html');
        console.log('Setting iframe source to:', frameUrl);
        permissionFrame.src = frameUrl;
        
        // Add to document
        document.body.appendChild(permissionFrame);
        console.log('Permission iframe added to document');
      } else {
        console.log('Using existing permission iframe');
      }
      
      // Setup message listener for iframe communication
      const messageListener = (event) => {
        console.log('Received message from iframe:', event.data);
        
        // Verify origin to ensure it's our iframe
        if (event.source !== permissionFrame.contentWindow) {
          console.log('Message not from our iframe, ignoring');
          return;
        }
        
        console.log('Processing response from permission iframe');
        
        // Remove listener to avoid memory leaks
        window.removeEventListener('message', messageListener);
        
        // Process the result
        if (event.data.success) {
          console.log('Permission granted in iframe');
          resolve(event.data);
        } else {
          console.log('Permission denied in iframe:', event.data.error);
          reject(new Error(event.data.error || 'Permission denied in iframe'));
        }
        
        // Remove the iframe after a short delay
        setTimeout(() => {
          try {
            if (permissionFrame && permissionFrame.parentNode) {
              permissionFrame.parentNode.removeChild(permissionFrame);
              console.log('Permission iframe removed');
            }
          } catch (e) {
            console.error('Error removing permission iframe:', e);
          }
        }, 1000);
      };
      
      // Add listener for iframe messages
      window.addEventListener('message', messageListener);
      console.log('Added message listener for iframe');
      
      // Set a timeout to avoid hanging indefinitely
      setTimeout(() => {
        window.removeEventListener('message', messageListener);
        reject(new Error('Permission request timed out'));
      }, 30000);
      
    } catch (error) {
      console.error('Error in injectPermissionIframe:', error);
      reject(error);
    }
  });
}

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Content script received message:', message);
  
  if (message.action === 'requestMicrophonePermission') {
    console.log('Content script starting permission request');
    injectPermissionIframe()
      .then(result => {
        console.log('Permission request successful:', result);
        sendResponse(result);
      })
      .catch(error => {
        console.error('Permission request failed:', error);
        sendResponse({ 
          success: false, 
          error: error.message || 'Unknown error in content script' 
        });
      });
    
    // Return true to indicate we will send a response asynchronously
    return true;
  }
  
  // Log any other messages received
  console.log('Content script received unknown message:', message);
}); 