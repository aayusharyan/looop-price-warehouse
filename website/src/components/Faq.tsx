import { useState } from 'react';
import Icon from './Icon';

export default function Faq({ items }: { items: readonly (readonly [string, string])[] }) {
  const [open, setOpen] = useState(0);
  return (
    <div className="faq">
      {items.map(([q, a], i) => (
        <div key={q} className={`q${open === i ? ' open' : ''}`}>
          <button className="q-h" aria-expanded={open === i} aria-controls={`faq-${i}`} onClick={() => setOpen(open === i ? -1 : i)}>
            {q}<Icon name="plus" />
          </button>
          <div className="q-b" id={`faq-${i}`}><div><p>{a}</p></div></div>
        </div>
      ))}
    </div>
  );
}
