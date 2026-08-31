// HealthScoreCard.tsx
// Renders the aggregate health score from /api/run plus the optional
// "Explain this audit" summary (local Ollama via POST /api/audit/explain).
// WCAG notes:
//  - the explain button has an accessible label
//  - the result region is aria-live="polite": screen readers announce the
//    explanation when it arrives (and the unavailable notice)

import React, { useState } from 'react';
import { useHealthData } from '../hooks/useHealthData';
import { useExplainAudit } from '../hooks/useExplainAudit';
import { useI18n } from '../i18n/useI18n';

interface HealthScoreCardProps {
  title: string;
}

const HealthScoreCard = ({ title }: HealthScoreCardProps) => {
  const { t } = useI18n();
  const { health, loading, error } = useHealthData();
  const explain = useExplainAudit();
  const [showUnavailable, setShowUnavailable] = useState(false);

  const handleExplain = async () => {
    // Always re-show the notice on a fresh attempt so users know the outcome;
    // it disappears again if the follow-up request succeeds.
    setShowUnavailable(true);
    await explain.explain(health);
  };

  if (loading) {
    return (
      <div style={cardStyle}>
        <h3 style={{ textAlign: 'center' }}>{title}</h3>
        <p style={{ textAlign: 'center', color: '#666' }}>{t('health.loading')}</p>
      </div>
    );
  }

  if (error || !health) {
    return (
      <div style={cardStyle}>
        <h3 style={{ textAlign: 'center' }}>{title}</h3>
        <p style={{ textAlign: 'center', color: '#c0392b' }}>
          {error ?? t('health.unavailable')}
        </p>
      </div>
    );
  }

  const score = health.overall;
  const status = health.status; // healthy | attention | degraded
  const color =
    status === 'healthy' ? '#2ecc71' : status === 'attention' ? '#f39c12' : '#e74c3c';

  const showResult =
    explain.loading || explain.explanation || (explain.available === false && showUnavailable);

  return (
    <div style={cardStyle}>
      <h3 style={{ textAlign: 'center' }}>{title}</h3>
      <div style={{ textAlign: 'center', fontSize: '2.5em', margin: '10px 0' }}>
        {score}%
      </div>
      <p style={{ textAlign: 'center', textTransform: 'uppercase' }}>{status}</p>
      <div
        style={{
          width: '100%',
          backgroundColor: '#ddd',
          height: '10px',
          borderRadius: '4px',
          marginTop: '10px',
        }}
      >
        <div
          style={{ height: '100%', width: `${score}%`, backgroundColor: color }}
        />
      </div>

      <div style={{ marginTop: '16px', textAlign: 'center' }}>
        <button
          type="button"
          onClick={handleExplain}
          disabled={explain.loading}
          style={{
            padding: '8px 16px',
            borderRadius: '6px',
            border: '1px solid #ccc',
            backgroundColor: '#2563eb',
            borderColor: '#2563eb',
            color: '#fff',
            cursor: explain.loading ? 'default' : 'pointer',
          }}
        >
          {explain.loading ? t('health.explaining') : t('health.explain')}
        </button>
      </div>

      {showResult && (
        <div
          role="status"
          aria-live="polite"
          style={{
            marginTop: '14px',
            padding: '12px',
            borderRadius: '6px',
            backgroundColor: '#f5f6f8',
            border: '1px solid #ddd',
            fontSize: '0.9em',
            lineHeight: 1.5,
            whiteSpace: 'pre-wrap',
          }}
        >
          {explain.loading ? (
            t('health.preparing')
          ) : explain.explanation ? (
            explain.explanation
          ) : (
            t('health.ollamaUnavailable')
          )}
        </div>
      )}

      {explain.error && (
        <p role="alert" style={{ color: '#c0392b', marginBottom: 0 }}>
          {explain.error}
        </p>
      )}
    </div>
  );
};

const cardStyle: React.CSSProperties = {
  border: '1px solid #ccc',
  padding: '20px',
  borderRadius: '8px',
  maxWidth: '300px',
  margin: '20px',
};

export default HealthScoreCard;
