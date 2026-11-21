import { useState } from 'react';
import Icon from './Icon';

type St = 'in' | 'out' | 'idle';
const LABEL: Record<St, string> = { in: 'Signed in', out: 'Signed out', idle: 'Not signed in' };

export default function JarLab() {
  const [kavori, setKavori] = useState(false);
  const [signed, setSigned] = useState(false);
  const a1: St = !kavori && signed ? 'out' : 'in';
  const a2: St = signed ? 'in' : 'idle';

  const note = !kavori
    ? signed ? 'Same site, same cookie jar. The second login replaced the first, so the work account was signed out.'
             : 'One browser, one cookie jar. The work account is signed in. Now sign in to a second account.'
    : signed ? 'Two groups, two jars. Both accounts stay signed in, side by side.'
             : 'Every group has its own jar. The work account is signed in. Now sign in to a second account.';

  const set = (k: boolean) => { setKavori(k); setSigned(false); };
  const acct = (st: St, glyph: string, color: string, name: string) => (
    <div className={`acct ${st}`} key={name}>
      <div className="acct-h"><span className={`tile tile-sm ${color}`}>{glyph}</span><div><b>{name}</b><span>chat.example.com</span></div></div>
      <span className={`status ${st}`}>{LABEL[st]}</span>
    </div>
  );

  return (
    <div className="lab">
      <div className="lab-top">
        <div className="seg" role="group" aria-label="Compare browsers">
          <span className={`thumb at-${kavori ? 1 : 0}`} />
          <button aria-pressed={!kavori} onClick={() => set(false)}>Any other browser</button>
          <button aria-pressed={kavori} onClick={() => set(true)}>Kavori</button>
        </div>
        <button className="reset" onClick={() => setSigned(false)}>Reset</button>
      </div>
      <div className="accts">
        {acct(a1, 'W', 'c-vermilion', 'Work account')}
        {acct(a2, 'P', 'c-blue', 'Personal account')}
      </div>
      <div className="jars">
        <div className="jar"><Icon name="cookie" />{kavori ? 'Jar: Work' : 'One shared cookie jar'}</div>
        <div className={`jar${kavori ? '' : ' gone'}`}><Icon name="cookie" />Jar: Personal</div>
      </div>
      <div className="lab-cta">
        <button className="btn btn-primary btn-sm" onClick={() => setSigned(true)} disabled={signed}>{signed ? 'Signed in to account 2' : 'Sign in to account 2'}</button>
        <p className="lab-note" aria-live="polite">{note}</p>
      </div>
    </div>
  );
}
