// super_masti_bot_v6_enhanced.js
const express = require('express');
const bodyParser = require('body-parser');
const login = require('ws3-fca');
const fs = require('fs');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

let botAPI = null;
let currentCookies = null;
let botActive = true;
let prefix = '/';
const handledMessageIds = new Map();
const lastReplyAt = {};
const THREAD_COOLDOWN_MS = 2000;

// Anti-out system - FIXED: Now properly mutable
let antiOutEnabled = true; // Changed from const to let
const lastActiveTime = {};
const ANTI_OUT_CHECK_INTERVAL = 60000; // 1 minute

// Schedule goodnight messages
let goodnightScheduled = false;

// Admin user ID (replace with your actual Facebook ID)
const ADMIN_USER_ID = '100021420605776'; // Change this to your FB ID

// Bot uptime tracking
let botStartTime = Date.now();
let isBotRunning = true;

// FIXED: Remove the 10-minute auto-stop interval
// The problematic interval that was stopping bot has been removed

// Anti-out monitoring - FIXED: Properly checks antiOutEnabled variable
setInterval(() => {
  if (!botAPI || !antiOutEnabled || !isBotRunning) return;
  const now = Date.now();
  Object.keys(lastActiveTime).forEach(threadID => {
    if (now - lastActiveTime[threadID] > 30*60*1000) { // 30 minutes inactive
      sendAntiOutMessage(threadID);
    }
  });
}, ANTI_OUT_CHECK_INTERVAL);

function pickRandom(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
function emitLog(msg,isErr=false){ const log = `[${new Date().toISOString()}] ${isErr?'ERROR':'INFO'}: ${msg}`; console.log(log); io.emit('botlog',log); }
function getMessageId(event){ return event.messageID || event.messageId || null; }
function containsEmoji(text){ return /[\p{Emoji}]/u.test(text); }

// === MEGA ENHANCED REPLY BANKS ===
const replies = {
  goodmorning:[
    "Good morning ☀️ uth jao lazy panda 😴 - AAHAN H3R3",
    "Good morning hero 😎 - AAHAN H3R3 zinda hai!",
    "Utho bhai! Chai thandi ho gayi 😂 - AAHAN H3R3",
    "Good morning! Smile karo 😄 - AAHAN H3R3",
    "Good morning! Aaj kuch mast karte hain 💪 - AAHAN H3R3",
    "Subah ho gayi mamu! uth jao 😆 - AAHAN H3R3"
  ],
  goodnight:[
    "Good night 🌙 sweet dreams 😴 - AAHAN H3R3",
    "Good night! Sapno me AAHAN H3R3 ko mat bhoolna 😜",
    "Chalo so jao warna phone garam ho jayega 🔥 - AAHAN H3R3",
    "Good night baby 💞 - AAHAN H3R3",
    "Good night! Khush raho aur so jao 😴 - AAHAN H3R3",
    "Raat bhar mere khayal aaye to message kar dena 🌙 - AAHAN H3R3"
  ],
  hi:[
    "Hi cutie 😍 - AAHAN H3R3",
    "Hi bhai, kya scene hai 😂 - AAHAN H3R3",
    "Hi! Lagta hai bore ho rahe ho 🤭 - AAHAN H3R3",
    "Hi sunshine ☀️ - AAHAN H3R3",
    "Hi! Tumhara swag to kamaal hai 😎 - AAHAN H3R3",
    "Hi handsome/beautiful! 😉 - AAHAN H3R3"
  ],
  hello:[
    "Hello ji 😍 kya haal hai? - AAHAN H3R3",
    "Are hello bolke dil chura liya 😜 - AAHAN H3R3",
    "Hello! Koi kaam hai ya timepass 😆 - AAHAN H3R3",
    "Hello hello! Mujhe yaad kar liya kya 😏 - AAHAN H3R3",
    "Hello boss, kya haal chaal 😎 - AAHAN H3R3",
    "Hello jaan! Kaisi ho? ❤️ - AAHAN H3R3"
  ],
  bot:[
    "Kya hua bhai, bot ko yaad kiya 😏 - AAHAN H3R3",
    "Main hu bot AAHAN H3R3, tera dost 😎",
    "Bot busy hai memes banane me 😂 - AAHAN H3R3",
    "Bula liya mujhe firse 😜 - AAHAN H3R3",
    "Bot aaya swag ke sath 😈 - AAHAN H3R3",
    "Haan bhai bata, AAHAN H3R3 hi hoon! 🤖"
  ],
  emoji:[
    "Nice emoji 😍 - AAHAN H3R3",
    "Hahaha tu to killer hai 😂 - AAHAN H3R3",
    "Emoji dekh ke dil khush ho gaya 😆 - AAHAN H3R3",
    "Ye emoji mujhe bhi pasand hai 😜 - AAHAN H3R3",
    "Kya emoji spam chalu hai kya 🤣 - AAHAN H3R3",
    "Emoji queen/king lag rahe ho! 👑 - AAHAN H3R3"
  ],
  shayari:[
    "Dil ki baat labon pe aayi nahi 😔\nKehne ko bahut kuch tha par kahi nahi - AAHAN H3R3",
    "Tere jaise dost mile to zindagi easy lagti hai 💕\nHar gam bhul jate hai hasi lagti hai - AAHAN H3R3",
    "Raat ki tanhai me tera khayal aaya 😌\nPhir subah tak teri yaad sataye - AAHAN H3R3",
    "Chandni raat me teri yaad sataye 🌙\nDil dhadke aur palkein jhukaye - AAHAN H3R3",
    "Pyaar ka rang kuch aur hi hota hai ❤️\nJab tum saath ho maza kuch aur hi hota hai - AAHAN H3R3",
    "Tere ishq ne badal di hai zindagi meri 💫\nAb toh har pal tumse hi hai mulakat meri - AAHAN H3R3",
    "Aankhon mein base ho tum, dil mein basa hai pyaar 😍\nTum mile zindagi ko mil gaya sansaar - AAHAN H3R3",
    "Mohabbat ki hai yeh dastaan 💖\nTum ho meri pehli aur aakhri armaan - AAHAN H3R3"
  ],
  gana:[
    "Aaj mood me hoon mai full on music 🎶 - AAHAN H3R3",
    "Gaane ke bina din adhoora lagta hai 🎵 - AAHAN H3R3",
    "Masti ke liye bass aur beat chahiye 🔊 - AAHAN H3R3",
    "Yeh gana to super hit hai 😎 - AAHAN H3R3",
    "Chalo dance karte hain song ke saath 💃 - AAHAN H3R3",
    "Music is life 🎧 and AAHAN H3R3 is your DJ! 🎶"
  ],
  flirt:[
    "Aankhein mila ke dekho toh pata chalega 😉\nTumhare dil mein bhi koi jagah hai ya nahi? - AAHAN H3R3",
    "Tumhare saath time bitana accha lagta hai ❤️\nJaise chand ko tare mil jaye - AAHAN H3R3",
    "Kya tumhare dil me bhi koi hai ya jagah khali hai? 😏\nMeri taraf se puch raha hoon samjhe? - AAHAN H3R3",
    "Tumhara smile toh mere din ko bright kar deta hai ☀️\nJaise suraj ki kirne andhera mitaye - AAHAN H3R3",
    "Koi tume bataya hai ki tum kitni cute ho? 😍\nNahi toh main bata du? - AAHAN H3R3",
    "Tumhare bina group adhoora lagta hai 💫\nJaise biryani mein namak nahi - AAHAN H3R3",
    "Tumse baat karke aisa lagta hai 🌟\nJaise koi hit movie dekhi ho - AAHAN H3R3",
    "Tumhara har message dil ko chhu jata hai 💓\nJaise koi soft song playing ho - AAHAN H3R3",
    "Kya tum mere liye special ho? 🤔\nKyuki tumhare aate hi mera mood special ho jata hai! - AAHAN H3R3",
    "Tumhe dekh ke lagta hai 😘\nShayad main pyaar mein pad gaya hoon! - AAHAN H3R3"
  ],
  roast:[
    "Tere jaise logo ko dekh ke lagta hai nature ne experiment kiya tha 😂\nPar result aaya fail! - AAHAN H3R3",
    "Tera attitude dekh ke lagta hai tuition fees zyada di hai 🤣\nPar padhai nahi hui! - AAHAN H3R3",
    "Tujhe dekh ke lagta hai WiFi slow ho gaya 😆\nBuffering... buffering... - AAHAN H3R3",
    "Tere jokes sun ke hasi nahi aati, tension aati hai 😜\nDoctor ko dikhana padega! - AAHAN H3R3",
    "Tera swag dekh ke lagta hai offer lag gaya 🤪\n50% off on common sense! - AAHAN H3R3",
    "Tere face pe expression dekh ke lagta hai 😎\nAndroid user hai kya? - AAHAN H3R3",
    "Teri timing dekh ke lagta hai ⏰\nTrain chut gayi na? - AAHAN H3R3",
    "Tere replies dekh ke lagta hai 🐢\n2G network chal raha hai kya? - AAHAN H3R3"
  ],
  masti:[
    "Party shuru kar do! 🎉 - AAHAN H3R3",
    "Koi joke sunao ya main sunau? 😄 - AAHAN H3R3",
    "Aaj kya plan hai masti ka? 🤔 - AAHAN H3R3",
    "Hum hain naye zamane ke rockstars! 🤘 - AAHAN H3R3",
    "Masti karo par parents ko pata na chale 😎 - AAHAN H3R3",
    "Aaj to full mood hai masti ka! 💃🕺 - AAHAN H3R3"
  ],
  jokes:[
    "Teacher: Bachcho, batado 5 aise fruits jinke pehle letter 'A' aata ho?\nStudent: Apple, Apple, Apple, Apple, Apple!\nTeacher: Itne apples? 😂 - AAHAN H3R3",
    
    "Ek boyfriend apni girlfriend ko leke garden gaya...\nGirlfriend: Baby dekho, titli! 🦋\nBoyfriend: Kahan? Kahan? Menu kha rahi hai kya? 😆 - AAHAN H3R3",
    
    "Santa: Doctor sahab, main so nahi pata!\nDoctor: Yeh tablet raat ko sone se pehle lena.\nSanta: Par main so nahi pata to tablet kaise loon? 🤣 - AAHAN H3R3",
    
    "2 mosquitoes baat kar rahe the...\n1st: Kal party hai kya?\n2nd: Nahin yaar, kal toh fasting hai... koi blood nahi milega! 🦟 - AAHAN H3R3",
    
    "Teacher: Agar tumhare pocket me 100 rupees hai aur tumne 80 rupees kharch kiye to kya bachega?\nStudent: Jeb kharab hogi mam! 💰 - AAHAN H3R3",
    
    "Wife: Darling, meri ek chhoti si wish poori karoge?\nHusband: Zaroor sweetheart!\nWife: Chhoti si CAR le aao! 🚗 - AAHAN H3R3",
    
    "Patient: Doctor, main mar toh nahi jaunga na?\nDoctor: Nahi nahi, aap bilkul theek ho jaoge!\nPatient: Pakka?\nDoctor: Bill toh aapke warison ko dena padega! 💀 - AAHAN H3R3",
    
    "Santa bank gaya...\nSanta: Mujhe loan chahiye!\nManager: Collateral do.\nSanta: Mere pass Santa Claus hai! 🎅 - AAHAN H3R3"
  ],
  mazedaar:[
    "Yaar aaj toh maza aa gaya! 😝\nJaise biryani mein extra raita mil gaya! - AAHAN H3R3",
    
    "Life ek jhooth hai 😜\nPar mere jokes sach hai! - AAHAN H3R3",
    
    "Tension leneka nahi 😎\nDene ka hai! - AAHAN H3R3",
    
    "Aaj kal main bahut busy hoon 🤪\nKuch karna nahi hai par busy hoon! - AAHAN H3R3",
    
    "Smartphone ne life easy kar di 🥴\nPar pocket heavy! - AAHAN H3R3",
    
    "Weekend plan kya hai? 🤔\nSona, khana, phone chalana, repeat! - AAHAN H3R3",
    
    "Mera attitude aisa hai 😼\nJaise result aaye fail par confidence ho full! - AAHAN H3R3",
    
    "Zindagi ek struggle hai 💪\nGroup chat mein active rehna usse badi struggle! - AAHAN H3R3"
  ]
};

// Audio files database
const audioFiles = {
  romantic: ["song1.mp3", "song2.mp3", "song3.mp3"],
  party: ["party1.mp3", "party2.mp3", "party3.mp3"],
  sad: ["sad1.mp3", "sad2.mp3", "sad3.mp3"]
};

// Help command content - FIXED: Now shows to everyone
const helpMessage = `
🤖 *AAHAN H3R3 BOT COMMANDS* 🤖

🛠️ *Basic Commands:*
/start - Bot activate kare
/stop - Bot deactivate kare  
/help - Ye help message dikhaye

😊 *Greetings:*
"good morning" - Morning wishes
"good night" or "gn" - Night wishes
"hi" or "hello" - Greetings

🎭 *Fun Commands:*
/flirt - Romantic messages
/roast - Funny roasting
/masti - General fun
/joke - Funny jokes
/mazedaar - Mazedaar baatein
/shayari - Heart touching shayari

🎵 *Entertainment:*
"gana" or "song" - Music related
Emoji spam - Emoji reactions

🛡️ *Admin Controls:*
/antion - Anti-out system on
/antioff - Anti-out system off
/status - Bot status check

⏰ *Auto Features:*
- Automatic goodnight at 12 AM
- Anti-out system for inactive groups
- Smart replies for common phrases

*AAHAN H3R3 - Har group ko active rakhega!* 🚀
`;

// === BOT INIT ===
function initializeBot(cookies){
  currentCookies = cookies;
  login({ appState: cookies }, (err,api)=>{
    if(err){ emitLog('Login error: '+err.message,true); setTimeout(()=>initializeBot(cookies),10000); return;}
    botAPI = api;
    botAPI.setOptions({ selfListen:true, listenEvents:true });
    emitLog('✅ Bot logged in as AAHAN H3R3.');
    botStartTime = Date.now();
    isBotRunning = true;
    
    // Schedule goodnight messages
    if (!goodnightScheduled) {
      scheduleGoodnightMessages();
      goodnightScheduled = true;
    }
    
    startListening(api);
  });
}

// === SCHEDULE GOODNIGHT MESSAGES ===
function scheduleGoodnightMessages() {
  const now = new Date();
  const nightTime = new Date();
  nightTime.setHours(24, 0, 0, 0); // 12:00 AM
  
  const timeUntilNight = nightTime.getTime() - now.getTime();
  
  setTimeout(() => {
    sendScheduledGoodnight();
    // Schedule for next day
    setInterval(sendScheduledGoodnight, 24 * 60 * 60 * 1000);
  }, timeUntilNight);
  
  emitLog(`Goodnight messages scheduled for 12:00 AM`);
}

async function sendScheduledGoodnight() {
  if (!botAPI || !isBotRunning) return;
  
  try {
    // Get all threads the bot is in
    const threadList = await botAPI.getThreadList(100, null, []);
    
    for (const thread of threadList) {
      if (thread.isGroup) {
        const goodnightMsg = `🌙 *Good Night Everyone!* 🌙\n\n${pickRandom(replies.goodnight)}\n\n${pickRandom(replies.shayari)}\n\nSweet dreams! 😴💫 - AAHAN H3R3`;
        await botAPI.sendMessage(goodnightMsg, thread.threadID);
        emitLog(`Sent scheduled goodnight to ${thread.name}`);
        
        // Wait 2 seconds between messages to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  } catch (error) {
    emitLog('Error sending scheduled goodnight: ' + error.message, true);
  }
}

// === ANTI-OUT SYSTEM ===
async function sendAntiOutMessage(threadID) {
  if (!botAPI || !isBotRunning) return;
  
  try {
    const antiOutMessages = [
      "Kya hua? Sab so gaye kya? 😴 AAHAN H3R3 ko yaad kar lo!",
      "Group mein koi hai? 🎤 AAHAN H3R3 zinda hai!",
      "Kya scene hai? Chat band ho gayi? 😂 AAHAN H3R3 active hai!",
      "Hello? Koi zinda hai? 🔥 AAHAN H3R3 yahan hai!",
      "Kya ho gaya group ko? Masti karo! 🎉 - AAHAN H3R3",
      `${pickRandom(replies.jokes)}\n\nGroup toh jinda karo! - AAHAN H3R3`
    ];
    
    await botAPI.sendMessage(pickRandom(antiOutMessages), threadID);
    lastActiveTime[threadID] = Date.now();
    emitLog(`Sent anti-out message to thread ${threadID}`);
  } catch (error) {
    emitLog('Anti-out message error: ' + error.message, true);
  }
}

// === ENHANCED LISTENER ===
function startListening(api){
  api.listenMqtt(async (err,event)=>{
    if(err) return emitLog('Listener error: '+err.message,true);
    if(!event || (event.type!=='message' && event.type!=='message_reply')) return;
    const { threadID,senderID,body } = event;
    if(!body) return;

    try{
      // Update last active time for anti-out
      lastActiveTime[threadID] = Date.now();

      // ignore bot messages
      const myID = api.getCurrentUserID ? api.getCurrentUserID() : null;
      if(myID && String(senderID)===String(myID)) return;

      // dedupe
      const mid = getMessageId(event);
      if(mid && handledMessageIds.has(mid)) return;
      if(mid) handledMessageIds.set(mid,Date.now());

      // thread cooldown
      const now = Date.now();
      if(lastReplyAt[threadID] && now-lastReplyAt[threadID]<THREAD_COOLDOWN_MS) return;

      const text = body.toString().trim().toLowerCase();

      // FIXED: Help command now works for everyone
      if(text === `${prefix}help`) {
        await api.sendMessage(helpMessage, threadID);
        return;
      }

      // FIXED: Admin-only commands properly check admin ID
      const isAdmin = String(senderID) === String(ADMIN_USER_ID);
      
      // Enhanced commands - FIXED: Anti-out commands now work properly
      if(text===`${prefix}stop`){ 
        if(isAdmin) {
          botActive=false; 
          lastReplyAt[threadID]=Date.now(); 
          await api.sendMessage("🤖 Bot stopped! Silent mode ON. - AAHAN H3R3",threadID); 
        } else {
          await api.sendMessage("❌ Sorry, ye command sirf admin use kar sakte hain! - AAHAN H3R3",threadID);
        }
        return;
      }
      
      if(text===`${prefix}start`){ 
        if(isAdmin) {
          botActive=true; 
          lastReplyAt[threadID]=Date.now(); 
          await api.sendMessage("🤖 Bot started! Ready to reply 😎 - AAHAN H3R3",threadID); 
        } else {
          await api.sendMessage("❌ Sorry, ye command sirf admin use kar sakte hain! - AAHAN H3R3",threadID);
        }
        return;
      }
      
      if(text===`${prefix}antion`){ 
        if(isAdmin) {
          antiOutEnabled=true; 
          await api.sendMessage("🛡️ Anti-out system activated! - AAHAN H3R3",threadID); 
        } else {
          await api.sendMessage("❌ Sorry, ye command sirf admin use kar sakte hain! - AAHAN H3R3",threadID);
        }
        return;
      }
      
      if(text===`${prefix}antioff`){ 
        if(isAdmin) {
          antiOutEnabled=false; 
          await api.sendMessage("🛡️ Anti-out system deactivated! - AAHAN H3R3",threadID); 
        } else {
          await api.sendMessage("❌ Sorry, ye command sirf admin use kar sakte hain! - AAHAN H3R3",threadID);
        }
        return;
      }
      
      if(text===`${prefix}status`){ 
        const uptime = Math.floor((Date.now() - botStartTime) / 1000);
        const hours = Math.floor(uptime / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const seconds = uptime % 60;
        
        const statusMessage = `🤖 *AAHAN H3R3 BOT STATUS* 🤖

📊 Bot Status: ${botActive ? '🟢 ACTIVE' : '🔴 INACTIVE'}
🛡️ Anti-Out: ${antiOutEnabled ? '🟢 ON' : '🔴 OFF'}
⏰ Uptime: ${hours}h ${minutes}m ${seconds}s
🔧 Features: Jokes, Flirting, Shayari, Roasting, Masti
🎯 Admin: ${isAdmin ? '🟢 YOU' : '🔴 Not Admin'}

*AAHAN H3R3 - Forever Running!* 🚀`;
        
        await api.sendMessage(statusMessage, threadID);
        return;
      }

      // Public commands available to everyone
      if(text===`${prefix}flirt`){ lastReplyAt[threadID]=Date.now(); await api.sendMessage(pickRandom(replies.flirt),threadID); return;}
      if(text===`${prefix}roast`){ lastReplyAt[threadID]=Date.now(); await api.sendMessage(pickRandom(replies.roast),threadID); return;}
      if(text===`${prefix}masti`){ lastReplyAt[threadID]=Date.now(); await api.sendMessage(pickRandom(replies.masti),threadID); return;}
      if(text===`${prefix}joke`){ lastReplyAt[threadID]=Date.now(); await api.sendMessage(pickRandom(replies.jokes),threadID); return;}
      if(text===`${prefix}mazedaar`){ lastReplyAt[threadID]=Date.now(); await api.sendMessage(pickRandom(replies.mazedaar),threadID); return;}
      if(text===`${prefix}shayari`){ 
        lastReplyAt[threadID]=Date.now(); 
        const shayari = pickRandom(replies.shayari);
        await api.sendMessage(`📜 *Shayari Time!* 📜\n\n"${shayari}"\n\n- AAHAN H3R3 💫`,threadID); 
        return;
      }
      
      if(!botActive) return;

      // Enhanced reply detection
      let replyText = null;
      if(text.includes('good morning')) replyText = pickRandom(replies.goodmorning);
      else if(text.includes('good night') || text==='gn') replyText = pickRandom(replies.goodnight);
      else if(text.includes('hi')) replyText = pickRandom(replies.hi);
      else if(text.includes('hello')) replyText = pickRandom(replies.hello);
      else if(text.includes('bot')) replyText = pickRandom(replies.bot);
      else if(text.includes('shayari')) replyText = `📜 ${pickRandom(replies.shayari)}`;
      else if(text.includes('gana') || text.includes('song')) replyText = pickRandom(replies.gana);
      else if(text.includes('flirt') || text.includes('pyar')) replyText = pickRandom(replies.flirt);
      else if(text.includes('roast')) replyText = pickRandom(replies.roast);
      else if(text.includes('masti')) replyText = pickRandom(replies.masti);
      else if(text.includes('joke') || text.includes('haso')) replyText = pickRandom(replies.jokes);
      else if(text.includes('mazedaar') || text.includes('maza')) replyText = pickRandom(replies.mazedaar);
      else if(containsEmoji(text)) replyText = pickRandom(replies.emoji);
      
      // Smart replies for common phrases
      else if(text.includes('kya kar rahe') || text.includes('what are you doing')) 
        replyText = "Tumhare saath baat kar raha hoon 😉 - AAHAN H3R3";
      else if(text.includes('miss you') || text.includes('yaad aaye'))
        replyText = "Main bhi tumko miss kar raha hoon ❤️ - AAHAN H3R3";
      else if(text.includes('bore') || text.includes('boring'))
        replyText = `${pickRandom(replies.jokes)}\n\nAb bore nahi lagega! - AAHAN H3R3`;
      else if(text.includes('single') || text.includes('akela'))
        replyText = "Don't worry, AAHAN H3R3 tumhare saath hai 😎";
      else if(text.includes('tension') || text.includes('stress'))
        replyText = `${pickRandom(replies.mazedaar)}\n\nTension mat lo! - AAHAN H3R3`;

      if(replyText){
        lastReplyAt[threadID]=Date.now();
        let name='User';
        try{ const info=await api.getUserInfo(senderID); name=info[senderID]?.name||name; }catch{}
        await api.sendMessage({ body:`@${name} ${replyText}`, mentions:[{ tag:name,id:senderID }]},threadID);
      }
    }catch(e){ emitLog('Handler error: '+e.message,true); }
  });
}

// === EXPRESS SERVER ===
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended:true }));
app.use(express.static('public'));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/configure',(req,res)=>{
  try{
    const cookies=typeof req.body.cookies==='string'?JSON.parse(req.body.cookies):req.body.cookies;
    if(!Array.isArray(cookies)||!cookies.length) return res.status(400).send('Invalid cookies');
    currentCookies=cookies;
    fs.writeFileSync('config.json',JSON.stringify({cookies},null,2));
    initializeBot(cookies);
    res.send('Bot configured & starting as AAHAN H3R3...');
  }catch(e){ res.status(400).send('Config error: '+e.message); }
});

// New endpoint for bot control
app.post('/control', (req, res) => {
  const { action } = req.body;
  switch(action) {
    case 'start':
      botActive = true;
      res.send('Bot activated - AAHAN H3R3');
      break;
    case 'stop':
      botActive = false;
      res.send('Bot deactivated');
      break;
    case 'status':
      const uptime = Math.floor((Date.now() - botStartTime) / 1000);
      const hours = Math.floor(uptime / 3600);
      const minutes = Math.floor((uptime % 3600) / 60);
      res.json({ 
        active: botActive, 
        antiOut: antiOutEnabled,
        name: 'AAHAN H3R3 Bot',
        uptime: `${hours}h ${minutes}m`,
        running: isBotRunning,
        features: ['jokes', 'flirting', 'shayari', 'roasting', 'masti', 'anti-out', 'scheduled messages']
      });
      break;
    default:
      res.status(400).send('Unknown action');
  }
});

// autoload
try{
  if(fs.existsSync('config.json')){
    const data=JSON.parse(fs.readFileSync('config.json','utf8'));
    if(data.cookies && data.cookies.length) initializeBot(data.cookies);
  }
}catch(e){ emitLog('Config load error: '+e.message,true); }

const PORT = process.env.PORT||20018;
server.listen(PORT,()=>emitLog(`AAHAN H3R3 Server running on port ${PORT} - Bot will run forever until manually stopped!`));
