import { useEffect, useState } from 'react';
import Icon from './Icon';

export default function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  useEffect(() => setTheme((document.documentElement.dataset.theme as 'light' | 'dark') || 'light'), []);

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('kavori-theme', next); } catch {}
    setTheme(next);
  };

  return (
    <button className="icon-btn" aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} onClick={toggle}>
      <span className="theme-ic"><Icon name="sun" className="ic sun" /><Icon name="moon" className="ic moon" /></span>
    </button>
  );
}
