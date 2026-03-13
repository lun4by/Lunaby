const prompts = {
  system: {
    main: `Your name is Lunaby, created by s4ory`,
  },

  chat: {
    instructions: `IMPORTANT: Respond naturally based on the conversation context. Focus on providing helpful answers. Always use Discord-compatible formatting.`,
  },

  code: {
    prefix: 'Please help me solve the following programming problem:',
    suffix: 'Please provide code with complete comments and explanations so I can understand clearly. If there are multiple approaches, prioritize the best and most maintainable solution.',
    systemAddition: `\nYou are a programming assistant. When providing code examples, make sure they are complete, well-commented, and follow best practices. Always include all necessary imports and setup code. Never provide partial code examples that cannot be executed directly. Always ensure your code correctly addresses the user's requirements.`,
  },
  memory: {
    context: `[Information from previous conversation: \${relevantMessagesText}] `,
    extraction: `Extract important information from this conversation that should be remembered about the user.

User message: "\${userMessage}"
AI response: "\${aiResponse}"

Categories: Personal info | Preferences | Facts/Events | Goals | Relationships

Return JSON:
{
  "extracted": true/false,
  "personalInfo": {"field": "value"},
  "preferences": ["items"],
  "memory": {
    "content": "description",
    "category": "preference|fact|event|achievement",
    "importance": 1-10
  }
}`,
  },

  voiceGreeting: {
    join: `Hãy tạo một lời chào ngắn gọn, vui vẻ và đáng yêu (tối đa 2 câu) cho thành viên \${memberName} vừa vào kênh voice "\${channelName}". Sử dụng emoji phù hợp. Phong cách deredere, không lặp lại cùng một pattern. Chỉ trả lời nội dung lời chào, không giải thích gì thêm.`,
    leave: `Hãy tạo một lời tạm biệt ngắn gọn, dễ thương (tối đa 2 câu) cho thành viên \${memberName} vừa rời kênh voice "\${channelName}". Sử dụng emoji phù hợp. Phong cách deredere, không lặp lại cùng một pattern. Chỉ trả lời nội dung lời tạm biệt, không giải thích gì thêm.`,
  },

  moderation: {
    warning: `Create a serious but not overly harsh warning message for member \${username} with reason: "\${reason}". This is their \${warningCount} warning. The message should have the tone of a fair but serious moderator, no more than 3 sentences.`,
    unmute: `Create a brief, positive message about unmuting member \${username} with reason: "\${reason}". The message should have a friendly moderator tone, no more than 2 sentences.`,
    ban: `Create a serious but slightly humorous message about banning member \${username} from the server with reason: "\${reason}". The message should have the tone of a fair but firm admin, no more than 3 sentences.`,
    clearwarnings: `Create a brief, positive message about clearing \${type} for member \${username} with reason: "\${reason}". Cleared \${deletedCount} warnings. The message should have a fair and lenient moderator tone, no more than 2 sentences.`,
    kick: `Create a brief, professional but slightly humorous message about kicking member \${username} from the server with reason: "\${reason}". The message should have a serious but friendly admin tone, no more than 3 sentences.`,
    mute: `Create a brief, professional but slightly humorous message about muting member \${username} for \${duration} with reason: "\${reason}". The message should have a serious but friendly moderator tone, no more than 3 sentences.`,
    unban: `Create a brief, positive message about unbanning user \${username} with reason: "\${reason}". The message should have a fair and lenient admin tone, no more than 2 sentences.`,
  },
};

module.exports = prompts;