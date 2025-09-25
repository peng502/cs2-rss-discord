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

  let items = (data?.rss?.channel?.item || []).map(it => {
    let link = it.link.trim();
    // 确保使用中文链接
    if (!link.includes('?l=schinese')) {
      link += '?l=schinese';
    }
    return {
      title: it.title,
      link,
      pubDate: new Date(it.pubDate || 0).getTime()
    };
  });

  if (!items.length) {
    console.log('⚠️ 没有抓到任何新闻');
    return;
  }

  // 加点调试输出
  console.log('✅ RSS 抓到的新闻:');
  items.forEach(it => console.log(`- ${it.title} (${it.link})`));

  let state = { sentLinks: [] };
  if (fs.existsSync(STATE_FILE)) {
    state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  }

  console.log('🗂 已发送过的链接:', state.sentLinks);

  const toSend = items
    .sort((a, b) => b.pubDate - a.pubDate)
    .slice(0, 5)
    .filter(it => !state.sentLinks.includes(it.link))
    .reverse();

  console.log('📩 本次需要发送的新闻:', toSend.map(it => it.link));

  for (const it of toSend) {
    const content = `**CS2 Update**\n${it.title}\n${it.link}`;
    const resp = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    });

    if (!resp.ok) {
      console.error(`❌ 发送失败: ${resp.status} ${resp.statusText}`);
    } else {
      console.log(`✅ 已发送: ${it.title}`);
      state.sentLinks = [...state.sentLinks, it.link].slice(-100);
    }
  }

  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
