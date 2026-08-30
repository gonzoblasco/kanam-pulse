import React, { useState, useEffect } from 'react';
import HealthScoreCard from './components/HealthScoreCard';
import './styles/App.css';

function App() {
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const res = await fetch('/api/health');
        if (!res.ok) throw new Error('API call failed');
        const data = await res.json();
        setHealth(data);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    checkHealth();
  }, []);

  if (loading) return <h1>Loading...</h1>;
  if (error) return <h1>Error: {error}</h1>;

  return (
    <div>
      <h1>Kanam Pulse Dashboard</h1>
      <HealthScoreCard health={health} />
    </div>
  );
}

export default App;
