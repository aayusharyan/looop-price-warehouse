import { useState } from 'react';
import Icon from './Icon';

const GROUPS = [
  { name: 'Studio', glyph: 'S', color: 'c-vermilion', tabs: 3, unread: 3, who: 'Aanya Rao', tab: 'Inbox' },
  { name: 'Personal', glyph: 'P', color: 'c-blue', tabs: 2, unread: 12, who: 'Aanya', tab: 'Messages' },
  { name: 'Aster Co.', glyph: 'A', color: 'c-green', tabs: 2, unread: 0, who: 'Client admin', tab: 'Workspace' },
];

export default function HeroDemo() {
  const [active, setActive] = useState(0);
  const [touched, setTouched] = useState(false);
  const g = GROUPS[active];

  return (
    <div className="stage">
      <div className="win" aria-label="Kavori app preview">
        <div className="win-bar">
          <div className="tls" aria-hidden="true"><span className="tl tl-r" /><span className="tl tl-y" /><span className="tl tl-g" /></div>
          <div className={`w-tab on ${g.color}`}><i />{g.tab}</div>
          <div className={`w-tab ${g.color}`}><i />Calendar</div>
          <span className="w-iso"><Icon name="shield" className="ic ic-sm" />Isolated</span>
        </div>
        <div className="win-body">
          <div className="rail">
            <div className="rows" style={{ ['--i' as string]: active }}>
              <div className="plate" />
              {GROUPS.map((x, i) => (
                <button key={x.name} className={`g${i === active ? ' on' : ''}`} aria-label={x.name} aria-pressed={i === active}
                  onClick={() => { setActive(i); setTouched(true); }}>
                  <span className={`tile ${x.color}`}>{x.glyph}</span>
                  <span className="g-text"><span className="g-name">{x.name}</span><span className="g-sub">{x.tabs} tabs</span></span>
                  {x.unread > 0 && <span className="badge">{x.unread}</span>}
                </button>
              ))}
            </div>
            <div className="rail-foot"><Icon name="plus" className="ic ic-sm" /><span>New group</span></div>
          </div>
          <div className="pane">
            <div key={active} className={`pane-in ${touched ? 'flip-a' : ''}`}>
              <div className={`who ${g.color}`}>
                <span className={`tile tile-lg ${g.color}`}>{g.glyph}</span>
                <div><b>{g.who}</b><span>chat.example.com</span></div>
                <span className="me">Logged in</span>
              </div>
              {[['36%', '82%', '9:41'], ['30%', '64%', '9:12'], ['42%', '76%', 'Mon']].map(([a, b, t]) => (
                <div key={t} className={`msg ${g.color}`}>
                  <span className="av" /><span className="ln"><i style={{ width: a }} /><i style={{ width: b }} /></span><span className="t">{t}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <p className="tryline"><span className="hand"><Icon name="left" className="ic ic-sm" /></span>Click a group on the left. Each one is a different login on the same site.</p>
    </div>
  );
}
