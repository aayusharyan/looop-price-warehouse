// A tiny local site (served on port 80 and reached as *.example.com via a host-resolver rule) used only to produce store screenshots. It renders a neutral "mail" page for whoever
// the `who` cookie says is logged in, so each Kavori group can show a different account on the same site.
const http = require('http');

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cookie = (req, k) => (req.headers.cookie || '').split(/;\s*/).map((p) => p.split('=')).find(([n]) => n === k)?.[1];

const MAILS = [
  ['Priya Nair', 'Roadmap review moved to Thursday', 'Can we shift it to 11? The design team is out until then.', '9:41'],
  ['Marcus Webb', 'Invoice 2041 is attached', 'Here is the invoice for last month. Payment terms are unchanged.', '9:12'],
  ['Lena Fischer', 'Brand guidelines, final round', 'Comments are in. Two small changes to the logo spacing page.', 'Mon'],
  ['Tomás Reyes', 'Quick question about the launch', 'Do we have the screenshots for the store listing yet?', 'Mon'],
  ['Aiko Tanaka', 'Notes from today', 'Thanks for joining. Summary and next steps below.', 'Sun'],
  ['Dev Patel', 'Re: onboarding copy', 'Looks good to me. One typo in the second paragraph.', 'Sun'],
];

function page(title, who, accent, unread) {
  const rows = MAILS.map(([n, s, p, t], i) => `<div class="row${i < unread ? ' unread' : ''}"><i style="background:${accent};opacity:${0.95 - i * 0.1}"></i><div class="tx"><b>${esc(n)}</b><span>${esc(s)}</span><small>${esc(p)}</small></div><time>${t}</time></div>`).join('');
  return `<!doctype html><meta charset="utf-8"><title>${esc(title)}</title>
<style>
*{box-sizing:border-box}body{margin:0;font:14px/20px -apple-system,"Segoe UI",system-ui,sans-serif;color:#1c1f24;background:#fff;display:flex;height:100vh;overflow:hidden}
nav{width:200px;padding:20px 14px;border-right:1px solid #eceef1;display:flex;flex-direction:column;gap:4px}
nav h2{margin:0 8px 14px;font-size:16px;letter-spacing:-.01em}nav a{padding:7px 10px;border-radius:8px;color:#4b515c}nav a.on{background:${accent}18;color:#1c1f24;font-weight:600}
main{flex:1;min-width:0;display:flex;flex-direction:column}
header{display:flex;align-items:center;gap:12px;padding:0 24px;height:60px;border-bottom:1px solid #eceef1}
header .s{flex:1;max-width:360px;height:34px;border-radius:17px;background:#f4f5f7;padding:7px 14px;color:#8a909b}
header .me{margin-left:auto;display:flex;align-items:center;gap:10px;font-weight:600}header .me i{width:32px;height:32px;border-radius:50%;background:${accent};color:#fff;display:flex;align-items:center;justify-content:center;font-style:normal}
.list{padding:8px 16px;overflow:hidden}.row{display:flex;gap:14px;align-items:center;padding:12px 10px;border-bottom:1px solid #f1f2f4}
.row i{width:36px;height:36px;border-radius:50%;flex:none}.tx{flex:1;min-width:0}.tx b,.tx span,.tx small{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tx small{color:#7b818c}.row.unread .tx b,.row.unread .tx span{font-weight:700}time{color:#7b818c;font-size:12.5px}
</style>
<nav><h2>Mail</h2><a class="on">Inbox</a><a>Starred</a><a>Sent</a><a>Drafts</a><a>Archive</a></nav>
<main><header><div class="s">Search mail</div><div class="me"><span>${esc(who)}</span><i>${esc(who[0])}</i></div></header><div class="list">${rows}</div></main>`;
}

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const who = decodeURIComponent(cookie(req, 'who') || 'Guest');
  const accent = decodeURIComponent(cookie(req, 'accent') || '#3F74E8');
  const dark = cookie(req, 'theme') === 'dark';
  const title = u.searchParams.get('t') || 'Inbox';
  const unread = +(u.searchParams.get('n') || 0);
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  const html = page(unread ? `(${unread}) ${title}` : title, who, accent, unread);
  res.end(dark ? html.replace('</style>', 'body{background:#1b1d21;color:#ecedf0}nav,header,.row{border-color:#2b2e34!important}header .s{background:#25282d;color:#9aa0ab}.tx small,time{color:#9aa0ab}nav a{color:#b3b9c3}nav a.on{color:#ecedf0}</style>') : html);
}).listen(80, '127.0.0.1');
