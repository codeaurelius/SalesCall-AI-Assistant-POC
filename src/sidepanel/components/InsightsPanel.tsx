import React, { useEffect, useRef } from 'react';

// Import the GeminiResponse type (adjust path if needed)
import type { GeminiResponse } from '../../background/types';

// Use the StoredInsightsState type from the hook
interface StoredInsight { 
  text: string;
  timestamp: number; 
}
interface StoredInsightsState { 
  keywords: StoredInsight[];
  objections: StoredInsight[];
  pain_points: StoredInsight[];
  action_items: StoredInsight[];
}

// Define props for the component
interface InsightsPanelProps {
  insights: StoredInsightsState | null; // Use the new state type
  isLoading: boolean;
  error: string | null;
  onInsightClick: (insightId: string) => void; // Keep for potential future use
}

// Define the order and titles for categories
const categoryOrder: Array<keyof GeminiResponse> = ['pain_points', 'objections', 'action_items', 'keywords'];
const categoryTitles: Record<keyof GeminiResponse, string> = {
  keywords: 'Keywords',
  objections: 'Objections',
  pain_points: 'Pain Points',
  action_items: 'Action Items'
};

const InsightsPanel: React.FC<InsightsPanelProps> = ({ 
  insights,
  isLoading,
  error,
  onInsightClick,
}) => {
  const previousInsightsRef = useRef<StoredInsightsState | null>(null);

  useEffect(() => {
    // Store the current insights when they change to compare later
    previousInsightsRef.current = insights;
  }, [insights]);

  // Function for standard list rendering (Objections, Pain Points, Action Items)
  const renderInsightList = (categoryKey: keyof StoredInsightsState, title: string, items: StoredInsight[]) => {
    if (!items || items.length === 0) return null;

    const previousItems = previousInsightsRef.current?.[categoryKey] || [];
    const previousTexts = new Set(previousItems.map(item => item.text));

    return (
      <div className="insight-category">
        <h4>{title}</h4>
        <ul>
          {items.map((item) => {
            const isNew = !previousTexts.has(item.text);
            const key = `${categoryKey}-${item.text}-${item.timestamp}`;
            return (
              <li 
                key={key} 
                className={`insight-item category-${categoryKey} ${isNew ? 'new-insight' : ''}`}
              >
                {item.text}
              </li>
            );
          })}
        </ul>
      </div>
    );
  };

  // --- New Function for Keyword Cloud --- 
  const renderKeywordCloud = (categoryKey: 'keywords', title: string, items: StoredInsight[]) => {
    if (!items || items.length === 0) return null;

    const previousItems = previousInsightsRef.current?.[categoryKey] || [];
    const previousTexts = new Set(previousItems.map(item => item.text));

    return (
      <div className="insight-category category-keywords-cloud">
        <h4>{title}</h4>
        <div className="keyword-cloud-container">
          {items.map((item) => {
            const isNew = !previousTexts.has(item.text);
            const key = `${categoryKey}-${item.text}-${item.timestamp}`;
            // Basic size variation example (can be made more sophisticated)
            const sizeClass = items.length > 15 ? 'tag-small' : items.length > 5 ? 'tag-medium' : 'tag-large'; 
            return (
              <span 
                key={key} 
                className={`keyword-tag ${sizeClass} ${isNew ? 'new-insight' : ''}`}
                // onClick={() => onInsightClick(item.text)} // Optional click 
              >
                {item.text}
              </span>
            );
          })}
        </div>
      </div>
    );
  };
  // --- End of Keyword Cloud Function --- 

  const hasInsights = insights && (
    (insights.keywords && insights.keywords.length > 0) ||
    (insights.objections && insights.objections.length > 0) ||
    (insights.pain_points && insights.pain_points.length > 0) ||
    (insights.action_items && insights.action_items.length > 0)
  );

  return (
    <div className="insights-panel">
      <div className="insights-header">
        <h3>Insights</h3>
      </div>
      
      {/* Subtle loading indicator */}
      {isLoading && <div className="loading-indicator"></div>}

      {error && (
        <div className="error-message insights-error">Error: {error}</div>
      )}

      <div 
        className="insights-content" 
        style={{
          display: 'flex', 
          flexDirection: 'column',
          gap: '10px'
        }}
      >
        {!hasInsights && !isLoading && !error && (
          <div className="empty-state insights-empty">Listening for insights...</div>
        )}
        {/* Use standard list for these */}
        {insights && renderInsightList('objections', 'Objections', insights.objections)}
        {insights && renderInsightList('pain_points', 'Pain Points', insights.pain_points)}
        {insights && renderInsightList('action_items', 'Action Items', insights.action_items)}
        {/* Use cloud renderer for keywords */}
        {insights && renderKeywordCloud('keywords', 'Keywords', insights.keywords)}
      </div>
    </div>
  );
};

export default InsightsPanel; 