// super_masti_bot_v4.js
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

setInterval(() => {
  const now = Date.now();
  for (const [mid, t] of handledMessageIds) {
    if (now - t > 10*60*1000) handledMessageIds.delete(mid);
  }
}, 5*60*1000);

function pickRandom(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
function emitLog(msg,isErr=false){ const log = [${new Date().toISOString()}] ${isErr?'ERROR':'INFO'}: ${msg}; console.log(log); io.emit('botlog',log); }
function getMessageId(event){ return event.messageID || event.messageId || null; }
function containsEmoji(text){ return /[\p{Emoji}]/u.test(text); }

// === REPLY BANKS ===
const replies = {
  goodmorning:[
    "Good morning ☀️ uth jao lazy panda 😴",
    "Good morning hero 😎",
    "Utho bhai! Chai thandi ho gayi 😂",
    "Good morning! Smile karo 😄",
    "Good morning! Aaj kuch mast karte hain 💪"
  ],
  goodnight:[
    "Good night 🌙 sweet dreams 😴",
    "Good night! Sapno me mujhe mat bhoolna 😜",
    "Chalo so jao warna phone garam ho jayega 🔥",
    "Good night baby 💞",
    "Good night! Khush raho aur so jao 😴"
  ],
  hi:[
    "Hi cutie 😍",
    "Hi bhai, kya scene hai 😂",
    "Hi! Lagta hai bore ho rahe ho 🤭",
    "Hi sunshine ☀️",
    "Hi! Tumhara swag to kamaal hai 😎"
  ],
  hello:[
    "Hello ji 😍 kya haal hai?",
    "Are hello bolke dil chura liya 😜",
    "Hello! Koi kaam hai ya timepass 😆",
    "Hello hello! Mujhe yaad kar liya kya 😏",
    "Hello boss, kya haal chaal 😎"
  ],
  bot:[
    "Kya hua bhai, bot ko yaad kiya 😏",
    "Main hu bot, tera dost 😎",
    "Bot busy hai memes banane me 😂",
    "Bula liya mujhe firse 😜",
    "Bot aaya swag ke sath 😈"
  ],
  emoji:[
    "Nice emoji 😍",
    "Hahaha tu to killer hai 😂",
    "Emoji dekh ke dil khush ho gaya 😆",
    "Ye emoji mujhe bhi pasand hai 😜",
    "Kya emoji spam chalu hai kya 🤣"
  ],
  shayari:[
    "Dil ki baat labon pe aayi nahi 😔",
    "Tere jaise dost mile to zindagi easy lagti hai 💕",
    "Raat ki tanhai me tera khayal aaya 😌",
    "Chandni raat me teri yaad sataye 🌙",
    "Pyaar ka rang kuch aur hi hota hai ❤️"
  ],
  gana:[
    "Aaj mood me hoon mai full on music 🎶",
    "Gaane ke bina din adhoora lagta hai 🎵",
    "Masti ke liye bass aur beat chahiye 🔊",
    "Yeh gana to super hit hai 😎",
    "Chalo dance karte hain song ke saath 💃"
  ]
};

// === BOT INIT ===
function initializeBot(cookies){
  currentCookies = cookies;
  login({ appState: cookies }, (err,api)=>{
    if(err){ emitLog('Login error: '+err.message,true); setTimeout(()=>initializeBot(cookies),10000); return;}
    botAPI = api;
    botAPI.setOptions({ selfListen:true, listenEvents:true });
    emitLog('✅ Bot logged in.');
    startListening(api);
  });
}

// === LISTENER ===
function startListening(api){
  api.listenMqtt(async (err,event)=>{
    if(err) return emitLog('Listener error: '+err.message,true);
    if(!event || (event.type!=='message' && event.type!=='message_reply')) return;
    const { threadID,senderID,body } = event;
    if(!body) return;

    try{
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

      // commands
      if(text===`${prefix}stop`){ botActive=false; lastReplyAt[threadID]=Date.now(); await api.sendMessage("🤖 Bot stopped! Silent mode ON.",threadID); return;}
      if(text===`${prefix}start`){ botActive=true; lastReplyAt[threadID]=Date.now(); await api.sendMessage("🤖 Bot started! Ready to reply 😎",threadID); return;}
      if(!botActive) return;

      // decide reply
      let replyText = null;
      if(text.includes('good morning')) replyText = pickRandom(replies.goodmorning);
      else if(text.includes('good night') || text==='gn') replyText = pickRandom(replies.goodnight);
      else if(text.includes('hi')) replyText = pickRandom(replies.hi);
      else if(text.includes('hello')) replyText = pickRandom(replies.hello);
      else if(text.includes('bot')) replyText = pickRandom(replies.bot);
      else if(text.includes('shayari')) replyText = pickRandom(replies.shayari);
      else if(text.includes('gana')) replyText = pickRandom(replies.gana);
      else if(containsEmoji(text)) replyText = pickRandom(replies.emoji);

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
app.post('/configure',(req,res)=>{
  try{
    const cookies=typeof req.body.cookies==='string'?JSON.parse(req.body.cookies):req.body.cookies;
    if(!Array.isArray(cookies)||!cookies.length) return res.status(400).send('Invalid cookies');
    currentCookies=cookies;
    fs.writeFileSync('config.json',JSON.stringify({cookies},null,2));
    initializeBot(cookies);
    res.send('Bot configured & starting...');
  }catch(e){ res.status(400).send('Config error: '+e.message); }
});

// autoload
try{
  if(fs.existsSync('config.json')){
    const data=JSON.parse(fs.readFileSync('config.json','utf8'));
    if(data.cookies && data.cookies.length) initializeBot(data.cookies);
  }
}catch(e){ emitLog('Config load error: '+e.message,true); }

const PORT = process.env.PORT||20018;
server.listen(PORT,()=>emitLog(Server running on port ${PORT}));
