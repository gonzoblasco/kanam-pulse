import React from 'react';
import HealthScoreCard from './components/HealthScoreCard';
import FixesPanel from './components/FixesPanel';
import { useI18n } from './i18n/useI18n';

function App() {
  const { t } = useI18n();
  return (
    <div style={{ padding: '20px' }}>
      <h1>{t('app.title')}</h1>
      <HealthScoreCard title={t('health.title')} />
      <FixesPanel />
    </div>
  );
}

export default App;
