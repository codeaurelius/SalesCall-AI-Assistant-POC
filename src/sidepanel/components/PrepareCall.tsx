import React, { useState } from 'react';

interface CallSetupData {
  meetingTopic: string;
  hostName: string;
  guestName: string;
}

interface PrepareCallProps {
  onSetupComplete: (data: CallSetupData) => void;
}

const PrepareCall: React.FC<PrepareCallProps> = ({ onSetupComplete }) => {
  const [meetingTopic, setMeetingTopic] = useState('');
  const [hostName, setHostName] = useState('');
  const [guestName, setGuestName] = useState('');

  const handleSubmit = (event: React.FormEvent) => { 
    event.preventDefault();
    // Basic validation could be added here
    const data: CallSetupData = {
      meetingTopic,
      hostName,
      guestName,
    };
    console.log('Call Setup Data:', data); // Log before passing
    onSetupComplete(data);
  };

  return (
    <div className="prepare-call-view"> {/* Use a specific class */}
      <div className="setup-form">
        <div className="form-title">Prepare Your Call</div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="meeting-topic">Meeting Topic / Goal:</label>
            <textarea 
              id="meeting-topic" 
              name="meeting-topic" 
              placeholder="e.g., Discuss Q2 workflow improvements, Demo feature X..."
              value={meetingTopic}
              onChange={(e) => setMeetingTopic(e.target.value)}
              required // Make topic required
            />
          </div>

          <div className="form-group participant-section">
            <h4>Participants</h4>
            <label htmlFor="host-name">Host Name (You):</label>
            <input 
              type="text" 
              id="host-name" 
              name="host-name" 
              value={hostName} 
              onChange={(e) => setHostName(e.target.value)}
              placeholder="Enter your name" 
              required // Make host required
            />

            <label htmlFor="guest-name" style={{ marginTop: '10px' }}>Guest Name:</label>
            <input 
              type="text" 
              id="guest-name" 
              name="guest-name" 
              placeholder="Enter guest's full name"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              required // Make guest required
            />
          </div>

          <div className="start-button-container" style={{ display: 'flex', justifyContent: 'center' }}>
            <button type="submit" className="start">
              Start Recording & Transcription
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PrepareCall; 