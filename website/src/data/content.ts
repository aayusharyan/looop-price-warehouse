import { site } from '../config';

export const faq = [
  ['Is it a one-time payment?', `Yes. You pay ${site.price} once. There’s no subscription and no charge for upgrades.`],
  ['Do updates cost extra?', 'No. Every future version is free, security fixes included.'],
  ['Does Kavori collect data?', 'No. There’s no analytics, no ads and no account. Logins, cookies and history stay on your computer.'],
  ['Can I run two WhatsApp accounts?', 'Yes. Make two groups, open WhatsApp Web in each, and link a different phone to each.'],
  ['Which systems does it run on?', 'macOS, Windows and Linux, on one license.'],
] as const;

// Edit rows here. `win: true` marks a cell where the alternative beats Kavori.
export type Cell = { t: string; win?: string };
export const compare = {
  columns: [
    { name: 'Kavori', sub: 'Browser with groups', us: true },
    { name: 'Ferdium', sub: 'Open-source app hub' },
    { name: 'Franz', sub: 'App hub' },
    { name: 'Wavebox', sub: 'Workspace browser' },
    { name: 'Firefox Containers', sub: 'Add-on for Firefox' },
  ],
  rows: [
    ['Price', [{ t: `One payment of ${site.price}` }, { t: 'Free', win: 'Lowest' }, { t: 'Free tier, paid plans' }, { t: 'Paid subscription plans' }, { t: 'Free', win: 'Lowest' }]],
    ['Two logins on one site', [{ t: 'Yes, one session per group' }, { t: 'Yes, per service' }, { t: 'Yes, per service' }, { t: 'Yes' }, { t: 'Yes, cookies and site data only' }]],
    ['Other data separated', [{ t: 'Cache, storage and permissions' }, { t: 'Per service' }, { t: 'Per service' }, { t: 'Per workspace' }, { t: 'History and extensions are shared' }]],
    ['Future upgrades', [{ t: 'All free' }, { t: 'Free' }, { t: 'Included in your plan' }, { t: 'Included while you subscribe' }, { t: 'With Firefox' }]],
    ['Security updates from', [{ t: 'Us, as free updates' }, { t: 'Community volunteers' }, { t: 'The vendor' }, { t: 'The vendor' }, { t: 'Mozilla' }]],
    ['Best for', [{ t: 'People who want a one-time purchase' }, { t: 'People who want free and open source' }, { t: 'Teams that want a managed hub' }, { t: 'People fine with a subscription' }, { t: 'People who already use Firefox' }]],
  ] as [string, Cell[]][],
};
