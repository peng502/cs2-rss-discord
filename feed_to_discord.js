import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import { XMLParser } from 'fast-xml-parser';

const WEBHOOK_URL = process.env.DISCORD_WEBHOOK;
const FEED_URL = 'https://store.steampowered.com/feeds/news/app/730';
const STATE_FILE = path.join('.state.json');
const MAX_LINKS = 200;

// 去 HTML + 截断
function cleanText(html = '', max = 300) {
  const text = html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? text.slice(0, max) + '…' : text;
}

async function main() {
  const res = await fetch(FEED_URL, {
    headers: { 'User-Agent': 'rss-to-discord-bot' }
  });

  const xml = await res.text();

  const parser = new XMLParser({
    ignoreAttributes: false,
    cdataPropName: 'cdata'
  });

  const data = parser.parse(xml);

  const items = (data?.rss?.channel?.item || []).map(it => {
    const desc = it.description || it['content:encoded'] || it.cdata || '';
    return {
      title: it.title,
      link: it.link,
      pubDate: new Date(it.pubDate || 0).getTime(),
      summary: cleanText(desc)
    };
  });

  if (!items.length) return;

  // 读取 state
  let state = { sentLinks: [] };
  if (fs.existsSync(STATE_FILE)) {
    try {
      state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      if (!state.sentLinks) state.sentLinks = [];
    } catch {
      state = { sentLinks: [] };
    }
  }

  // 找新内容
  const toSend = items
    .sort((a, b) => b.pubDate - a.pubDate)
    .filter(it => !state.sentLinks.includes(it.link))
    .reverse();

  for (const it of toSend) {
    const embed = {
      title: it.title,
      url: it.link,
      description: it.summary || 'New CS2 update',
      color: 15105570,
      timestamp: new Date(it.pubDate).toISOString(),
      author: {
        name: 'Counter-Strike 2 Update',
        icon_url: 'https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/730/capsule_184x69.jpg'
      },
      thumbnail: {
        url: 'https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/730/capsule_184x69.jpg'
      },
      footer: {
        text: 'Steam News'
      }
    };

    const content = `**CS2 Update**`;

    try {
      await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          embeds: [embed]
        })
      });
    } catch (err) {
      console.error('Discord send error:', err);
    }

    // 更新 state
    state.sentLinks.push(it.link);
    state.sentLinks = state.sentLinks.slice(-MAX_LINKS);

    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
