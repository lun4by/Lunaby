const AICore = require('./AICore');
const Validators = require('../../utils/validators');
const { DISCORD_MESSAGE_MAX_LENGTH } = require('../../config/constants');

function splitByLength(text, maxLength) {
    const chunks = [];
    let start = 0;
    while (start < text.length) {
        let end = Math.min(start + maxLength, text.length);
        if (end < text.length) {
            while (end > start && text[end] !== ' ' && text[end] !== '\n') end--;
            if (end === start) end = start + maxLength;
        }
        chunks.push(text.substring(start, end));
        start = end + (text[end] === ' ' || text[end] === '\n' ? 1 : 0);
    }
    return chunks;
}

async function sendStreamingMessage(channel, messages, config = {}, replyToMessage = null) {
    const client = AICore.getClient();
    if (!client) throw new Error('SDK client not initialized');

    const validMessages = Validators.cleanMessages(messages);
    if (!validMessages.length) throw new Error('No valid messages');

    const streamDelay = config.streamDelay || 0;

    const stream = await client.chat.createStream(validMessages, {
        max_tokens: config.max_tokens || 2048,
        ...config
    });

    let sentMessage = null;
    let isEditing = false;
    let pendingAccumulated = null;

    // Hàng đợi hiển thị dựa trên Mutex, ngăn chặn việc chỉnh sửa tin nhắn Discord chồng chéo
    const processDisplayQueue = async () => {
        if (isEditing) return;
        isEditing = true;

        while (pendingAccumulated !== null) {
            const currentAccum = pendingAccumulated;
            pendingAccumulated = null;

            const textToUpdate = currentAccum.substring(0, DISCORD_MESSAGE_MAX_LENGTH);

            try {
                if (!sentMessage) {
                    sentMessage = replyToMessage
                        ? await replyToMessage.reply(textToUpdate)
                        : await channel.send(textToUpdate);
                } else if (currentAccum.length <= DISCORD_MESSAGE_MAX_LENGTH) {
                    await sentMessage.edit(textToUpdate);
                }
            } catch (e) {
                if (e.code === 10008) sentMessage = null;
            }

            // Khoảng nghỉ nhỏ giữa các lần edit để tránh bị Discord throttle
            await new Promise(r => setTimeout(r, 100));
        }

        isEditing = false;
    };

    // Chế độ đệm (Buffered mode): setInterval xả bộ đệm theo chu kỳ
    let bufferInterval = null;
    if (streamDelay > 0) {
        bufferInterval = setInterval(() => {
            if (pendingAccumulated !== null) {
                processDisplayQueue();
            }
        }, streamDelay);
    }

    const typingInterval = setInterval(() => channel.sendTyping().catch(() => { }), 5000);

    try {
        const fullContent = await stream.process({
            onContent: async (chunk, accumulated) => {
                if (streamDelay > 0) {
                    pendingAccumulated = accumulated;

                    if (!sentMessage) {
                        processDisplayQueue();
                    }
                } else {
                    pendingAccumulated = accumulated;
                    processDisplayQueue();
                }
            }
        });

        if (!fullContent || fullContent.trim().length === 0) {
            throw new Error('AI returned empty content');
        }

        if (bufferInterval) clearInterval(bufferInterval);

        // Đợi cho đến khi toàn bộ hàng đợi hiển thị (render) hiện tại đã hoàn tất
        while (isEditing) {
            await new Promise(r => setTimeout(r, 100));
        }

        const sendOrReply = (text) => replyToMessage ? replyToMessage.reply(text) : channel.send(text);

        if (fullContent.length <= DISCORD_MESSAGE_MAX_LENGTH) {
            if (sentMessage && sentMessage.content !== fullContent) {
                await sentMessage.edit(fullContent);
            } else if (!sentMessage) {
                sentMessage = await sendOrReply(fullContent);
            }
        } else {
            const first = fullContent.substring(0, DISCORD_MESSAGE_MAX_LENGTH);
            if (sentMessage) await sentMessage.edit(first);
            else await sendOrReply(first);

            for (const chunk of splitByLength(fullContent.substring(DISCORD_MESSAGE_MAX_LENGTH), DISCORD_MESSAGE_MAX_LENGTH)) {
                await channel.send(chunk);
                await new Promise(r => setTimeout(r, 100));
            }
        }

        return fullContent;
    } finally {
        if (bufferInterval) clearInterval(bufferInterval);
        clearInterval(typingInterval);
    }
}

module.exports = { sendStreamingMessage, splitByLength };