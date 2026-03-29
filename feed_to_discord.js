import fs from 'fs';
import path from 'path';
import { XMLParser } from 'fast-xml-parser';

const WEBHOOK_URL = process.env.DISCORD_WEBHOOK;
const FEED_URL = 'https://store.steampowered.com/feeds/news/app/730';
const STATE_FILE = path.join(process.cwd(), '.state.json');
const MAX_LINKS = 200;

// Helper to prevent hitting Discord's rate limit
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  if (!WEBHOOK_URL) {
    console.error("❌ Error: DISCORD_WEBHOOK secret is missing or empty.");
    process.exit(1); 
  }

  let res;
  try {
    // Disguise the request as a standard web browser to bypass basic CDN blocks
    res = await fetch(FEED_URL, { 
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*'
      } 
    });
  } catch (err) {
    // If Steam forcefully drops the connection, exit gracefully (Exit 0) instead of failing the workflow
    console.error("⚠️ Network error fetching Steam feed. Steam likely dropped the connection:", err.message);
    return; 
  }

  if (!res.ok) {
    console.error(`⚠️ Steam feed returned HTTP ${res.status}. Exiting safely until next run.`);
    return;
  }

  const xml = await res.text();

  // Force 'item' to ALWAYS be parsed as an array to prevent .map() crashes
  const parser = new XMLParser({ 
    ignoreAttributes: false,
    isArray: (name) => name === 'item' 
  });
  
  const data = parser.parse(xml);
  const channelItems = data?.rss?.channel?.item || [];

  const items = channelItems.map(it => ({
    title: it.title,
    link: it.link,
    pubDate: new Date(it.pubDate || 0).getTime()
  }));

  if (!items.length) {
    console.log("No items found in the feed at this time.");
    return;
  }

  let state = { sentLinks: [] };
  if (fs.existsSync(STATE_FILE)) {
    try {
      state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      if (!state.sentLinks) state.sentLinks = [];
    } catch {
      state = { sentLinks: [] };
    }
  }

  const toSend = items
    .sort((a, b) => b.pubDate - a.pubDate)  
    .filter(it => !state.sentLinks.includes(it.link))
    .reverse();  

  for (const it of toSend) {
    const content = `**CS2 Update**\n${it.title}\n${it.link}`;
    try {
      const hookRes = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });
      
      if (!hookRes.ok) console.error(`❌ Discord webhook rejected message: HTTP ${hookRes.status}`);
    } catch (err) {
      console.error('❌ Failed to send to Discord:', err);
    }

    state.sentLinks.push(it.link);
    state.sentLinks = state.sentLinks.slice(-MAX_LINKS);
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

    // Wait 1.5 seconds between messages so Discord doesn't block the webhook
    await sleep(1500); 
  }
}

main().catch(err => {
  console.error("Unhandled execution error:", err);
  process.exit(1);
});
