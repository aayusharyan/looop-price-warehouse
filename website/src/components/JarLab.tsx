import { useState } from 'react';
import Icon from './Icon';

type St = 'in' | 'out' | 'idle';
const LABEL: Record<St, string> = { in: 'Logged in', out: 'Logged out', idle: 'Not logged in' };

export default function JarLab() {
  const [kavori, setKavori] = useState(false);
  const [signed, setSigned] = useState(false);
  const a1: St = !kavori && signed ? 'out' : 'in';
  const a2: St = signed ? 'in' : 'idle';

  const note = !kavori
    ? signed ? 'Both accounts share one set of cookies, so the second login replaced the first.'
             : 'The work account is logged in. Log in to the second one and see what happens.'
    : signed ? 'Each account has its own cookies, so both stay logged in.'
             : 'Each group has its own cookies. Log in to the second account.';

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
          <button aria-pressed={!kavori} onClick={() => set(false)}>Normal browser</button>
          <button aria-pressed={kavori} onClick={() => set(true)}>Kavori</button>
        </div>
        <button className="reset" onClick={() => setSigned(false)}>Reset</button>
      </div>
      <div className="accts">
        {acct(a1, 'W', 'c-vermilion', 'Work account')}
        {acct(a2, 'P', 'c-blue', 'Personal account')}
      </div>
      <div className="jars">
        <div className="jar"><Icon name="cookie" />{kavori ? 'Work cookies' : 'One shared set of cookies'}</div>
        <div className={`jar${kavori ? '' : ' gone'}`}><Icon name="cookie" />Personal cookies</div>
      </div>
      <div className="lab-cta">
        <button className="btn btn-primary btn-sm" onClick={() => setSigned(true)} disabled={signed}>{signed ? 'Logged in to account 2' : 'Log in to account 2'}</button>
        <p className="lab-note" aria-live="polite">{note}</p>
      </div>
    </div>
  );
}
