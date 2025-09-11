import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import { XMLParser } from 'fast-xml-parser';

const WEBHOOK_URL = process.env.DISCORD_WEBHOOK;
const FEED_URL = 'https://store.steampowered.com/feeds/news/app/730';
const STATE_FILE = path.join('.state.json');

async function main() {
  const res = await fetch(FEED_URL, { headers: { 'User-Agent': 'rss2discord' } });
  const xml = await res.text();

  const parser = new XMLParser({ ignoreAttributes: false });
  const data = parser.parse(xml);

  const items = (data?.rss?.channel?.item || []).map(it => ({
    title: it.title,
    link: it.link,
    pubDate: new Date(it.pubDate || 0).getTime()
  }));

  if (!items.length) return;

  let state = { sentLinks: [] };
  if (fs.existsSync(STATE_FILE)) {
    state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  }

  const toSend = items
    .sort((a, b) => b.pubDate - a.pubDate)
    .slice(0, 5)
    .filter(it => !state.sentLinks.includes(it.link))
    .reverse();

  for (const it of toSend) {
    const content = `**CS2 Update**\n${it.title}\n${it.link}`;
    await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    });
    state.sentLinks = [...state.sentLinks, it.link].slice(-100);
  }

  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
