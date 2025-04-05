import React, { useState, useEffect } from 'react';

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (deepgramApiKey: string, geminiApiKey: string, language: string) => void;
  isMicEnabled: boolean;
  isTabAudioEnabled: boolean;
  onToggleMic: (enabled: boolean) => void;
  onToggleTabAudio: (enabled: boolean) => void;
  initialDeepgramApiKey?: string;
  initialGeminiApiKey?: string;
  initialLanguage?: string;
}

const Settings: React.FC<SettingsProps> = ({ 
  isOpen, 
  onClose, 
  onSave,
  isMicEnabled,
  isTabAudioEnabled,
  onToggleMic,
  onToggleTabAudio,
  initialDeepgramApiKey,
  initialGeminiApiKey,
  initialLanguage,
}) => {
  // State for API keys and language
  const [deepgramKey, setDeepgramKey] = useState<string>('');
  const [geminiKey, setGeminiKey] = useState<string>('');
  const [language, setLanguage] = useState<string>('en');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveMessage, setSaveMessage] = useState<string>('');

  // Supported languages
  const languages = [
    { code: 'en', name: 'English' },
    { code: 'es', name: 'Spanish' },
    { code: 'fr', name: 'French' },
    { code: 'de', name: 'German' },
    { code: 'it', name: 'Italian' },
    { code: 'ja', name: 'Japanese' },
    { code: 'ko', name: 'Korean' },
    { code: 'zh', name: 'Chinese' },
    { code: 'ru', name: 'Russian' },
    { code: 'pt', name: 'Portuguese' },
  ];

  // Load settings when component mounts or isOpen changes
  useEffect(() => {
    if (isOpen) {
      setDeepgramKey(initialDeepgramApiKey || '');
      setGeminiKey(initialGeminiApiKey || '');
      setLanguage(initialLanguage || 'en');
      setSaveMessage(''); 
    }
  }, [isOpen, initialDeepgramApiKey, initialGeminiApiKey, initialLanguage]);

  // Save settings
  const handleSave = () => {
    console.log('Settings component: saving settings');
    setIsSaving(true);
    setSaveMessage('');
    
    console.log('Settings component: calling onSave callback');
    onSave(deepgramKey, geminiKey, language);
    
    setIsSaving(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="settings-overlay">
      <div className="settings-panel">
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>
        
        <div className="settings-content">
          {/* Deepgram API Key Section */}
          <div className="settings-group">
            <label htmlFor="api-key">Deepgram API Key</label>
            <input
              type="password"
              id="api-key"
              value={deepgramKey}
              onChange={(e) => setDeepgramKey(e.target.value)}
              placeholder="Enter your Deepgram API key"
              className="settings-input"
            />
            <p className="settings-description">
              Get your API key from <a href="https://console.deepgram.com" target="_blank" rel="noopener noreferrer">Deepgram Console</a>. Used for transcription.
            </p>
          </div>
          
          {/* Gemini API Key Section */}
          <div className="settings-group">
            <label htmlFor="gemini-api-key">Google AI API Key</label>
            <input
              type="password"
              id="gemini-api-key"
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
              placeholder="Enter your Google AI API Key"
              className="settings-input"
            />
             <p className="settings-description">
               Needed for live insights. Get a key from <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer">Google AI Studio</a>.
            </p>
          </div>
          
          {/* Transcription Language Section */}
          <div className="settings-group">
            <label htmlFor="language">Transcription Language</label>
            <select
              id="language"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="settings-select"
            >
              {languages.map(lang => (
                <option key={lang.code} value={lang.code}>
                  {lang.name}
                </option>
              ))}
            </select>
          </div>

          {/* Audio Sources Section */}
          <div className="settings-group">
            <h3>Audio Sources</h3>
            {/* Microphone Audio - Apply inline styling/structure */}
            <div className="settings-checkbox-group inline-group">
              <input
                type="checkbox"
                id="include-microphone"
                checked={isMicEnabled}
                onChange={(e) => onToggleMic(e.target.checked)}
              />
              <label htmlFor="include-microphone">Include microphone audio</label>
            </div>
            {/* Tab Audio - Apply inline styling/structure */}
            <div className="settings-checkbox-group inline-group">
               <input
                 type="checkbox"
                 id="include-tab-audio"
                 checked={isTabAudioEnabled}
                 onChange={(e) => onToggleTabAudio(e.target.checked)} 
               />
               <label htmlFor="include-tab-audio">Include active tab audio</label>
            </div>
            <p className="settings-description">
               Select which audio sources to include in the recording.
            </p>
          </div>
          
          {saveMessage && (
            <div className={`settings-message ${saveMessage.includes('successfully') ? 'success' : 'error'}`}>
              {saveMessage}
            </div>
          )}
        </div>
        
        <div className="settings-footer">
          <button 
            className="settings-button save-button" 
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Settings; 