// super_masti_bot_v8_complete.js
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
let antiOutEnabled = true;
const lastActiveTime = {};
const ANTI_OUT_CHECK_INTERVAL = 60000; // 1 minute

// Schedule goodnight messages
let goodnightScheduled = false;

// Admin user ID (replace with your actual Facebook ID)
const ADMIN_USER_ID = '100021420605776';

// Bot uptime tracking
let botStartTime = Date.now();
let isBotRunning = true;

// User gender detection storage
const userGenderCache = new Map();
const userMessageCount = new Map();

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

// Stylish AAHAN H3R3 signature
function getSignature() {
  const signatures = [
    "\n\n✨ 🅐🅐🅗🅐🅝 🅗3🅡3 ✨",
    "\n\n🌟 🇦 🇦 🇭 🇦 🇳  🇭 3 🇷 3 🌟", 
    "\n\n🔥 𝔸𝔸ℍ𝔸ℕ ℍ3ℝ3 🔥",
    "\n\n💫 𝓐𝓐𝓗𝓐𝓝 𝓗3𝓡3 💫",
    "\n\n🎯 𝔄𝔄𝔥𝔄𝔫 ℌ3ℜ3 🎯",
    "\n\n⚡ ₳₳Ⱨ₳₦ Ⱨ3Ɽ3 ⚡",
    "\n\n🚀 ᗩᗩᕼᗩᑎ ᕼ3ᖇ3 🚀",
    "\n\n💖 ααнαη н3я3 💖"
  ];
  return pickRandom(signatures);
}

// Detect if user is female based on name and message patterns
async function detectUserGender(api, userID) {
  if (userGenderCache.has(userID)) {
    return userGenderCache.get(userID);
  }

  try {
    const userInfo = await api.getUserInfo(userID);
    const user = userInfo[userID];
    if (user) {
      const name = user.name || '';
      const firstName = name.split(' ')[0].toLowerCase();
      
      // Common female name patterns in Hindi/Urdu
      const femaleIndicators = ['priya', 'neha', 'sonia', 'kavita', 'pooja', 'anjali', 'ritu', 'sneha', 'divya', 'shweta', 'mehak', 'sana', 'zoya', 'aisha', 'fatima', 'sarah', 'ayesha'];
      const maleIndicators = ['rahul', 'rohit', 'amit', 'vivek', 'sanjay', 'ravi', 'akash', 'vikas', 'deepak', 'suresh', 'mohit', 'nitin', 'gaurav', 'anil'];
      
      if (femaleIndicators.some(indicator => firstName.includes(indicator))) {
        userGenderCache.set(userID, 'female');
        return 'female';
      } else if (maleIndicators.some(indicator => firstName.includes(indicator))) {
        userGenderCache.set(userID, 'male');
        return 'male';
      }
    }
  } catch (error) {
    emitLog('Gender detection error: ' + error.message, true);
  }
  
  userGenderCache.set(userID, 'unknown');
  return 'unknown';
}

// === MEGA ENHANCED REPLY BANKS ===
const replies = {
  goodmorning:[
    `Good morning ☀️ uth jao lazy panda 😴${getSignature()}`,
    `Good morning hero 😎 - aaj ka din tumhara hai!${getSignature()}`,
    `Utho bhai! Chai thandi ho gayi 😂${getSignature()}`,
    `Good morning! Smile karo 😄${getSignature()}`,
    `Good morning! Aaj kuch mast karte hain 💪${getSignature()}`,
    `Subah ho gayi mamu! uth jao 😆${getSignature()}`
  ],
  goodnight:[
    `Good night 🌙 sweet dreams 😴${getSignature()}`,
    `Good night! Sapno me hum ko mat bhoolna 😜${getSignature()}`,
    `Chalo so jao warna phone garam ho jayega 🔥${getSignature()}`,
    `Good night baby 💞${getSignature()}`,
    `Good night! Khush raho aur so jao 😴${getSignature()}`,
    `Raat bhar mere khayal aaye to message kar dena 🌙${getSignature()}`
  ],
  hi:[
    `Hi cutie 😍${getSignature()}`,
    `Hi bhai, kya scene hai 😂${getSignature()}`,
    `Hi! Lagta hai bore ho rahe ho 🤭${getSignature()}`,
    `Hi sunshine ☀️${getSignature()}`,
    `Hi! Tumhara swag to kamaal hai 😎${getSignature()}`,
    `Hi handsome/beautiful! 😉${getSignature()}`
  ],
  hello:[
    `Hello ji 😍 kya haal hai?${getSignature()}`,
    `Are hello bolke dil chura liya 😜${getSignature()}`,
    `Hello! Koi kaam hai ya timepass 😆${getSignature()}`,
    `Hello hello! Mujhe yaad kar liya kya 😏${getSignature()}`,
    `Hello boss, kya haal chaal 😎${getSignature()}`,
    `Hello jaan! Kaisi ho? ❤️${getSignature()}`
  ],
  bot:[
    `Kya hua bhai, bot ko yaad kiya 😏${getSignature()}`,
    `Main hu tera dost, always ready! 😎${getSignature()}`,
    `Bot busy hai memes banane me 😂${getSignature()}`,
    `Bula liya mujhe firse 😜${getSignature()}`,
    `Bot aaya swag ke sath 😈${getSignature()}`,
    `Haan bhai bata, main hi hoon! 🤖${getSignature()}`
  ],
  emoji:[
    `Nice emoji 😍${getSignature()}`,
    `Hahaha tu to killer hai 😂${getSignature()}`,
    `Emoji dekh ke dil khush ho gaya 😆${getSignature()}`,
    `Ye emoji mujhe bhi pasand hai 😜${getSignature()}`,
    `Kya emoji spam chalu hai kya 🤣${getSignature()}`,
    `Emoji queen/king lag rahe ho! 👑${getSignature()}`
  ],
  shayari:[
    `Dil ki baat labon pe aayi nahi 😔\nKehne ko bahut kuch tha par kahi nahi${getSignature()}`,
    `Tere jaise dost mile to zindagi easy lagti hai 💕\nHar gam bhul jate hai hasi lagti hai${getSignature()}`,
    `Raat ki tanhai me tera khayal aaya 😌\nPhir subah tak teri yaad sataye${getSignature()}`,
    `Chandni raat me teri yaad sataye 🌙\nDil dhadke aur palkein jhukaye${getSignature()}`,
    `Pyaar ka rang kuch aur hi hota hai ❤️\nJab tum saath ho maza kuch aur hi hota hai${getSignature()}`,
    `Tere ishq ne badal di hai zindagi meri 💫\nAb toh har pal tumse hi hai mulakat meri${getSignature()}`,
    `Aankhon mein base ho tum, dil mein basa hai pyaar 😍\nTum mile zindagi ko mil gaya sansaar${getSignature()}`,
    `Mohabbat ki hai yeh dastaan 💖\nTum ho meri pehli aur aakhri armaan${getSignature()}`
  ],
  gana:[
    `Aaj mood me hoon mai full on music 🎶${getSignature()}`,
    `Gaane ke bina din adhoora lagta hai 🎵${getSignature()}`,
    `Masti ke liye bass aur beat chahiye 🔊${getSignature()}`,
    `Yeh gana to super hit hai 😎${getSignature()}`,
    `Chalo dance karte hain song ke saath 💃${getSignature()}`,
    `Music is life 🎧 and I'm your DJ! 🎶${getSignature()}`
  ],
  flirt:[
    `Aankhein mila ke dekho toh pata chalega 😉\nTumhare dil mein bhi koi jagah hai ya nahi?${getSignature()}`,
    `Tumhare saath time bitana accha lagta hai ❤️\nJaise chand ko tare mil jaye${getSignature()}`,
    `Kya tumhare dil me bhi koi hai ya jagah khali hai? 😏\nMeri taraf se puch raha hoon samjhe?${getSignature()}`,
    `Tumhara smile toh mere din ko bright kar deta hai ☀️\nJaise suraj ki kirne andhera mitaye${getSignature()}`,
    `Koi tume bataya hai ki tum kitni cute ho? 😍\nNahi toh main bata du?${getSignature()}`,
    `Tumhare bina group adhoora lagta hai 💫\nJaise biryani mein namak nahi${getSignature()}`,
    `Tumse baat karke aisa lagta hai 🌟\nJaise koi hit movie dekhi ho${getSignature()}`,
    `Tumhara har message dil ko chhu jata hai 💓\nJaise koi soft song playing ho${getSignature()}`,
    `Kya tum mere liye special ho? 🤔\nKyuki tumhare aate hi mera mood special ho jata hai!${getSignature()}`,
    `Tumhe dekh ke lagta hai 😘\nShayad main pyaar mein pad gaya hoon!${getSignature()}`,
    `Tumhari aankhon mein kuch alag hi chamak hai ✨\nJaise sitaaron ki raat ho${getSignature()}`,
    `Tumse baat karke lagta hai ❤️\nJaise koi khoobsurat sapna dekh raha hoon${getSignature()}`,
    `Tumhara har message dil ko chhu jata hai 💫\nJaise koi meethi si dhadkan ho${getSignature()}`,
    `Kya tumhe pata hai tum kitni pretty ho? 🌸\nHar baar dekh ke dil dhadak jata hai${getSignature()}`,
    `Tumhari muskurahat dekh ke 🌟\nPoora din bright ho jata hai${getSignature()}`
  ],
  roast:[
    `Tere jaise logo ko dekh ke lagta hai nature ne experiment kiya tha 😂\nPar result aaya fail!${getSignature()}`,
    `Tera attitude dekh ke lagta hai tuition fees zyada di hai 🤣\nPar padhai nahi hui!${getSignature()}`,
    `Tujhe dekh ke lagta hai WiFi slow ho gaya 😆\nBuffering... buffering...${getSignature()}`,
    `Tere jokes sun ke hasi nahi aati, tension aati hai 😜\nDoctor ko dikhana padega!${getSignature()}`,
    `Tera swag dekh ke lagta hai offer lag gaya 🤪\n50% off on common sense!${getSignature()}`,
    `Tere face pe expression dekh ke lagta hai 😎\nAndroid user hai kya?${getSignature()}`,
    `Teri timing dekh ke lagta hai ⏰\nTrain chut gayi na?${getSignature()}`,
    `Tere replies dekh ke lagta hai 🐢\n2G network chal raha hai kya?${getSignature()}`
  ],
  masti:[
    `Party shuru kar do! 🎉${getSignature()}`,
    `Koi joke sunao ya main sunau? 😄${getSignature()}`,
    `Aaj kya plan hai masti ka? 🤔${getSignature()}`,
    `Hum hain naye zamane ke rockstars! 🤘${getSignature()}`,
    `Masti karo par parents ko pata na chale 😎${getSignature()}`,
    `Aaj to full mood hai masti ka! 💃🕺${getSignature()}`
  ],
  jokes:[
    `Teacher: Bachcho, batado 5 aise fruits jinke pehle letter 'A' aata ho?\nStudent: Apple, Apple, Apple, Apple, Apple!\nTeacher: Itne apples? 😂${getSignature()}`,
    
    `Ek boyfriend apni girlfriend ko leke garden gaya...\nGirlfriend: Baby dekho, titli! 🦋\nBoyfriend: Kahan? Kahan? Menu kha rahi hai kya? 😆${getSignature()}`,
    
    `Santa: Doctor sahab, main so nahi pata!\nDoctor: Yeh tablet raat ko sone se pehle lena.\nSanta: Par main so nahi pata to tablet kaise loon? 🤣${getSignature()}`,
    
    `2 mosquitoes baat kar rahe the...\n1st: Kal party hai kya?\n2nd: Nahin yaar, kal toh fasting hai... koi blood nahi milega! 🦟${getSignature()}`,
    
    `Teacher: Agar tumhare pocket me 100 rupees hai aur tumne 80 rupees kharch kiye to kya bachega?\nStudent: Jeb kharab hogi mam! 💰${getSignature()}`,
    
    `Wife: Darling, meri ek chhoti si wish poori karoge?\nHusband: Zaroor sweetheart!\nWife: Chhoti si CAR le aao! 🚗${getSignature()}`,
    
    `Patient: Doctor, main mar toh nahi jaunga na?\nDoctor: Nahi nahi, aap bilkul theek ho jaoge!\nPatient: Pakka?\nDoctor: Bill toh aapke warison ko dena padega! 💀${getSignature()}`,
    
    `Santa bank gaya...\nSanta: Mujhe loan chahiye!\nManager: Collateral do.\nSanta: Mere pass Santa Claus hai! 🎅${getSignature()}`
  ],
  mazedaar:[
    `Yaar aaj toh maza aa gaya! 😝\nJaise biryani mein extra raita mil gaya!${getSignature()}`,
    
    `Life ek jhooth hai 😜\nPar mere jokes sach hai!${getSignature()}`,
    
    `Tension leneka nahi 😎\nDene ka hai!${getSignature()}`,
    
    `Aaj kal main bahut busy hoon 🤪\nKuch karna nahi hai par busy hoon!${getSignature()}`,
    
    `Smartphone ne life easy kar di 🥴\nPar pocket heavy!${getSignature()}`,
    
    `Weekend plan kya hai? 🤔\nSona, khana, phone chalana, repeat!${getSignature()}`,
    
    `Mera attitude aisa hai 😼\nJaise result aaye fail par confidence ho full!${getSignature()}`,
    
    `Zindagi ek struggle hai 💪\nGroup chat mein active rehna usse badi struggle!${getSignature()}`
  ],
  // NEW: Baatchit (Normal Conversation) Replies
  baatchit:[
    `Kya haal chaal hai bhai? Sab theek? 😊${getSignature()}`,
    `Aaj kya kar rahe ho? Koi interesting plan hai? 🤔${getSignature()}`,
    `Yaar aaj weather kitna acha hai! Bahar ghumne ka man kar raha hai 🌞${getSignature()}`,
    `Movie dekhi kya aaj kal? Koi acchi recommendation hai? 🎬${getSignature()}`,
    `Bhai hunger games shuru ho gaye? Khana kha liya? 🍕${getSignature()}`,
    `Aaj ka din kaisa gaya? Kuch interesting hua? 🌟${getSignature()}`,
    `Weekend plan kya hai? Kahi ghumne ja rahe ho? 🚗${getSignature()}`,
    `Bhai thodi fresh air le lo, phone chod ke! 😄${getSignature()}`,
    `Kya new learn kiya aaj? Koi interesting cheez? 📚${getSignature()}`,
    `Bhai tension mat lo, sab theek ho jayega! 💪${getSignature()}`,
    `Aaj mood kaisa hai? Thoda haso, life jinda hai! 😂${getSignature()}`,
    `Koi new song suna aaj kal? Share karo! 🎵${getSignature()}`,
    `Bhai work/study balance maintain karo, health important hai! 🏃‍♂️${getSignature()}`,
    `Aaj kya special kiya? Koi achievement? 🏆${getSignature()}`,
    `Bhai family ke saath time spend karo, wo bhi important hai! 👨‍👩‍👧‍👦${getSignature()}`,
    `Kya naya seekha aaj? Knowledge badhao! 🧠${getSignature()}`,
    `Bhai thoda break lo, relax karo! 😴${getSignature()}`,
    `Aaj kya naya try kiya? Experiment karo life mein! 🔬${getSignature()}`,
    `Bhai positive raho, har problem ka solution hai! 🌈${getSignature()}`,
    `Kya naya goal set kiya? Dreams follow karo! 🎯${getSignature()}`
  ],
  // NEW: Question Answers
  questions:[
    `Main theek hoon bhai! Tum batao kya haal hai? 😊${getSignature()}`,
    `Mast mood hai yaar! Ready for some fun! 🎉${getSignature()}`,
    `Bas yaar, normal din chal raha hai. Tum sunao? 🤷‍♂️${getSignature()}`,
    `Full busy hai par tumse baat kar ke acha lag raha hai! 💖${getSignature()}`,
    `Bore ho raha tha, tum aa gaye toh maza aa gaya! 😄${getSignature()}`,
    `Aaj to masti karne ka man hai! Kya plan hai? 💃${getSignature()}`,
    `Thoda tired hoon yaar, par tumse baat karke fresh feel ho raha hai! 🌟${getSignature()}`,
    `Excited hoon! Aaj kuch naya karunga! 🚀${getSignature()}`,
    `Relax mode mein hoon, zindagi enjoy kar raha hoon! 😎${getSignature()}`,
    `Energy full hai! Kuch masti karte hain! ⚡${getSignature()}`
  ],
  // NEW: Smart Contextual Replies
  khana: [
    `Wah! Kya khaya? Mujhe bhi batayo 😋${getSignature()}`,
    `Maza aa gaya na? Main bhi hungry ho gaya 😅${getSignature()}`,
    `Khana khake energy full ho gayi? 💪${getSignature()}`,
    `Kha liya? Acchi baat hai! Health maintain karo 🍏${getSignature()}`,
    `Kitne baje khana khaya? Regular meals important hai ⏰${getSignature()}`,
    `Kya special banaya? Recipe share karo 👨‍🍳${getSignature()}`,
    `Healthy khana khaya ya junk food? 🥗🍔${getSignature()}`,
    `Khana khake fresh feel ho raha hoga! 😊${getSignature()}`
  ],
  padhai: [
    `Wah! Padhai kar rahe ho? Badhiya hai 📚${getSignature()}`,
    `Kya padh rahe ho? Subject interesting hai? 🤔${getSignature()}`,
    `Padhai important hai bhai! Career banega 💼${getSignature()}`,
    `Thoda break bhi lo, continuously mat padho 😴${getSignature()}`,
    `Konsi class mein ho? Course kaisa chal raha hai? 🎓${getSignature()}`,
    `Padhai ke saath saath sports bhi karo 🏀${getSignature()}`,
    `Exam ki preparation chal rahi hai? All the best! 🍀${getSignature()}`,
    `Study group banao, aasaan hoga padhai 👥${getSignature()}`
  ],
  kaam: [
    `Kaam mein busy ho? Thoda break lo 😊${getSignature()}`,
    `Kya kaam chal raha hai? Interesting project? 💼${getSignature()}`,
    `Work life balance maintain karna important hai ⚖️${getSignature()}`,
    `Kaam karte karte thak gaye hoge! Rest karo 😴${getSignature()}`,
    `Office ka kaam hai ya personal project? 🏢${getSignature()}`,
    `Deadline hai kya? Time management karo ⏳${getSignature()}`,
    `Kaam acha chal raha hai? Progress share karo 📈${getSignature()}`,
    `Hard work pays off! Keep going 💪${getSignature()}`
  ],
  ghumne: [
    `Kahan ghumne ka plan hai? Mujhe bhi le chalo 😄${getSignature()}`,
    `Accha hai! Bahar ghumne se mood fresh hota hai 🌳${getSignature()}`,
    `Shopping karne ja rahe ho ya nature enjoy karne? 🛍️🌄${getSignature()}`,
    `Friends ke saath ja rahe ho ya family ke saath? 👨‍👩‍👧‍👦${getSignature()}`,
    `Ghumne ka plan banao, maza aayega! 🎉${getSignature()}`,
    `Koi new place explore karoge? Adventure! 🗺️${getSignature()}`,
    `Photos zaroor lena, memories banegi 📸${getSignature()}`,
    `Safe travel! Have fun! 🚗${getSignature()}`
  ],
  movie: [
    `Konsi movie dekh rahe ho? Review bhi dena 🎬${getSignature()}`,
    `Movie acchi hai? Rating kya denge? ⭐${getSignature()}`,
    `Theatre mein dekh rahe ho ya OTT pe? 🎭${getSignature()}`,
    `Action movie hai ya romantic? 💥❤️${getSignature()}`,
    `Popcorn leke baithe ho kya? 🍿${getSignature()}`,
    `Movie ke baad discussion karenge! 🤔${getSignature()}`,
    `Binge watching chal rahi hai? Marathon! 📺${getSignature()}`,
    `Movie dekh ke inspired feel ho raha hai? 🎭${getSignature()}`
  ],
  // NEW: Female specific replies
  female_flirt: [
    `Aapki profile pic dekh ke toh dil dhadak gaya! 😍${getSignature()}`,
    `Kya baat hai aapki, itni cute ho! 🌸${getSignature()}`,
    `Aapke messages padhke acha lagta hai 💫${getSignature()}`,
    `Aapki smile toh social media ki sabse khoobsurat cheez hai ✨${getSignature()}`,
    `Aap jaise ladkiyon se baat karke life bright ho jati hai 🌟${getSignature()}`,
    `Aapki har baat mein kuch khaas hai 💖${getSignature()}`,
    `Aapko dekh ke lagta hai jaise koi fairy ho 👸${getSignature()}`,
    `Aapki presence se group ki beauty double ho jati hai 🌹${getSignature()}`,
    `Aap jaise smart ladki se baat karke knowledge badhti hai 📚${getSignature()}`,
    `Aapki personality toh sabko impress karti hai 😎${getSignature()}`
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
/baat - Normal baatchit karte hain

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

${getSignature()}
`;

// === BOT INIT ===
function initializeBot(cookies){
  currentCookies = cookies;
  login({ appState: cookies }, (err,api)=>{
    if(err){ emitLog('Login error: '+err.message,true); setTimeout(()=>initializeBot(cookies),10000); return;}
    botAPI = api;
    botAPI.setOptions({ selfListen:true, listenEvents:true });
    emitLog('✅ Bot logged in successfully!');
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
        const goodnightMsg = `🌙 *Good Night Everyone!* 🌙\n\n${pickRandom(replies.goodnight)}\n\n${pickRandom(replies.shayari)}\n\nSweet dreams! 😴💫 ${getSignature()}`;
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
      `Kya hua? Sab so gaye kya? 😴 Yaad kar lo!${getSignature()}`,
      `Group mein koi hai? 🎤 Main zinda hoon!${getSignature()}`,
      `Kya scene hai? Chat band ho gayi? 😂${getSignature()}`,
      `Hello? Koi zinda hai? 🔥${getSignature()}`,
      `Kya ho gaya group ko? Masti karo! 🎉${getSignature()}`,
      `${pickRandom(replies.jokes)}\n\nGroup toh jinda karo!${getSignature()}`
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
          await api.sendMessage(`🤖 Bot stopped! Silent mode ON. ${getSignature()}`,threadID); 
        } else {
          await api.sendMessage(`❌ Sorry, ye command sirf admin use kar sakte hain! ${getSignature()}`,threadID);
        }
        return;
      }
      
      if(text===`${prefix}start`){ 
        if(isAdmin) {
          botActive=true; 
          lastReplyAt[threadID]=Date.now(); 
          await api.sendMessage(`🤖 Bot started! Ready to reply 😎 ${getSignature()}`,threadID); 
        } else {
          await api.sendMessage(`❌ Sorry, ye command sirf admin use kar sakte hain! ${getSignature()}`,threadID);
        }
        return;
      }
      
      if(text===`${prefix}antion`){ 
        if(isAdmin) {
          antiOutEnabled=true; 
          await api.sendMessage(`🛡️ Anti-out system activated! ${getSignature()}`,threadID); 
        } else {
          await api.sendMessage(`❌ Sorry, ye command sirf admin use kar sakte hain! ${getSignature()}`,threadID);
        }
        return;
      }
      
      if(text===`${prefix}antioff`){ 
        if(isAdmin) {
          antiOutEnabled=false; 
          await api.sendMessage(`🛡️ Anti-out system deactivated! ${getSignature()}`,threadID); 
        } else {
          await api.sendMessage(`❌ Sorry, ye command sirf admin use kar sakte hain! ${getSignature()}`,threadID);
        }
        return;
      }
      
      if(text===`${prefix}status`){ 
        const uptime = Math.floor((Date.now() - botStartTime) / 1000);
        const hours = Math.floor(uptime / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const seconds = uptime % 60;
        
        const statusMessage = `🤖 *BOT STATUS* 🤖

📊 Bot Status: ${botActive ? '🟢 ACTIVE' : '🔴 INACTIVE'}
🛡️ Anti-Out: ${antiOutEnabled ? '🟢 ON' : '🔴 OFF'}
⏰ Uptime: ${hours}h ${minutes}m ${seconds}s
🔧 Features: Jokes, Flirting, Shayari, Roasting, Masti, Baatchit
🎯 Admin: ${isAdmin ? '🟢 YOU' : '🔴 Not Admin'}

*Forever Running!* 🚀 ${getSignature()}`;
        
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
        await api.sendMessage(`📜 *Shayari Time!* 📜\n\n"${pickRandom(replies.shayari)}"`,threadID); 
        return;
      }
      if(text===`${prefix}baat`){ 
        lastReplyAt[threadID]=Date.now(); 
        await api.sendMessage(pickRandom(replies.baatchit),threadID); 
        return;
      }
      
      if(!botActive) return;

      // Track user message count for varied responses
      const userMsgCount = userMessageCount.get(senderID) || 0;
      userMessageCount.set(senderID, userMsgCount + 1);

      // Detect user gender for personalized responses
      const userGender = await detectUserGender(api, senderID);

      // Enhanced reply detection with baatchit and contextual replies
      let replyText = null;
      
      // Basic greetings
      if(text.includes('good morning')) replyText = pickRandom(replies.goodmorning);
      else if(text.includes('good night') || text==='gn') replyText = pickRandom(replies.goodnight);
      else if(text.includes('hi')) replyText = pickRandom(replies.hi);
      else if(text.includes('hello')) replyText = pickRandom(replies.hello);
      else if(text.includes('bot')) replyText = pickRandom(replies.bot);
      
      // Commands detection
      else if(text.includes('shayari')) replyText = `📜 ${pickRandom(replies.shayari)}`;
      else if(text.includes('gana') || text.includes('song')) replyText = pickRandom(replies.gana);
      else if(text.includes('flirt') || text.includes('pyar')) {
        // Special flirt responses for females
        if (userGender === 'female' && Math.random() > 0.5) {
          replyText = pickRandom(replies.female_flirt);
        } else {
          replyText = pickRandom(replies.flirt);
        }
      }
      else if(text.includes('roast')) replyText = pickRandom(replies.roast);
      else if(text.includes('masti')) replyText = pickRandom(replies.masti);
      else if(text.includes('joke') || text.includes('haso')) replyText = pickRandom(replies.jokes);
      else if(text.includes('mazedaar') || text.includes('maza')) replyText = pickRandom(replies.mazedaar);
      else if(text.includes('baat') || text.includes('bat')) replyText = pickRandom(replies.baatchit);
      else if(containsEmoji(text)) replyText = pickRandom(replies.emoji);
      
      // Smart contextual replies based on message content
      else if(text.includes('khaya') || text.includes('khana') || text.includes('food') || text.includes('bhook') || text.includes('kha') || text.includes('eating')) 
        replyText = pickRandom(replies.khana);
      else if(text.includes('padh') || text.includes('study') || text.includes('parh') || text.includes('exam') || text.includes('class'))
        replyText = pickRandom(replies.padhai);
      else if(text.includes('kaam') || text.includes('work') || text.includes('job') || text.includes('office') || text.includes('project'))
        replyText = pickRandom(replies.kaam);
      else if(text.includes('ghumna') || text.includes('ghume') || text.includes('travel') || text.includes('trip') || text.includes('ja') || text.includes('going'))
        replyText = pickRandom(replies.ghumne);
      else if(text.includes('movie') || text.includes('film') || text.includes('cinema') || text.includes('dekh') || text.includes('watch'))
        replyText = pickRandom(replies.movie);
      
      // Smart replies for common phrases with baatchit
      else if(text.includes('kya kar rahe') || text.includes('what are you doing') || text.includes('kya kar')) 
        replyText = `Tumhare saath baat kar raha hoon 😉${getSignature()}`;
      else if(text.includes('miss you') || text.includes('yaad aaye') || text.includes('yaad'))
        replyText = `Main bhi tumko miss kar raha hoon ❤️${getSignature()}`;
      else if(text.includes('bore') || text.includes('boring') || text.includes('bore ho'))
        replyText = `${pickRandom(replies.jokes)}\n\nAb bore nahi lagega!${getSignature()}`;
      else if(text.includes('single') || text.includes('akela') || text.includes('alone'))
        replyText = `Don't worry, main tumhare saath hoon 😎${getSignature()}`;
      else if(text.includes('tension') || text.includes('stress') || text.includes('pressure'))
        replyText = `${pickRandom(replies.mazedaar)}\n\nTension mat lo!${getSignature()}`;
      else if(text.includes('kaisa hai') || text.includes('kese ho') || text.includes('how are you') || text.includes('kya haal'))
        replyText = pickRandom(replies.questions);
      else if(text.includes('kya haal') || text.includes('whats up') || text.includes('sup'))
        replyText = pickRandom(replies.baatchit);
      else if(text.includes('plan') || text.includes('yojna') || text.includes('schedule'))
        replyText = pickRandom(replies.baatchit);
      else if(text.includes('weather') || text.includes('mausam') || text.includes('baarish') || text.includes('rain'))
        replyText = `Yaar aaj weather kitna acha hai! Bahar ghumne ka man kar raha hai 🌞${getSignature()}`;
      
      // Random conversation starters for variety
      else if(userMsgCount > 3 && Math.random() > 0.7) {
        replyText = pickRandom(replies.baatchit);
      }

      // Special case: If user is female and no reply yet, sometimes send flirt message
      if(!replyText && userGender === 'female' && Math.random() > 0.8) {
        replyText = pickRandom(replies.female_flirt);
      }

      if(replyText){
        lastReplyAt[threadID]=Date.now();
        let name='User';
        try{ 
          const info=await api.getUserInfo(senderID); 
          name=info[senderID]?.name||name; 
        }catch{}
        
        await api.sendMessage({ 
          body:`@${name} ${replyText}`, 
          mentions:[{ tag:name,id:senderID }]
        },threadID);
      }
    }catch(e){ emitLog('Handler error: '+e.message,true); }
  });
}

// === EXPRESS SERVER ===
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
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
    res.send('Bot configured & starting...');
  }catch(e){ res.status(400).send('Config error: '+e.message); }
});

// New endpoint for bot control
app.post('/control', (req, res) => {
  const { action } = req.body;
  switch(action) {
    case 'start':
      botActive = true;
      res.send('Bot activated');
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
        name: 'Enhanced Bot',
        uptime: `${hours}h ${minutes}m`,
        running: isBotRunning,
        features: ['jokes', 'flirting', 'shayari', 'roasting', 'masti', 'baatchit', 'anti-out', 'scheduled messages', 'gender detection']
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
server.listen(PORT,()=>emitLog(`Server running on port ${PORT} - Bot will run forever until manually stopped!`));
