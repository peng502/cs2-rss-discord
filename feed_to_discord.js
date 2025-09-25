import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import { XMLParser } from 'fast-xml-parser';

const WEBHOOK_URL = process.env.DISCORD_WEBHOOK;
const FEED_URL = 'https://store.steampowered.com/feeds/news/app/730';
const STATE_FILE = path.join('.state.json');
const MAX_LINKS = 200;

async function main() {
  // 读取 RSS feed
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

  // 读取 state.json，如果不存在就初始化
  let state = { sentLinks: [] };
  if (fs.existsSync(STATE_FILE)) {
    try {
      state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      if (!state.sentLinks) state.sentLinks = [];
    } catch {
      state = { sentLinks: [] };
    }
  }

  // 找到未发送过的最新更新，按时间顺序
  const toSend = items
    .sort((a, b) => b.pubDate - a.pubDate)  // 最新在前
    .filter(it => !state.sentLinks.includes(it.link))
    .reverse();  // 发送顺序按时间从旧到新

  for (const it of toSend) {
    const content = `**CS2 Update**\n${it.title}\n${it.link}`;
    try {
      await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });
    } catch (err) {
      console.error('Failed to send to Discord:', err);
    }

    // 更新 state.json，每条发送后立即写入
    state.sentLinks.push(it.link);
    // 保留最近 MAX_LINKS 条
    state.sentLinks = state.sentLinks.slice(-MAX_LINKS);
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
