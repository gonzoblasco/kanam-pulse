// HealthScoreCard.tsx
import React, { useMemo } from 'react';
import { useHealthData } from '../hooks/useHealthData';

const HealthScoreCard = ({ title }) => {
  const { health, loading, error } = useHealthData();

  if (!health) return null;

  const score = health.overall;
  const status = health.status; // healthy | attention | degraded

  const color = status === 'healthy' ? '#2ecc71' : status === 'attention' ? '#f39c12' : '#e74c3c';

  return (
    <div style={{ border: '1px solid #ccc', padding: '20px', borderRadius: '8px', maxWidth: '300px', margin: '20px' }}>
      <h3 style={{ textAlign: 'center' }}>{title}</h3>
      <div style={{ textAlign: 'center', fontSize: '2.5em', margin: '10px 0' }}>{score}%</div>
      <p style={{ textAlign: 'center', textTransform: 'uppercase' }}>{status}</p>
      <div style={{ width: '100%', backgroundColor: 'linear-gradient(to right, #ddd, #ddd)', height: '10px', borderRadius: '4px', marginTop: '10px' }}>
        <div style={{ height: '100%', width: `${score}%`, backgroundColor: color }} />
      </div>
    </div>
  );
};

export default HealthScoreCard;
