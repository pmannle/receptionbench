import { selectExample, createBrief } from './model.mjs';
import { destinations } from './config.mjs';

const menu = document.querySelector('.menu-button');
const navigation = document.querySelector('#navigation');
menu.addEventListener('click', () => {
  const open = menu.getAttribute('aria-expanded') !== 'true';
  menu.setAttribute('aria-expanded', String(open));
  navigation.classList.toggle('open', open);
});
navigation.addEventListener('click', event => {
  if (event.target.closest('a')) {
    menu.setAttribute('aria-expanded', 'false');
    navigation.classList.remove('open');
  }
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && menu.getAttribute('aria-expanded') === 'true') {
    menu.setAttribute('aria-expanded', 'false');
    navigation.classList.remove('open');
    menu.focus();
  }
});
const setText = (id, value) => { document.getElementById(id).textContent = value; };
document.querySelectorAll('[data-case]').forEach(button => button.addEventListener('click', () => {
  const example = selectExample(button.dataset.case);
  document.querySelectorAll('[data-case]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
  for (const key of ['goal', 'claim', 'verdict', 'summary', 'rule', 'explanation']) setText(`case-${key}`, example[key]);
  document.querySelector('#case-verdict').dataset.verdict = example.verdict;
  const receipts = example.receipts.map(receipt => {
    const row = document.createElement('li');
    const icon = document.createElement('span');
    icon.className = 'receipt-icon';
    icon.dataset.state = receipt.state;
    icon.textContent = ({ yes: '✓', no: '×', neutral: '·', unknown: '?' })[receipt.state];
    icon.setAttribute('aria-hidden', 'true');
    const content = document.createElement('div');
    const heading = document.createElement('strong');
    heading.textContent = receipt.title;
    const detail = document.createElement('p');
    detail.textContent = receipt.detail;
    content.append(heading, detail);
    const time = document.createElement('time');
    time.textContent = receipt.time;
    row.append(icon, content, time);
    return row;
  });
  document.querySelector('#receipts').replaceChildren(...receipts);
}));
document.querySelector('.copy-command').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(document.querySelector('#commands').textContent);
    setText('copy-status', 'Commands copied. Use a fresh output directory for each run.');
  } catch {
    const range = document.createRange();
    range.selectNodeContents(document.querySelector('#commands'));
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    setText('copy-status', 'Commands selected. Use your browser’s Copy command.');
  }
});
document.querySelector('#participation-form').addEventListener('submit', event => {
  event.preventDefault();
  const fields = new FormData(event.currentTarget);
  const text = createBrief({ role: fields.get('role'), system: fields.get('system'), profile: fields.get('profile') });
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'receptionbench-participation-brief.txt';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  setText('brief-status', 'Brief prepared for download. No information has been submitted.');
});
// Only render verified, owner-configured destinations; never invent a public URL.
const links = document.querySelector('#destination-links');
links.replaceChildren();
if (destinations.repositoryUrl) {
  try {
    const url = new URL(destinations.repositoryUrl);
    if (url.protocol === 'https:') {
      const link = document.createElement('a');
      link.href = `${url.href.replace(/\/$/, '')}/issues/new/choose`;
      link.className = 'text-link';
      link.textContent = 'Propose a contribution ↗';
      links.append(link);
    }
  } catch { /* Leave the local participation instructions visible. */ }
}
if (/^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/.test(destinations.contactEmail)) {
  const link = document.createElement('a');
  link.href = `mailto:${destinations.contactEmail}`;
  link.className = 'text-link';
  link.textContent = 'Email your brief ↗';
  links.append(link);
}
if (links.childElementCount) {
  document.querySelector('#destination-note').replaceChildren();
  const note = document.createElement('p');
  note.textContent = 'Open an issue with your proposed adapter or evidence case, or email your brief. Downloading a brief does not submit it or enroll your system.';
  document.querySelector('#destination-note').append(note);
}
