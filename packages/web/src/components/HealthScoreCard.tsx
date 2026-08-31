// HealthScoreCard.tsx
import React from 'react';
import { useHealthData } from '../hooks/useHealthData';

interface HealthScoreCardProps {
  title: string;
}

const HealthScoreCard = ({ title }: HealthScoreCardProps) => {
  const { health, loading, error } = useHealthData();

  if (loading) {
    return (
      <div style={cardStyle}>
        <h3 style={{ textAlign: 'center' }}>{title}</h3>
        <p style={{ textAlign: 'center', color: '#666' }}>Loading...</p>
      </div>
    );
  }

  if (error || !health) {
    return (
      <div style={cardStyle}>
        <h3 style={{ textAlign: 'center' }}>{title}</h3>
        <p style={{ textAlign: 'center', color: '#c0392b' }}>
          {error ?? 'Health data unavailable'}
        </p>
      </div>
    );
  }

  const score = health.overall;
  const status = health.status; // healthy | attention | degraded
  const color =
    status === 'healthy' ? '#2ecc71' : status === 'attention' ? '#f39c12' : '#e74c3c';

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
