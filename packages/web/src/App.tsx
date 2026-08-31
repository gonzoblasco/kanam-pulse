import React from 'react';
import HealthScoreCard from './components/HealthScoreCard';
import FixesPanel from './components/FixesPanel';

function App() {
  return (
    <div style={{ padding: '20px' }}>
      <h1>Kanam Pulse Dashboard</h1>
      <HealthScoreCard title="System Health" />
      <FixesPanel />
    </div>
  );
}

export default App;
