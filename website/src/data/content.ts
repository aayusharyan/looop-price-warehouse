import { site } from '../config';

export const faq = [
  ['Is it really a one-time payment?', `Yes. You pay ${site.price} once. There is no subscription, no renewal and no upgrade fee.`],
  ['What about future updates?', 'All future upgrades are free, including new features and security releases.'],
  ['Does Kavori collect any data?', 'No. There are no analytics, ads or tracking, and no account to create. Your logins, cookies and history stay on your device.'],
  ['Can I really run two WhatsApp accounts?', 'Yes. Create two groups and open WhatsApp Web in each. Link a different phone to each one. Both stay signed in at once.'],
  ['Which platforms does it run on?', 'macOS, Windows and Linux. One licence covers all of them.'],
] as const;

// Edit rows here. `win: true` marks a cell where the alternative beats Kavori.
export type Cell = { t: string; win?: string };
export const compare = {
  columns: [
    { name: 'Kavori', sub: 'Browser with sealed groups', us: true },
    { name: 'Ferdium', sub: 'Open-source app hub' },
    { name: 'Franz', sub: 'App hub' },
    { name: 'Wavebox', sub: 'Workspace browser' },
    { name: 'Firefox Containers', sub: 'Add-on for Firefox' },
  ],
  rows: [
    ['Price', [{ t: `One payment of ${site.price}` }, { t: 'Free', win: 'Lowest' }, { t: 'Free tier, paid plans' }, { t: 'Paid subscription plans' }, { t: 'Free', win: 'Lowest' }]],
    ['Two logins on one site', [{ t: 'Yes, one sealed session per group' }, { t: 'Yes, per service' }, { t: 'Yes, per service' }, { t: 'Yes' }, { t: 'Yes, cookies and site data only' }]],
    ['Everything else separated', [{ t: 'Cache, storage and permissions too' }, { t: 'Per service' }, { t: 'Per service' }, { t: 'Per workspace' }, { t: 'History and extensions are shared' }]],
    ['Future upgrades', [{ t: 'All free, included in your payment' }, { t: 'Free' }, { t: 'Included in your plan' }, { t: 'Included while you subscribe' }, { t: 'With Firefox' }]],
    ['Who handles security', [{ t: 'Us: Chromium fixes shipped as free updates' }, { t: 'Community volunteers' }, { t: 'The vendor' }, { t: 'The vendor' }, { t: 'Mozilla' }]],
    ['Best for', [{ t: 'Paying once and not thinking about it again' }, { t: 'Free, open source and self-managed' }, { t: 'Teams who want a managed hub' }, { t: 'Power users on a subscription' }, { t: 'People who live in Firefox' }]],
  ] as [string, Cell[]][],
};
