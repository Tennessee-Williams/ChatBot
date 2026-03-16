const messagesEl = document.getElementById("messages");
const chatContainer = document.getElementById("chatContainer");
const typingIndicator = document.getElementById("typingIndicator");
const welcomeCard = document.getElementById("welcomeCard");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");

let conversationHistory = [];

// Auto-resize textarea
messageInput.addEventListener("input", () => {
  messageInput.style.height = "auto";
  messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + "px";
});

// Send on Enter (Shift+Enter for newline)
messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

function askQuestion(question) {
  messageInput.value = question;
  sendMessage();
}

async function sendMessage() {
  const message = messageInput.value.trim();
  if (!message) return;

  // Hide welcome card after first message
  if (welcomeCard) {
    welcomeCard.style.display = "none";
  }

  // Add user message
  appendMessage("user", message);
  conversationHistory.push({ role: "user", content: message });

  // Clear input
  messageInput.value = "";
  messageInput.style.height = "auto";

  // Show typing indicator
  typingIndicator.classList.add("active");
  scrollToBottom();

  // Disable input while waiting
  messageInput.disabled = true;
  sendBtn.disabled = true;

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        history: conversationHistory.slice(-10),
      }),
    });

    if (!res.ok) throw new Error("Request failed");

    const data = await res.json();

    // Hide typing indicator
    typingIndicator.classList.remove("active");

    // Add bot message
    appendMessage("bot", data.reply, data.sources);
    conversationHistory.push({ role: "assistant", content: data.reply });
  } catch {
    typingIndicator.classList.remove("active");
    appendMessage(
      "bot",
      "Oops! Something went wrong on my end. Please try again in a moment. 😅"
    );
  } finally {
    messageInput.disabled = false;
    sendBtn.disabled = false;
    messageInput.focus();
  }
}

function appendMessage(role, text, sources) {
  const wrapper = document.createElement("div");
  wrapper.className = `message ${role}`;

  let avatarHtml;
  if (role === "bot") {
    avatarHtml = `<img src="/Images/Avatar.png" alt="Charlie" class="msg-avatar" />`;
  } else {
    avatarHtml = `<div class="user-icon">You</div>`;
  }

  let sourcesHtml = "";
  if (sources && sources.length > 0) {
    const tags = sources
      .map((s) => `<span class="source-tag">📄 ${s}</span>`)
      .join("");
    sourcesHtml = `<div class="sources">${tags}</div>`;
  }

  const formattedText = formatMarkdown(text);

  wrapper.innerHTML = `
    ${avatarHtml}
    <div class="bubble">
      ${formattedText}
      ${sourcesHtml}
    </div>
  `;

  messagesEl.appendChild(wrapper);
  scrollToBottom();
}

function formatMarkdown(text) {
  // Convert markdown-ish text to HTML
  return text
    .split("\n\n")
    .map((block) => {
      // Bullet lists
      if (block.match(/^[-•*] /m)) {
        const items = block
          .split("\n")
          .filter((l) => l.match(/^[-•*] /))
          .map((l) => `<li>${escapeHtml(l.replace(/^[-•*] /, ""))}</li>`)
          .join("");
        return `<ul>${items}</ul>`;
      }
      // Numbered lists
      if (block.match(/^\d+\. /m)) {
        const items = block
          .split("\n")
          .filter((l) => l.match(/^\d+\. /))
          .map((l) => `<li>${escapeHtml(l.replace(/^\d+\. /, ""))}</li>`)
          .join("");
        return `<ol>${items}</ol>`;
      }
      // Regular paragraph
      return `<p>${formatInline(block)}</p>`;
    })
    .join("");
}

function formatInline(text) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/\n/g, "<br>");
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    chatContainer.scrollTop = chatContainer.scrollHeight;
  });
}

function resetChat() {
  conversationHistory = [];
  messagesEl.innerHTML = "";
  welcomeCard.style.display = "";
  messageInput.value = "";
  messageInput.style.height = "auto";
  messageInput.focus();
}
