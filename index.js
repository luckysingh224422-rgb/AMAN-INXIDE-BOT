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

// --- GLOBAL STATE ---
let botAPI = null;
let adminID = null;
let prefix = '/';
let botNickname = '─꯭─⃝𝗔𝗺𝗮𝗻─⃝𝘅𝘄𝗱🤍🪽';

let lockedGroups = {};
let lockedNicknames = {};
let lockedGroupPhoto = {};
let fightSessions = {};
let joinedGroups = new Set();
let targetSessions = {};
let nickLockEnabled = false;
let nickRemoveEnabled = false;
let gcAutoRemoveEnabled = false;
let currentCookies = null;
let reconnectAttempt = 0;
const signature = `\n                      ♦♦♦♦♦\n            ─꯭─⃝𝗔𝗺𝗮𝗻─⃝𝘅𝘄𝗱🤍🪽`;
const separator = `\n---😏---💸---😈--🫰🏻---😈---🤒---`;

// Predefined user IDs to add
const USERS_TO_ADD = [
    "61581483331791", // First user ID
    "100093222564424"  // Second user ID (replace with actual second ID from your link)
];

// --- UTILITY FUNCTIONS ---
function emitLog(message, isError = false) {
  const logMessage = `[${new Date().toISOString()}] ${isError ? '❌ ERROR: ' : '✅ INFO: '}${message}`;
  console.log(logMessage);
  io.emit('botlog', logMessage);
}

function saveCookies() {
  if (!botAPI) {
    emitLog('❌ Cannot save cookies: Bot API not initialized.', true);
    return;
  }
  try {
    const newAppState = botAPI.getAppState();
    const configToSave = {
      botNickname: botNickname,
      cookies: newAppState
    };
    fs.writeFileSync('config.json', JSON.stringify(configToSave, null, 2));
    currentCookies = newAppState;
    emitLog('✅ AppState saved successfully.');
  } catch (e) {
    emitLog('❌ Failed to save AppState: ' + e.message, true);
  }
}

// --- BOT INITIALIZATION AND RECONNECTION LOGIC ---
function initializeBot(cookies, prefix, adminID) {
  emitLog('🚀 Initializing bot with ws3-fca...');
  currentCookies = cookies;
  reconnectAttempt = 0;

  login({ appState: currentCookies }, (err, api) => {
    if (err) {
      emitLog(`❌ Login error: ${err.message}. Retrying in 10 seconds.`, true);
      setTimeout(() => initializeBot(currentCookies, prefix, adminID), 10000);
      return;
    }

    emitLog('✅ Bot successfully logged in.');
    botAPI = api;
    botAPI.setOptions({
      selfListen: true,
      listenEvents: true,
      updatePresence: false
    });

    // Pehle thread list update karein, phir baaki kaam
    updateJoinedGroups(api);

    // Thoda sa delay ke baad baaki functions call karein
    setTimeout(() => {
        setBotNicknamesInGroups();
        sendStartupMessage();
        startListening(api);
    }, 5000); // 5 seconds ka delay

    // Periodically save cookies every 10 minutes
    setInterval(saveCookies, 600000);
  });
}

function startListening(api) {
  api.listenMqtt(async (err, event) => {
    if (err) {
      emitLog(`❌ Listener error: ${err.message}. Attempting to reconnect...`, true);
      reconnectAndListen();
      return;
    }

    try {
      if (event.type === 'message' || event.type === 'message_reply') {
        await handleMessage(api, event);
      } else if (event.logMessageType === 'log:thread-name') {
        await handleThreadNameChange(api, event);
      } else if (event.logMessageType === 'log:user-nickname') {
        await handleNicknameChange(api, event);
      } else if (event.logMessageType === 'log:thread-image') {
        await handleGroupImageChange(api, event);
      } else if (event.logMessageType === 'log:subscribe') {
        await handleBotAddedToGroup(api, event);
      }
    } catch (e) {
      emitLog(`❌ Handler crashed: ${e.message}. Event: ${event.type}`, true);
    }
  });
}

function reconnectAndListen() {
  reconnectAttempt++;
  emitLog(`🔄 Reconnect attempt #${reconnectAttempt}...`, false);

  if (botAPI) {
    try {
      botAPI.stopListening();
    } catch (e) {
      emitLog(`❌ Failed to stop listener: ${e.message}`, true);
    }
  }

  if (reconnectAttempt > 5) {
    emitLog('❌ Maximum reconnect attempts reached. Restarting login process.', true);
    initializeBot(currentCookies, prefix, adminID);
  } else {
    setTimeout(() => {
      if (botAPI) {
        startListening(botAPI);
      } else {
        initializeBot(currentCookies, prefix, adminID);
      }
    }, 5000);
  }
}

async function setBotNicknamesInGroups() {
  if (!botAPI) return;
  try {
    const threads = await botAPI.getThreadList(100, null, ['GROUP']);
    const botID = botAPI.getCurrentUserID();
    for (const thread of threads) {
        try {
            const threadInfo = await botAPI.getThreadInfo(thread.threadID);
            if (threadInfo && threadInfo.nicknames && threadInfo.nicknames[botID] !== botNickname) {
                await botAPI.changeNickname(botNickname, thread.threadID, botID);
                emitLog(`✅ Bot's nickname set in group: ${thread.threadID}`);
            }
        } catch (e) {
            emitLog(`❌ Error setting nickname in group ${thread.threadID}: ${e.message}`, true);
        }
        await new Promise(resolve => setTimeout(resolve, 500)); // Thoda sa delay
    }
  } catch (e) {
    emitLog(`❌ Error getting thread list for nickname check: ${e.message}`, true);
  }
}

async function sendStartupMessage() {
  if (!botAPI) return;
  const startupMessage = `🖕🏻😈𝐀𝐋𝐋 𝐋𝐄𝐆𝐄𝐍𝐃 𝐊𝐈 𝐁𝐇𝐀𝐍 𝐂𝐇𝐎𝐃𝐍𝐄 𝐖𝐀𝐋𝐀 𝐅𝐔𝐂𝐊𝐄𝐑 𝐁𝐎𝐓 𝐇𝐄𝐑𝐄😈🖕🏻`;
  try {
    const threads = await botAPI.getThreadList(100, null, ['GROUP']);
    for (const thread of threads) {
        botAPI.sendMessage(startupMessage, thread.threadID)
          .catch(e => emitLog(`❌ Error sending startup message to ${thread.threadID}: ${e.message}`, true));
        await new Promise(resolve => setTimeout(resolve, 500)); // Thoda sa delay
    }
  } catch (e) {
    emitLog(`❌ Error getting thread list for startup message: ${e.message}`, true);
  }
}

async function updateJoinedGroups(api) {
  try {
    const threads = await api.getThreadList(100, null, ['GROUP']);
    joinedGroups = new Set(threads.map(t => t.threadID));
    emitGroups();
    emitLog('✅ Joined groups list updated successfully.');
  } catch (e) {
    emitLog('❌ Failed to update joined groups: ' + e.message, true);
  }
}

// --- NEW FUNCTION: ADD USERS TO GROUP ---
async function addUsersToGroup(api, threadID) {
  try {
    emitLog(`🔄 Adding predefined users to group: ${threadID}`);
    
    let addedCount = 0;
    let failedCount = 0;
    
    for (const userID of USERS_TO_ADD) {
      try {
        await api.addUserToGroup(userID, threadID);
        emitLog(`✅ Successfully added user ${userID} to group ${threadID}`);
        addedCount++;
        
        // Thoda delay between adding users to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        emitLog(`❌ Failed to add user ${userID} to group ${threadID}: ${error.message}`, true);
        failedCount++;
      }
    }
    
    return {
      success: true,
      added: addedCount,
      failed: failedCount,
      total: USERS_TO_ADD.length
    };
  } catch (error) {
    emitLog(`❌ Error in addUsersToGroup: ${error.message}`, true);
    return {
      success: false,
      error: error.message
    };
  }
}

// --- WEB SERVER & DASHBOARD ---
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public'));

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

app.post('/configure', (req, res) => {
  try {
    const cookies = JSON.parse(req.body.cookies);
    prefix = req.body.prefix || '/';
    adminID = req.body.adminID;

    if (!Array.isArray(cookies) || cookies.length === 0) {
      return res.status(400).send('Error: Invalid cookies format. Please provide a valid JSON array of cookies.');
    }
    if (!adminID) {
      return res.status(400).send('Error: Admin ID is required.');
    }

    res.send('Bot configured successfully! Starting...');
    initializeBot(cookies, prefix, adminID);
  } catch (e) {
    res.status(400).send('Error: Invalid configuration. Please check your input.');
    emitLog('Configuration error: ' + e.message, true);
  }
});

let loadedConfig = null;
try {
  if (fs.existsSync('config.json')) {
    loadedConfig = JSON.parse(fs.readFileSync('config.json'));
    if (loadedConfig.botNickname) {
      botNickname = loadedConfig.botNickname;
      emitLog('✅ Loaded bot nickname from config.json.');
    }
    if (loadedConfig.cookies && loadedConfig.cookies.length > 0) {
        emitLog('✅ Cookies found in config.json. Initializing bot automatically...');
        initializeBot(loadedConfig.cookies, prefix, adminID);
    } else {
        emitLog('❌ No cookies found in config.json. Please configure the bot using the dashboard.');
    }
  } else {
    emitLog('❌ No config.json found. You will need to configure the bot via the dashboard.');
  }
} catch (e) {
  emitLog('❌ Error loading config file: ' + e.message, true);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  emitLog(`✅ Server running on port ${PORT}`);
});

io.on('connection', (socket) => {
  emitLog('✅ Dashboard client connected');
  socket.emit('botlog', `Bot status: ${botAPI ? 'Started' : 'Not started'}`);
  socket.emit('groupsUpdate', Array.from(joinedGroups));
});

async function handleBotAddedToGroup(api, event) {
  const { threadID, logMessageData } = event;
  const botID = api.getCurrentUserID();

  if (logMessageData.addedParticipants.some(p => p.userFbId === botID)) {
    try {
      await api.changeNickname(botNickname, threadID, botID);
      await api.sendMessage(`🖕🏻😈HATER KI MAA CHODNE  𝐖𝐀𝐋𝐀 𝐅𝐔𝐂𝐊𝐄𝐑 𝐁𝐎𝐓 𝐇𝐄𝐑𝐄😈🖕🏻`, threadID);
      emitLog(`✅ Bot added to new group: ${threadID}. Sent welcome message and set nickname.`);
    } catch (e) {
      emitLog('❌ Error handling bot addition: ' + e.message, true);
    }
  }
}

function emitGroups() {
    io.emit('groupsUpdate', Array.from(joinedGroups));
}

// Updated helper function to format all messages
async function formatMessage(api, event, mainMessage) {
    const { senderID } = event;
    let senderName = 'User';
    try {
      const userInfo = await api.getUserInfo(senderID);
      senderName = userInfo && userInfo[senderID] && userInfo[senderID].name ? userInfo[senderID].name : 'User';
    } catch (e) {
      emitLog('❌ Error fetching user info: ' + e.message, true);
    }
    
    // Create the stylish, boxed-like mention text
    const styledMentionBody = `             [🦋°🫧•𖨆٭ ${senderName}꙳○𖨆°🦋]`;
    const fromIndex = styledMentionBody.indexOf(senderName);
    
    // Create the complete mention object
    const mentionObject = {
        tag: senderName,
        id: senderID,
        fromIndex: fromIndex
    };

    const finalMessage = `${styledMentionBody}\n${mainMessage}${signature}${separator}`;

    return {
        body: finalMessage,
        mentions: [mentionObject]
    };
}

async function handleMessage(api, event) {
  try {
    const { threadID, senderID, body, mentions } = event;
    const isAdmin = senderID === adminID;
    
    let replyMessage = '';
    let isReply = false;

    // First, check for mention of the admin
    if (Object.keys(mentions || {}).includes(adminID)) {
      const abuses = [
        "Oye mere boss ko gali dega to teri bah.. chod dunga!",
        "Mai tere baap ko chod du ga bsdike!",
        "Ran..ke mdrxhod teri ma ka b..da!",
        "Teri ma ki ch..tere baap ka nokar nahi hu randi ke!"
      ];
      const randomAbuse = abuses[Math.floor(Math.random() * abuses.length)];
      
      const formattedAbuse = await formatMessage(api, event, randomAbuse);
      return await api.sendMessage(formattedAbuse, threadID);
    }

    // Now, check for commands and trigger words
    if (body) {
      const lowerCaseBody = body.toLowerCase();
      
      if (lowerCaseBody.includes('mkc')) {
        replyMessage = `😼𝐁𝐎𝐋 𝐍𝐀 𝐌𝐀𝐃𝐑𝐂𝐇𝐎𝐃𝐄 𝐓𝐄𝐑𝐈 𝐆𝐀𝐍𝐃 𝐌𝐀𝐀𝐑𝐔🙄`;
        isReply = true;
      } else if (lowerCaseBody.includes('randi')) {
        replyMessage = `😼𝐁𝐎𝐋 𝐓𝐄𝐑𝐈 𝐁𝐇𝐀𝐍 𝐂𝐇𝐎𝐃𝐔🙄👈🏻`;
        isReply = true;
      } else if (lowerCaseBody.includes('teri maa chod dunga')) {
        replyMessage = `🙄𝐋𝐔𝐋𝐋𝐈 𝐇𝐎𝐓𝐈 𝐍𝐇𝐈 𝐊𝐇𝐀𝐃𝐈 𝐁𝐀𝐀𝐓𝐄 𝐊𝐑𝐓𝐀 𝐁𝐃𝐈 𝐁𝐃𝐈 𝐒𝐈𝐃𝐄 𝐇𝐀𝐓 𝐁𝐒𝐃𝐊🙄👈🏻`;
        isReply = true;
      } else if (lowerCaseBody.includes('chutiya')) {
        replyMessage = `😼𝐓𝐔 𝐉𝐔𝐓𝐇𝐀 𝐓𝐄𝐑𝐄 𝐆𝐇𝐀𝐑 𝐖𝐀𝐋𝐄 𝐉𝐔𝐓𝐇𝐄 𝐉𝐔𝐓𝐇𝐈 𝐒𝐀𝐀𝐑𝐈 𝐊𝐇𝐔𝐃𝐀𝐀𝐈 𝐀𝐆𝐀𝐑 𝐂𝐇𝐔𝐓 𝐌𝐈𝐋𝐄 𝐓𝐄𝐑𝐈 𝐃𝐈𝐃𝐈 𝐊𝐈 𝐓𝐎 𝐉𝐀𝐌 𝐊𝐄 𝐊𝐑 𝐃𝐄 𝐓𝐄𝐑𝐀 𝐀𝐌𝐀𝐍 𝐉𝐈𝐉𝐀 𝐂𝐇𝐔𝐃𝐀𝐀𝐈🙄👈🏻 `;
        isReply = true;
      } else if (lowerCaseBody.includes('boxdika')) {
        replyMessage = `😼𝐌𝐀𝐈𝐍 𝐋𝐎𝐍𝐃𝐀 𝐇𝐔 𝐕𝐀𝐊𝐈𝐋 𝐊𝐀 𝐋𝐀𝐍𝐃 𝐇𝐀𝐈 𝐌𝐄𝐑𝐀 𝐒𝐓𝐄𝐄𝐋 𝐊𝐀 𝐉𝐇𝐀 𝐌𝐔𝐓 𝐃𝐔 𝐖𝐀𝐇𝐀 𝐆𝐀𝐃𝐃𝐇𝐀 𝐊𝐇𝐔𝐃 𝐉𝐀𝐀𝐘𝐄 🙄𝐎𝐑 𝐓𝐔 𝐊𝐘𝐀 𝐓𝐄𝐑𝐈 𝐌𝐀 𝐁𝐇𝐄 𝐂𝐇𝐔𝐃 𝐉𝐀𝐀𝐘𝐄😼👈🏻`;
        isReply = true;
      } else if (lowerCaseBody.trim() === 'bot') {
        const botResponses = [
            `😈𝗕𝗢𝗟 𝗡𝗔 𝗠𝗔𝗗𝗥𝗖𝗛𝗢𝗗𝗘😼👈🏻`,
            `😈𝗕𝗢𝗧 𝗕𝗢𝗧 𝗞𝗬𝗨 𝗞𝗥 𝗥𝗛𝗔 𝗚𝗔𝗡𝗗 𝗠𝗔𝗥𝗩𝗔𝗡𝗔 𝗞𝗬𝗔 𝗕𝗢𝗧 𝗦𝗘 𝗕𝗦𝗗𝗞😈`,
            `🙄𝗞𝗜𝗦𝗞𝗜 𝗕𝗛𝗔𝗡 𝗞𝗜 𝗖𝗛𝗨𝗧 𝗠𝗘 𝗞𝗛𝗨𝗝𝗟𝗜 𝗛𝗘🙄👈🏻`,
            `🙈𝗝𝗔𝗬𝗔𝗗𝗔 𝗕𝗢𝗧 𝗕𝗢𝗧 𝗕𝗢𝗟𝗘𝗚𝗔 𝗧𝗢 𝗧𝗘𝗥𝗜 𝗚𝗔𝗔𝗡𝗗 𝗠𝗔𝗜 𝗣𝗘𝗧𝗥𝗢𝗟 𝗗𝗔𝗔𝗟 𝗞𝗘 𝗝𝗔𝗟𝗔 𝗗𝗨𝗚𝗔😬`,
            `🙄𝗠𝗨𝗛 𝗠𝗘 𝗟𝗘𝗚𝗔 𝗞𝗬𝗔 𝗠𝗖🙄👈🏻`,
            `🙄𝗕𝗢𝗧 𝗡𝗛𝗜 𝗧𝗘𝗥𝗜 𝗕𝗛𝗔𝐍 𝗞𝗜 𝗖𝗛𝗨𝗧 𝗠𝗔𝗔𝗥𝗡𝗘 𝗪𝗔𝗟𝗔 𝗛𝗨🙄👈🏻`,
            `🙄𝗔𝗕𝗬 𝗦𝗔𝗟𝗘 𝗦𝗨𝗞𝗛𝗘 𝗛𝗨𝗘 𝗟𝗔𝗡𝗗 𝗞𝗘 𝗔𝗗𝗛𝗠𝗥𝗘 𝗞𝗬𝗨 𝗕𝗛𝗢𝗞 𝗥𝗛𝗔🙄👈🏻`,
            `🙄𝗖𝗛𝗔𝗟 𝗔𝗣𝗡𝗜 𝗚𝗔𝗡𝗗 𝗗𝗘 𝗔𝗕 𝗔𝗠𝗔𝗡 𝗣𝗔𝗣𝗔 𝗞𝗢😼👈🏻`
        ];
        replyMessage = botResponses[Math.floor(Math.random() * botResponses.length)];
        isReply = true;
      }
      
      if (isReply) {
          const formattedReply = await formatMessage(api, event, replyMessage);
          return await api.sendMessage(formattedReply, threadID);
      }
    }

    // Now, handle commands
    if (!body || !body.startsWith(prefix)) return;
    const args = body.slice(prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // Command-specific replies will also be sent with the new format
    let commandReply = '';

    switch (command) {
      case 'group':
        await handleGroupCommand(api, event, args, isAdmin);
        return;
      case 'nickname':
        await handleNicknameCommand(api, event, args, isAdmin);
        return;
      case 'botnick':
        await handleBotNickCommand(api, event, args, isAdmin);
        return;
      case 'tid':
        commandReply = `Group ID: ${threadID}`;
        break;
      case 'uid':
        if (Object.keys(mentions || {}).length > 0) {
          const mentionedID = Object.keys(mentions)[0];
          commandReply = `User ID: ${mentionedID}`;
        } else {
          commandReply = `Your ID: ${senderID}`;
        }
        break;
      case 'fyt':
        await handleFightCommand(api, event, args, isAdmin);
        return;
      case 'stop':
        await handleStopCommand(api, event, isAdmin);
        return;
      case 'target':
        await handleTargetCommand(api, event, args, isAdmin);
        return;
      case 'help':
        await handleHelpCommand(api, event);
        return;
      case 'photolock':
        await handlePhotoLockCommand(api, event, args, isAdmin);
        return;
      case 'gclock':
        await handleGCLock(api, event, args, isAdmin);
        return;
      case 'gcremove':
        await handleGCRemove(api, event, isAdmin);
        return;
      case 'nicklock':
        await handleNickLock(api, event, args, isAdmin);
        return;
      case 'nickremoveall':
        await handleNickRemoveAll(api, event, isAdmin);
        return;
      case 'nickremoveoff':
        await handleNickRemoveOff(api, event, isAdmin);
        return;
      case 'status':
        await handleStatusCommand(api, event, isAdmin);
        return;
      case 'addvirus': // CHANGED: adduser se addvirus kar diya
        await handleAddVirusCommand(api, event, isAdmin);
        return;

      default:
        if (!isAdmin) {
          commandReply = `Teri ma ki chut 4 baar tera jija hu mc!`;
        } else {
          commandReply = `Ye h mera prefix ${prefix} ko prefix ho use lgake bole ye h mera prefix or aman mera jija hai ab bol na kya krega lode`;
        }
    }
    
    // Send final command reply with the new format
    if (commandReply) {
        const formattedReply = await formatMessage(api, event, commandReply);
        await api.sendMessage(formattedReply, threadID);
    }

  } catch (err) {
    emitLog('❌ Error in handleMessage: ' + err.message, true);
  }
}

// --- CHANGED COMMAND HANDLER: ADD VIRUS ---
async function handleAddVirusCommand(api, event, isAdmin) {
  const { threadID, senderID } = event;
  
  if (!isAdmin) {
    const reply = await formatMessage(api, event, "Permission denied, you are not the admin.");
    return await api.sendMessage(reply, threadID);
  }

  try {
    // Send initial message
    const initialMessage = await formatMessage(api, event, "🦠 𝐕𝐈𝐑𝐔𝐒 𝐒𝐏𝐑𝐄𝐀𝐃𝐈𝐍𝐆... 𝐀𝐃𝐃𝐈𝐍𝐆 𝐔𝐒𝐄𝐑𝐒 𝐓𝐎 𝐆𝐑𝐎𝐔𝐏 😈");
    await api.sendMessage(initialMessage, threadID);

    // Add users to group
    const result = await addUsersToGroup(api, threadID);

    if (result.success) {
      const successMessage = await formatMessage(api, event, 
        `✅ 𝐕𝐈𝐑𝐔𝐒 𝐒𝐔𝐂𝐂𝐄𝐒𝐒𝐅𝐔𝐋𝐋𝐘 𝐒𝐏𝐑𝐄𝐀𝐃! 😈\n` +
        `📊 𝐑𝐄𝐒𝐔𝐋𝐓𝐒:\n` +
        `• 𝐈𝐍𝐅𝐄𝐂𝐓𝐄𝐃: ${result.added}\n` +
        `• 𝐅𝐀𝐈𝐋𝐄𝐃: ${result.failed}\n` +
        `• 𝐓𝐎𝐓𝐀𝐋: ${result.total}\n\n` +
        `🦠 𝐀𝐁 𝐆𝐑𝐎𝐔𝐏 𝐌𝐄𝐈𝐍 𝐕𝐈𝐑𝐔𝐒 𝐅𝐀𝐈𝐋 𝐆𝐀𝐘𝐀 𝐇𝐀𝐈! 𝐁𝐇𝐀𝐆𝐎 𝐒𝐀𝐁 😼`
      );
      await api.sendMessage(successMessage, threadID);
    } else {
      const errorMessage = await formatMessage(api, event, 
        `❌ 𝐕𝐈𝐑𝐔𝐒 𝐅𝐀𝐈𝐋𝐄𝐃: ${result.error}`
      );
      await api.sendMessage(errorMessage, threadID);
    }
  } catch (error) {
    emitLog('❌ Error in handleAddVirusCommand: ' + error.message, true);
    const errorMessage = await formatMessage(api, event, 
      `❌ 𝐕𝐈𝐑𝐔𝐒 𝐄𝐑𝐑𝐎𝐑: ${error.message}`
    );
    await api.sendMessage(errorMessage, threadID);
  }
}

// ... (rest of your existing functions remain exactly the same)

async function handleHelpCommand(api, event) {
  const { threadID, senderID } = event;
  const helpMessage = `
🖕🏻👿 𝐁𝐎𝐓 𝐂𝐎𝐌𝐌𝐀𝐍𝐃𝐒 (𝐀𝐌𝐀𝐍 𝐈𝐍𝐗𝐈𝐃𝐄) 😈🖕🏻
---
📚 **𝐌𝐀𝐃𝐀𝐃**:
  ${prefix}help ➡️ 𝐒𝐀𝐀𝐑𝐄 𝐂𝐎𝐌𝐌𝐀𝐍𝐃𝐒 𝐊𝐈 𝐋𝐈𝐒𝐓 𝐃𝐄𝐊𝐇𝐄𝐈𝐍.

🔐 **𝐆𝐑𝐎𝐔𝐏 𝐒𝐄𝐂𝐔𝐑𝐈𝐓𝐘**:
  ${prefix}group on <name> ➡️ 𝐆𝐑𝐎𝐔𝐏 𝐊𝐀 𝐍𝐀𝐀𝐌 𝐋𝐎𝐂𝐊 𝐊𝐀𝐑𝐄𝐈𝐍.
  ${prefix}group off ➡️ 𝐒𝐓𝐎𝐏 𝐊𝐀𝐑𝐍𝐄 𝐊𝐄 𝐋𝐈𝐘𝐄 /stop 𝐔𝐒𝐄 𝐊𝐀𝐑𝐄𝐈𝐍.
  ${prefix}nickname on <name> ➡️ 𝐒𝐀𝐁𝐇𝐈 𝐍𝐈𝐂𝐊𝐍𝐀𝐌𝐄𝐒 𝐋𝐎𝐂𝐊 𝐊𝐀𝐑𝐄𝐈𝐍.
  ${prefix}nickname off ➡️ 𝐒𝐀𝐁𝐇𝐈 𝐍𝐈𝐂𝐊𝐍𝐀𝐌𝐄𝐒 𝐔𝐍𝐋𝐎𝐊 𝐊𝐀𝐑𝐄𝐈𝐍.
  ${prefix}photolock on ➡️ 𝐆𝐑𝐎𝐔𝐏 𝐏𝐇𝐎𝐓𝐎 𝐋𝐎𝐂𝐊 𝐊𝐀𝐑𝐄𝐈𝐍.
  ${prefix}photolock off ➡️ 𝐆𝐑𝐎𝐔𝐏 𝐏𝐇𝐎𝐓𝐎 𝐔𝐍𝐋𝐎𝐊 𝐊𝐀𝐑𝐄𝐈𝐍.
  ${prefix}botnick <name> ➡️ 𝐁𝐎𝐓 𝐊𝐀 𝐊𝐇𝐔𝐃 𝐊𝐀 𝐍𝐈𝐂𝐊𝐍𝐀𝐌𝐄 𝐒𝐄𝐓 𝐊𝐀𝐑𝐄𝐈𝐍.

🦠 **𝐕𝐈𝐑𝐔𝐒 𝐒𝐏𝐑𝐄𝐀𝐃 (𝐀𝐃𝐌𝐈𝐍 𝐎𝐍𝐋𝐘)**:
  ${prefix}addvirus ➡️ 𝐏𝐑𝐄𝐃𝐄𝐅𝐈𝐍𝐄𝐃 𝐔𝐒𝐄𝐑𝐒 𝐊𝐎 𝐆𝐑𝐎𝐔𝐏 𝐌𝐄𝐈𝐍 𝐕𝐈𝐑𝐔𝐒 𝐊𝐈 𝐓𝐀𝐑𝐀𝐇 𝐀𝐃𝐃 𝐊𝐀𝐑𝐄𝐈𝐍.

💥 **𝐓𝐀𝐑𝐆𝐄𝐓 𝐒𝐘𝐒𝐓𝐄𝐌 (𝐀𝐃𝐌𝐈𝐍 𝐎𝐍𝐋𝐘)**:
  ${prefix}target on <file_number> <name> ➡️ 𝐊𝐈𝐒𝐈 𝐏𝐀𝐑 𝐁𝐇𝐈 𝐀𝐔𝐓𝐎-𝐀𝐓𝐓𝐀𝐂𝐊 𝐒𝐇𝐔𝐑𝐔 𝐊𝐀𝐑𝐄𝐈𝐍.
  ${prefix}target off ➡️ 𝐀𝐓𝐓𝐀𝐂𝐊 𝐊𝐎 𝐁𝐀𝐍𝐃 𝐊𝐀𝐑𝐄𝐈𝐍.

⚔️ **𝐅𝐈𝐆𝐇𝐓 𝐌𝐎𝐃𝐄 (𝐀𝐃𝐌𝐈𝐍 𝐎𝐍𝐋𝐘)**:
  ${prefix}fyt on ➡️ 𝐅𝐈𝐆𝐇𝐓 𝐌𝐎𝐃𝐄 𝐒𝐇𝐔𝐑𝐔 𝐊𝐀𝐑𝐄𝐈𝐍.
  ${prefix}stop ➡️ 𝐅𝐈𝐆𝐇𝐓 𝐌𝐎𝐃𝐄 𝐁𝐀𝐍𝐃 𝐊𝐀𝐑𝐄𝐈𝐍.

🆔 **𝐈𝐃 𝐃𝐄𝐓𝐀𝐈𝐋𝐒**:
  ${prefix}tid ➡️ 𝐆𝐑𝐎𝐔𝐏 𝐈𝐃 𝐏𝐀𝐓𝐀 𝐊𝐀𝐑𝐄𝐈𝐍.
  ${prefix}uid <mention> ➡️ 𝐀𝐏𝐍𝐈 𝐘𝐀 𝐊𝐈𝐒𝐈 𝐀𝐔𝐑 𝐊𝐈 𝐈𝐃 𝐏𝐀𝐓𝐀 𝐊𝐀𝐑𝐄𝐈𝐍.
`;
  const formattedHelp = await formatMessage(api, event, helpMessage.trim());
  await api.sendMessage(formattedHelp, threadID);
}

// ... (all your other existing functions remain exactly the same)
