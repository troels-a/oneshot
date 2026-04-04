import { useState, useEffect } from 'react';
import cronstrue from 'cronstrue';

export default function NaturalCron({ expression }) {
  const [showRaw, setShowRaw] = useState(false);

  useEffect(() => {
    if (!showRaw) return;
    const timer = setTimeout(() => setShowRaw(false), 3000);
    return () => clearTimeout(timer);
  }, [showRaw]);

  let natural;
  try {
    natural = cronstrue.toString(expression, { use24HourTimeFormat: true });
  } catch {
    natural = expression;
  }

  return (
    <span
      className={showRaw ? 'natural-cron mono' : 'natural-cron'}
      title={showRaw ? natural : expression}
      onClick={(e) => { e.stopPropagation(); setShowRaw(s => !s); }}
      style={{ cursor: 'pointer' }}
    >
      {showRaw ? expression : natural}
    </span>
  );
}
