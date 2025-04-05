# CloseAssist - Message Protocol

This document describes the standardized message protocol used for communication between different components of the CloseAssist extension.

## Message Format

All messages follow a standardized format with the following fields:

```typescript
{
  target: MessageTarget,  // The target component that should handle this message
  action: string,         // The action to be performed
  data?: any              // Optional data payload specific to the action
}
```

## Message Targets

Messages are explicitly targeted to ensure they're handled by the correct component:

- `background`: Messages intended for the background script
- `offscreen`: Messages intended for the offscreen document
- `sidepanel`: Messages intended for the React sidepanel 
- `content-script`: Messages intended for content scripts
- `any`: Broadcast messages that can be handled by any component

## Message Flow

### 1. Background Script to Offscreen Document

```
Background Script → Offscreen Document
```

- **startRecording**: Initiates audio recording with specified options
- **stopRecording**: Stops the current recording
- **downloadRecording**: Triggers audio file download
- **updateDeepgramSettings**: Updates API key and language settings for transcription
- **requestMicrophonePermission**: Prompts user for microphone access

### 2. Offscreen Document to Background Script

```
Offscreen Document → Background Script
```

- **offscreenReady**: Signals that the offscreen document is initialized
- **recordingResult**: Returns the URL for the recorded audio
- **recordingWarning**: Reports non-critical issues during recording
- **transcriptionUpdate**: Sends transcription segments from Deepgram
- **transcriptionConnectionUpdate**: Reports Deepgram connection status changes

### 3. Background Script to Sidepanel

```
Background Script → Sidepanel (React)
```

- **recordingStarted**: Notifies that recording has begun
- **recordingStopped**: Notifies that recording has stopped
- **recordingStateChanged**: Reports changes to recording state
- **transcriptionUpdate**: Forwards transcription data to UI
- **transcriptionConnectionUpdate**: Reports Deepgram connection status
- **microphonePermissionChanged**: Notifies of permission changes

### 4. Sidepanel to Background Script

```
Sidepanel (React) → Background Script
```

- **startRecording**: Requests to start recording
- **stopRecording**: Requests to stop recording
- **downloadRecording**: Requests to download audio
- **getRecordingState**: Retrieves current recording state
- **requestMicrophonePermission**: Requests microphone access
- **openSidePanel**: Opens the sidepanel for a specific tab
- **getTranscriptionState**: Retrieves current transcription state
- **updateDeepgramSettings**: Updates API key and language settings

## Error Handling

All message sending includes standard error handling to:

1. Catch and log relevant errors
2. Ignore expected "receiving end does not exist" errors
3. Properly resolve or reject promises based on responses

## Implementing Message Passing

For sending messages, use the utility functions in `message-protocol.ts`:

```typescript
import { sendMessage, createMessage, MessageTarget, SidepanelAction } from '../message-protocol';

// Example of sending a message
const message = createMessage(MessageTarget.BACKGROUND, SidepanelAction.START_RECORDING, {
  useMicrophone: true
});
sendMessage(message)
  .then(response => console.log('Response:', response))
  .catch(error => console.error('Error:', error));
```

React components should use the `useExtensionMessaging` hook to handle incoming messages:

```typescript
import { useExtensionMessaging } from './hooks/useExtensionMessaging';

function MyComponent() {
  const { 
    startRecording, 
    stopRecording,
    isMessageListenerActive 
  } = useExtensionMessaging({
    onRecordingStarted: (data) => {
      console.log('Recording started:', data);
    },
    onTranscriptionUpdate: (data) => {
      console.log('Transcription update:', data);
    }
  });
  
  return (
    <button onClick={() => startRecording(true)}>
      Start Recording with Microphone
    </button>
  );
}
```

## Benefits of Standardized Messaging

1. **Consistency**: All components use the same message format
2. **Error Handling**: Centralized error handling for all messages
3. **Type Safety**: TypeScript interfaces for message types
4. **Targeted Delivery**: Messages explicitly specify their destination
5. **Testability**: Easier to mock and test message passing
6. **Maintainability**: Clear documentation of message contract 