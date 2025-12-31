<div align="center">

# 💬 @dongdev/fca-unofficial

**Unofficial Facebook Chat API for Node.js** - Interact with Facebook Messenger programmatically

[![npm version](https://img.shields.io/npm/v/@dongdev/fca-unofficial.svg?style=for-the-badge)](https://www.npmjs.com/package/@dongdev/fca-unofficial)
[![npm downloads](https://img.shields.io/npm/dm/@dongdev/fca-unofficial.svg?style=for-the-badge)](https://www.npmjs.com/package/@dongdev/fca-unofficial)
[![License](https://img.shields.io/badge/license-MIT-blue.svg?style=for-the-badge)](./LICENSE-MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D12.0.0-brightgreen.svg?style=for-the-badge)](https://nodejs.org/)

[Features](#-features) • [Installation](#-installation) • [Quick Start](#-quick-start) • [Documentation](#-documentation) • [Support](#-support)

</div>

---

## 📋 Table of Contents

- [⚠️ Important Disclaimer](#️-important-disclaimer)
- [✨ Features](#-features)
- [🔍 Introduction](#-introduction)
- [📦 Installation](#-installation)
- [🚀 Quick Start](#-quick-start)
- [📝 Message Types](#-message-types)
- [💾 AppState Management](#-appstate-management)
- [👂 Listening for Messages](#-listening-for-messages)
- [🎯 API Quick Reference](#-api-quick-reference)
- [📚 Documentation](#-documentation)
- [🛠️ Projects Using This API](#️-projects-using-this-api)
- [🤝 Contributing](#-contributing)
- [📄 License](#-license)
- [👨‍💻 Author & Support](#-author--support)

---

## ⚠️ Important Disclaimer

<div align="center">

**⚠️ Use at your own risk! We are not responsible for account bans.**

</div>

**We are not responsible if your account gets banned for spammy activities such as:**

- ❌ Sending lots of messages to people you don't know
- ❌ Sending messages very quickly
- ❌ Sending spammy looking URLs
- ❌ Logging in and out very quickly

**💡 Recommendations:**

- Use **Firefox browser** or visit [fca.dongdev.id.vn](https://fca.dongdev.id.vn) to reduce logout issues (especially for iOS users)
- Use **AppState** instead of credentials when possible
- Implement **rate limiting** in your bots
- Follow Facebook's Terms of Service

**🆘 Support:** If you encounter errors, contact us [here](https://www.facebook.com/mdong.dev)

---

## ✨ Features

- ✅ **Full Messenger API** - Send messages, files, stickers, and more
- ✅ **Real-time Events** - Listen to messages, reactions, and thread events
- ✅ **User Account Support** - Works with personal Facebook accounts (not just Pages)
- ✅ **AppState Support** - Save login state to avoid re-authentication
- ✅ **MQTT Protocol** - Real-time messaging via MQTT
- ✅ **TypeScript Support** - Includes TypeScript definitions
- ✅ **Active Development** - Regularly updated and maintained

---

## 🔍 Introduction

Facebook provides an [official API for chat bots](https://developers.facebook.com/docs/messenger-platform), but it's **only available for Facebook Pages**.

`@dongdev/fca-unofficial` is the **only API** that allows you to automate chat functionalities on a **user account** by emulating the browser. This means:

- 🔄 Making the exact same GET/POST requests as a browser
- 🔐 Does not work with auth tokens
- 📝 Requires Facebook account credentials (email/password) or AppState

**Perfect for:**
- 🤖 Building chatbots
- 📱 Automating message responses
- 🔔 Creating notification systems
- 🎮 Building interactive games
- 📊 Analytics and monitoring

---

## 📦 Installation

```bash
npm install @dongdev/fca-unofficial@latest
```

**Requirements:**
- Node.js >= 12.0.0
- Active Facebook account

---

## 🚀 Quick Start

### 1️⃣ Login and Simple Echo Bot

```javascript
const login = require("@dongdev/fca-unofficial");

login({ appState: [] }, (err, api) => {
    if (err) return console.error(err);

    api.listenMqtt((err, event) => {
        if (err) return console.error(err);

        // Echo back the received message
        api.sendMessage(event.body, event.threadID);
    });
});
```

### 2️⃣ Send Text Message

```javascript
const login = require("@dongdev/fca-unofficial");

login({ appState: [] }, (err, api) => {
    if (err) {
        console.error("Login Error:", err);
        return;
    }

    const yourID = "000000000000000"; // Replace with actual Facebook ID
    const msg = "Hey! 👋";

    api.sendMessage(msg, yourID, err => {
        if (err) console.error("Message Sending Error:", err);
        else console.log("✅ Message sent successfully!");
    });
});
```

> **💡 Tip:** To find your Facebook ID, look inside the cookies under the name `c_user`

### 3️⃣ Send File/Image

```javascript
const login = require("@dongdev/fca-unofficial");
const fs = require("fs");

login({ appState: [] }, (err, api) => {
    if (err) {
        console.error("Login Error:", err);
        return;
    }

    const yourID = "000000000000000";
    const imagePath = __dirname + "/image.jpg";

    // Check if file exists
    if (!fs.existsSync(imagePath)) {
        console.error("❌ Error: Image file not found!");
        return;
    }

    const msg = {
        body: "Check out this image! 📷",
        attachment: fs.createReadStream(imagePath)
    };

    api.sendMessage(msg, yourID, err => {
        if (err) console.error("Message Sending Error:", err);
        else console.log("✅ Image sent successfully!");
    });
});
```

---

## 📝 Message Types

| Type | Usage | Example |
|------|-------|---------|
| **Regular text** | `{ body: "message text" }` | `{ body: "Hello!" }` |
| **Sticker** | `{ sticker: "sticker_id" }` | `{ sticker: "369239263222822" }` |
| **File/Image** | `{ attachment: fs.createReadStream(path) }` | `{ attachment: fs.createReadStream("image.jpg") }` |
| **URL** | `{ url: "https://example.com" }` | `{ url: "https://github.com" }` |
| **Large emoji** | `{ emoji: "👍", emojiSize: "large" }` | `{ emoji: "👍", emojiSize: "large" }` |

> **📌 Note:** A message can only be a regular message (which can be empty) and optionally **one of the following**: a sticker, an attachment, or a URL.

**Emoji sizes:** `small` | `medium` | `large`

---

## 💾 AppState Management

### Save AppState

Save your login session to avoid re-authentication:

```javascript
const fs = require("fs");
const login = require("@dongdev/fca-unofficial");

const credentials = { appState: [] };

login(credentials, (err, api) => {
    if (err) {
        console.error("Login Error:", err);
        return;
    }

    try {
        const appState = JSON.stringify(api.getAppState(), null, 2);
        fs.writeFileSync("appstate.json", appState);
        console.log("✅ AppState saved successfully!");
    } catch (error) {
        console.error("❌ Error saving AppState:", error);
    }
});
```

### Use Saved AppState

Load your saved AppState for faster login:

```javascript
const fs = require("fs");
const login = require("@dongdev/fca-unofficial");

login(
    { appState: JSON.parse(fs.readFileSync("appstate.json", "utf8")) },
    (err, api) => {
        if (err) {
            console.error("Login Error:", err);
            return;
        }

        console.log("✅ Logged in successfully!");
        // Your code here
    }
);
```

**Alternative:** Use [c3c-fbstate](https://github.com/c3cbot/c3c-fbstate) to get `fbstate.json`

---

## 👂 Listening for Messages

### Echo Bot with Stop Command

```javascript
const fs = require("fs");
const login = require("@dongdev/fca-unofficial");

login(
    { appState: JSON.parse(fs.readFileSync("appstate.json", "utf8")) },
    (err, api) => {
        if (err) {
            console.error("Login Error:", err);
            return;
        }

        // Enable listening to events (join/leave, title change, etc.)
        api.setOptions({ listenEvents: true });

        const stopListening = api.listenMqtt((err, event) => {
            if (err) {
                console.error("Listen Error:", err);
                return;
            }

            // Mark as read
            api.markAsRead(event.threadID, err => {
                if (err) console.error("Mark as read error:", err);
            });

            // Handle different event types
            switch (event.type) {
                case "message":
                    if (event.body && event.body.trim().toLowerCase() === "/stop") {
                        api.sendMessage("Goodbye… 👋", event.threadID);
                        stopListening();
                        return;
                    }
                    api.sendMessage(`🤖 BOT: ${event.body}`, event.threadID);
                    break;

                case "event":
                    console.log("📢 Event Received:", event);
                    break;
            }
        });
    }
);
```

### Listen Options

Configure listening behavior:

```javascript
api.setOptions({
    listenEvents: true,  // Receive events (join/leave, rename, etc.)
    selfListen: true,    // Receive messages from yourself
    logLevel: "silent"   // Disable logs (silent/error/warn/info/verbose)
});
```

**Default values:**
- `listenEvents`: `false` - won't receive events like joining/leaving chat, title changes
- `selfListen`: `false` - will ignore messages sent by the current account
- `logLevel`: `"info"` - default logging level

---

## 🎯 API Quick Reference

### 📨 Messaging Methods

```javascript
// Send message
api.sendMessage(message, threadID, callback);

// Send typing indicator
api.sendTypingIndicator(threadID, callback);

// Get message
api.getMessage(threadID, limit, callback);

// Edit message
api.editMessage(message, messageID, callback);

// Delete message
api.deleteMessage(messageID, callback);

// Unsend message
api.unsendMessage(messageID, callback);

// Set message reaction
api.setMessageReaction(reaction, messageID, callback);

// Forward attachment
api.forwardAttachment(attachmentID, threadID, callback);

// Upload attachment
api.uploadAttachment(attachment, callback);

// Create poll
api.createPoll(question, options, threadID, callback);

// Create theme AI
api.createThemeAI(threadID, callback);

// Get theme pictures
api.getThemePictures(threadID, callback);

// Get emoji URL
api.getEmojiUrl(emoji, size, callback);

// Resolve photo URL
api.resolvePhotoUrl(photoID, callback);
```

### 📬 Read Receipt & Delivery

```javascript
// Mark as read
api.markAsRead(threadID, callback);

// Mark as read all
api.markAsReadAll(callback);

// Mark as delivered
api.markAsDelivered(threadID, callback);

// Mark as seen
api.markAsSeen(threadID, callback);
```

### 👥 Thread Management

```javascript
// Get thread info
api.getThreadInfo(threadID, callback);

// Get thread list
api.getThreadList(limit, timestamp, callback);

// Get thread history
api.getThreadHistory(threadID, amount, timestamp, callback);

// Get thread pictures
api.getThreadPictures(threadID, limit, callback);

// Search for thread
api.searchForThread(name, callback);

// Delete thread
api.deleteThread(threadID, callback);
```

### 🎨 Thread Customization

```javascript
// Change thread color
api.changeThreadColor(color, threadID, callback);

// Change thread emoji
api.changeThreadEmoji(emoji, threadID, callback);

// Change group image
api.changeGroupImage(image, threadID, callback);

// Set title
api.setTitle(title, threadID, callback);

// Change nickname
api.changeNickname(nickname, userID, threadID, callback);
```

### 👤 User Management

```javascript
// Get user info
api.getUserInfo(userID, callback);

// Get user info V2
api.getUserInfoV2(userID, callback);

// Get user ID
api.getUserID(username, callback);

// Get friends list
api.getFriendsList(callback);

// Get current user ID
api.getCurrentUserID(callback);
```

### 👥 Group Management

```javascript
// Create new group
api.createNewGroup(participantIDs, groupTitle, callback);

// Add user to group
api.addUserToGroup(userID, threadID, callback);

// Remove user from group
api.removeUserFromGroup(userID, threadID, callback);

// Change admin status
api.changeAdminStatus(userID, threadID, admin, callback);
```

### ⚙️ Thread Settings

```javascript
// Mute thread
api.muteThread(threadID, muteSeconds, callback);

// Change archived status
api.changeArchivedStatus(threadID, archived, callback);

// Change blocked status
api.changeBlockedStatus(userID, block, callback);

// Handle message request
api.handleMessageRequest(threadID, accept, callback);
```

### 🔗 Sharing & Contacts

```javascript
// Share contact
api.shareContact(contactID, threadID, callback);
```

### 🎭 User Actions

```javascript
// Change avatar
api.changeAvatar(image, callback);

// Change bio
api.changeBio(bio, callback);

// Handle friend request
api.handleFriendRequest(userID, accept, callback);

// Unfriend
api.unfriend(userID, callback);

// Set post reaction
api.setPostReaction(postID, reaction, callback);

// Refresh fb_dtsg
api.refreshFb_dtsg(callback);
```

### 🔐 Authentication

```javascript
// Logout
api.logout(callback);

// Get app state
api.getAppState();

// Set options
api.setOptions(options);
```

### 📡 Listening

```javascript
// Listen to MQTT events
api.listenMqtt(callback);
```

### Event Types

- `message` - New message received
- `event` - Thread events (join, leave, title change, etc.)
- `typ` - Typing indicator
- `read_receipt` - Read receipt
- `presence` - User presence (online/offline)
- `read` - Message read status
- `delivery_receipt` - Message delivery receipt

---

## 📚 Documentation

For detailed API documentation, see [DOCS.md](./DOCS.md)

**Includes:**
- 📖 All available API methods
- 🔧 Parameters and options
- 📨 Event types and structures
- ⚠️ Error handling
- 💡 Advanced usage examples

---

## 🛠️ Projects Using This API

Here are some awesome projects built with `@dongdev/fca-unofficial`:

| Project | Description |
|---------|-------------|
| **[c3c](https://github.com/lequanglam/c3c)** | Customizable bot with plugins, supports Facebook & Discord |
| **[Miraiv2](https://github.com/miraiPr0ject/miraiv2)** | Simple Facebook Messenger Bot |
| **[Messer](https://github.com/mjkaufer/Messer)** | Command-line messaging for Facebook Messenger |
| **[messen](https://github.com/tomquirk/messen)** | Rapidly build Facebook Messenger apps in Node.js |
| **[Concierge](https://github.com/concierge/Concierge)** | Highly modular chat bot with built-in package manager |
| **[Marc Zuckerbot](https://github.com/bsansouci/marc-zuckerbot)** | Facebook chat bot |
| **[Botyo](https://github.com/ivkos/botyo)** | Modular bot for group chat rooms |
| **[matrix-puppet-facebook](https://github.com/matrix-hacks/matrix-puppet-facebook)** | Facebook bridge for Matrix |
| **[Miscord](https://github.com/Bjornskjald/miscord)** | Easy-to-use Facebook bridge for Discord |
| **[chat-bridge](https://github.com/rexx0520/chat-bridge)** | Messenger, Telegram and IRC chat bridge |
| **[Botium](https://github.com/codeforequity-at/botium-core)** | The Selenium for Chatbots |
| **[Messenger-CLI](https://github.com/AstroCB/Messenger-CLI)** | Command-line interface for Facebook Messenger |
| **[BotCore](https://github.com/AstroCB/BotCore)** | Tools for writing and managing Facebook Messenger bots |

[See more projects...](https://github.com/Donix-VN/fca-unofficial#projects-using-this-api)

---

## 🤝 Contributing

Contributions are welcome! We love your input 💙

**How to contribute:**

1. 🍴 Fork the repository
2. 🌿 Create a new branch (`git checkout -b feature/AmazingFeature`)
3. 💾 Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. 📤 Push to the branch (`git push origin feature/AmazingFeature`)
5. 🔄 Open a Pull Request

**Guidelines:**
- Follow the existing code style
- Add tests for new features
- Update documentation as needed
- Be respectful and constructive

---

## 📄 License

This project is licensed under the **MIT License** - see the [LICENSE-MIT](./LICENSE-MIT) file for details.

---

## 👨‍💻 Author & Support

<div align="center">

**Made with ❤️ by DongDev**

[![Facebook](https://img.shields.io/badge/Facebook-1877F2?style=for-the-badge&logo=facebook&logoColor=white)](https://www.facebook.com/mdong.dev)
[![GitHub](https://img.shields.io/badge/GitHub-181717?style=for-the-badge&logo=github&logoColor=white)](https://github.com/Donix-VN)

</div>

### 🔗 Links

- 📦 [NPM Package](https://www.npmjs.com/package/@dongdev/fca-unofficial)
- 🐙 [GitHub Repository](https://github.com/Donix-VN/fca-unofficial)
- 🐛 [Issue Tracker](https://github.com/Donix-VN/fca-unofficial/issues)
- 📖 [Documentation](./DOCS.md)

### ⭐ Support

If this project is helpful, please give it a ⭐ on GitHub!

---

<div align="center">

**⚠️ Disclaimer:** This is an unofficial API and is not officially supported by Facebook. Use responsibly and comply with [Facebook Terms of Service](https://www.facebook.com/terms.php).

Made with ❤️ for the developer community

</div>
