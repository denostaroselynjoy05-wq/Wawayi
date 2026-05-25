import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getDatabase, ref, set, push, onValue, update, remove } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

// Ginamit ang Public Chatbox Database para diretsong magkonekta ang lahat ng device ninyo sa internet
const firebaseConfig = {
    databaseURL: "https://chatbox-78d7c-default-rtdb.asia-southeast1.firebasedatabase.app"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const allowedUsers = ["Angel", "Ellen", "Roselyn", "Jelly", "Althea", "Rosela", "Mary"];
const userAvatars = {
    "Angel": "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100",
    "Ellen": "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100",
    "Roselyn": "https://i.imgur.com/3ZQ3Z6v.png",
    "Jelly": "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=100",
    "Althea": "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=100",
    "Rosela": "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100",
    "Mary": "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100"
};

let currentUser = null;
let activeChatId = null;
let activeChatType = '';
let typingTimeout = null;

// Puwersahang setup ng default system data sa Cloud Database para sa multi-device sync
allowedUsers.forEach(user => {
    onValue(ref(db, `users/${user}`), (snapshot) => {
        if(!snapshot.exists()){
            set(ref(db, `users/${user}`), { username: user, avatar: userAvatars[user], status: "offline" });
        }
    }, { onlyOnce: true });
});

onValue(ref(db, 'groups/g1'), (snapshot) => {
    if(!snapshot.exists()){
        set(ref(db, 'groups/g1'), { id: "g1", name: "Friends Group Chat", avatar: "https://i.imgur.com/3ZQ3Z6v.png", members: ["Angel", "Ellen", "Roselyn"] });
    }
}, { onlyOnce: true });

// LOGIN ACTIONS
document.getElementById('loginBtn').onclick = function() {
    const nameInput = document.getElementById('reg-username').value.trim();
    if(!nameInput) return alert("Please enter your name!");

    const officialName = allowedUsers.find(user => user.toLowerCase() === nameInput.toLowerCase());
    if(!officialName) return alert("Your name is not included!");

    currentUser = { username: officialName, avatar: userAvatars[officialName] };
    
    // I-broadcast sa buong mundo/lahat ng devices na ONLINE ka na ngayon
    update(ref(db, `users/${officialName}`), { status: "online" });

    // Kapag isinarado ang browser tab sa kahit anong device, mag-o-offline ka agad sa cloud
    onDisconnect(ref(db, `users/${officialName}`), { status: "offline" });

    document.getElementById('my-name').innerText = currentUser.username;
    document.getElementById('my-avatar').src = currentUser.avatar;
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('main-screen').classList.remove('hidden');

    initLiveSync();
};

function onDisconnect(dbRef, activeData) {
    window.addEventListener('beforeunload', () => {
        update(dbRef, activeData);
    });
}

// REALTIME NETWORK SYNC ENGINE
function initLiveSync() {
    // Makinig sa pagbabago ng users list sa buong mundo
    onValue(ref(db, 'users'), () => {
        loadSidebarLists();
    });

    // Makinig sa mga bagong groups
    onValue(ref(db, 'groups'), () => {
        loadSidebarLists();
    });

    // Makinig sa mga bagong chat messages mula sa kahit anong device
    onValue(ref(db, 'messages'), () => {
        if(activeChatId) renderMessages();
    });

    // Makinig sa real-time typing indicators
    onValue(ref(db, 'typing'), () => {
        if(activeChatId) checkTypingStatus();
    });
}

function loadSidebarLists() {
    onValue(ref(db, 'users'), (snap) => {
        const usersList = document.getElementById('users-list');
        usersList.innerHTML = '';
        snap.forEach(child => {
            const u = child.val();
            if(u.username === currentUser.username) return;

            const item = document.createElement('div');
            item.className = `list-item ${activeChatId === u.username ? 'active' : ''}`;
            item.onclick = () => startChat(u.username, 'private', u.avatar, u.status);
            item.innerHTML = `
                <div style="position:relative;">
                    <img src="${u.avatar}" class="avatar">
                    <span class="status-dot status-${u.status}" style="position:absolute; bottom:0; right:0;"></span>
                </div>
                <div class="list-item-info"><strong>${u.username}</strong></div>
            `;
            usersList.appendChild(item);
        });
    }, { onlyOnce: true });

    onValue(ref(db, 'groups'), (snap) => {
        const groupList = document.getElementById('group-list');
        groupList.innerHTML = '';
        snap.forEach(child => {
            const g = child.val();
            if(!g.members || !g.members.includes(currentUser.username)) return;

            const item = document.createElement('div');
            item.className = `list-item ${activeChatId === g.id ? 'active' : ''}`;
            item.onclick = () => startChat(g.id, 'group', g.avatar, '');
            item.innerHTML = `
                <img src="${g.avatar}" class="avatar">
                <div class="list-item-info"><strong>${g.name}</strong></div>
            `;
            groupList.appendChild(item);
        });
    }, { onlyOnce: true });
}

function startChat(id, type, avatar, statusText) {
    activeChatId = id;
    activeChatType = type;

    document.getElementById('blank-chat-view').classList.add('hidden');
    document.getElementById('active-chat-view').classList.remove('hidden');
    document.getElementById('chat-target-avatar').src = avatar;
    
    if(type === 'group') {
        onValue(ref(db, `groups/${id}`), (snapshot) => {
            const currentGroup = snapshot.val();
            if(!currentGroup) return;
            document.getElementById('chat-target-name').innerText = currentGroup.name;
            document.getElementById('chat-target-status').innerText = currentGroup.members.join(' • ');
            document.getElementById('add-member-btn').classList.remove('hidden');
        }, { onlyOnce: true });
    } else {
        document.getElementById('chat-target-name').innerText = id;
        document.getElementById('chat-target-status').innerText = statusText.toUpperCase();
        document.getElementById('add-member-btn').classList.add('hidden');
    }

    renderMessages();
}

// MESSAGES CONTROLLER
document.getElementById('sendMsgBtn').onclick = sendMessage;
function sendMessage() {
    const input = document.getElementById('message-input');
    const text = input.value.trim();
    if(!text) return;

    const messagesRef = ref(db, 'messages');
    const newMsgRef = push(messagesRef);
    
    set(newMsgRef, {
        id: newMsgRef.key,
        from: currentUser.username,
        to: activeChatId,
        type: 'text',
        content: text,
        timestamp: Date.now()
    });

    input.value = '';
    remove(ref(db, `typing/${activeChatId}_${currentUser.username}`));
}

// IMAGE CONTROLLER (BASE64 SYNC)
document.getElementById('img-input').onchange = function(event) {
    const file = event.target.files[0];
    if(!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const messagesRef = ref(db, 'messages');
        const newMsgRef = push(messagesRef);
        set(newMsgRef, {
            id: newMsgRef.key,
            from: currentUser.username,
            to: activeChatId,
            type: 'image',
            content: e.target.result,
            timestamp: Date.now()
        });
    }
    reader.readAsDataURL(file);
};

function renderMessages() {
    onValue(ref(db, 'messages'), (snapshot) => {
        const msgBox = document.getElementById('messages-box');
        msgBox.innerHTML = '';
        
        snapshot.forEach(child => {
            const m = child.val();
            let pass = false;
            if(activeChatType === 'group' && m.to === activeChatId) pass = true;
            if(activeChatType === 'private' && ((m.from === currentUser.username && m.to === activeChatId) || (m.from === activeChatId && m.to === currentUser.username))) pass = true;

            if(!pass) return;

            const isMe = m.from === currentUser.username;
            const wrapper = document.createElement('div');
            wrapper.className = `msg-wrapper ${isMe ? 'me' : 'other'}`;
            const timeString = new Date(m.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            let contentHtml = m.type === 'text' ? m.content : `<img src="${m.content}">`;
            
            let reactionHtml = m.reactions ? `<div class="reactions-display">${Object.values(m.reactions).join(' ')}</div>` : '';

            wrapper.innerHTML = `
                <span class="msg-sender">${m.from}</span>
                <div class="msg-bubble">
                    ${contentHtml}
                    <div class="msg-meta">${timeString}</div>
                    <div class="msg-actions">
                        <button class="react-btn" data-id="${m.id}" data-emoji="❤️">❤️</button>
                        <button class="react-btn" data-id="${m.id}" data-emoji="👍">👍</button>
                        <button class="react-btn" data-id="${m.id}" data-emoji="😂">😂</button>
                        ${isMe ? `<button class="del-btn" data-id="${m.id}">🗑️</button>` : ''}
                    </div>
                </div>
                ${reactionHtml}
            `;
            msgBox.appendChild(wrapper);
        });
        
        // Dynamic event listeners binding for cloud elements
        document.querySelectorAll('.react-btn').forEach(b => {
            b.onclick = () => {
                const mid = b.getAttribute('data-id');
                const em = b.getAttribute('data-emoji');
                set(ref(db, `messages/${mid}/reactions/${currentUser.username}`), em);
            };
        });

        document.querySelectorAll('.del-btn').forEach(b => {
            b.onclick = () => {
                const mid = b.getAttribute('data-id');
                remove(ref(db, `messages/${mid}`));
            };
        });

        msgBox.scrollTop = msgBox.scrollHeight;
    }, { onlyOnce: true });
    
    checkTypingStatus();
}

// GROUP MANAGEMENT
document.getElementById('createGroupBtn').onclick = function() {
    const groupName = prompt("Enter New Group Chat Name:");
    if(!groupName) return;

    const groupRef = ref(db, 'groups');
    const newGroupRef = push(groupRef);
    set(newGroupRef, {
        id: newGroupRef.key,
        name: groupName,
        avatar: "https://i.imgur.com/3ZQ3Z6v.png",
        members: [currentUser.username]
    });
};

document.getElementById('add-member-btn').onclick = function() {
    const memberName = prompt("Add friend name to group:\n(Angel, Ellen, Roselyn, Jelly, Althea, Rosela, Mary)");
    if(!memberName) return;

    const formattedName = allowedUsers.find(u => u.toLowerCase() === memberName.trim().toLowerCase());
    if(!formattedName) return alert("System User not found!");

    onValue(ref(db, `groups/${activeChatId}`), (snapshot) => {
        const gData = snapshot.val();
        if(!gData.members.includes(formattedName)){
            gData.members.push(formattedName);
            update(ref(db, `groups/${activeChatId}`), { members: gData.members });
            alert("Added successfully!");
        }
    }, { onlyOnce: true });
};

// LIVE TYPING CONTROLLER
document.getElementById('message-input').oninput = function() {
    set(ref(db, `typing/${activeChatId}_${currentUser.username}`), currentUser.username);
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        remove(ref(db, `typing/${activeChatId}_${currentUser.username}`));
    }, 2000);
};

function checkTypingStatus() {
    onValue(ref(db, 'typing'), (snapshot) => {
        let typingText = '';
        snapshot.forEach(child => {
            const key = child.key;
            if(key.startsWith(activeChatId) && !key.endsWith(currentUser.username)){
                typingText = `${child.val()} is typing... 🌸`;
            }
        });
        document.getElementById('typing-indicator').innerText = typingText;
    }, { onlyOnce: true });
}

// THEME SWITCHER
document.getElementById('themeBtn').onclick = function() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    document.documentElement.setAttribute('data-theme', currentTheme === 'dark' ? 'light' : 'dark');
};

// ENTER CLICKS
document.addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
        if (document.activeElement.id === 'reg-username') document.getElementById('loginBtn').click();
        if (document.activeElement.id === 'message-input') sendMessage();
    }
});
      
