const { AttachmentBuilder } = require('discord.js');
const Canvas = require('canvas');
const text = require('../../utils/string');

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  let lines = [];
  
  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    const metrics = ctx.measureText(testLine);
    const testWidth = metrics.width;
    if (testWidth > maxWidth && n > 0) {
      lines.push(line);
      line = words[n] + ' ';
    } else {
      line = testLine;
    }
  }
  lines.push(line);
  
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], x, y + (i * lineHeight), maxWidth);
  }
  
  return lines.length;
}

const generateRankCard = async (member, author, level, xp, mlvlcap, maxXPThisLevel, curXPThisLevel, percentage, rank, wreathUrl, profileCustomization = {}) => {
  const canvas = Canvas.createCanvas(800, 600);
  const ctx = canvas.getContext('2d');
  
  const {
    background = null,
    pattern = null,
    emblem = null,
    hat = null,
    wreath = null,
    color = 'rgb(255,182,193)',
    bio = 'No bio written.',
    birthday = 'Not Set'
  } = profileCustomization;

  const displayBio = bio || 'No bio written.';
  const displayBirthday = birthday || 'Not Set';
  const displayColor = color || 'rgb(255,182,193)';

  let defBackground, defPattern, avatarImg, emblemImg, wreathImg, hatImg;
  
  try {
    if (background) {
      defBackground = await Canvas.loadImage(background);
    } else {
      defBackground = await Canvas.loadImage('https://i.imgur.com/57eRI6H.jpg');
    }
  } catch (err) {
    const grad = ctx.createLinearGradient(0, 0, 800, 600);
    grad.addColorStop(0, '#1a1a2e');
    grad.addColorStop(1, '#16213e');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 800, 600);
  }

  try {
    if (pattern) {
      defPattern = await Canvas.loadImage(pattern);
    } else {
      defPattern = await Canvas.loadImage('https://i.imgur.com/nx5qJUb.png');
    }
  } catch (err) {
    defPattern = null;
  }

  try {
    avatarImg = await Canvas.loadImage(author.displayAvatarURL({ extension: 'png', size: 256 }));
  } catch (err) {
    avatarImg = null;
  }

  try {
    if (emblem) {
      emblemImg = await Canvas.loadImage(emblem);
    }
  } catch (err) {
    emblemImg = null;
  }

  try {
    if (wreath || wreathUrl) {
      wreathImg = await Canvas.loadImage(wreath || wreathUrl);
    }
  } catch (err) {
    wreathImg = null;
  }

  try {
    if (hat) {
      hatImg = await Canvas.loadImage(hat);
    }
  } catch (err) {
    hatImg = null;
  }

  if (defBackground) {
    ctx.drawImage(defBackground, 300, 65, 475, 250);
  }

  ctx.beginPath();
  ctx.moveTo(300, 315);
  ctx.lineTo(canvas.width - 5, 315);
  ctx.lineTo(canvas.width - 5, canvas.height - 25);
  ctx.lineTo(300, canvas.height - 25);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetX = -10;
  ctx.shadowOffsetY = -40;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(370, 338);
  ctx.lineTo(canvas.width - 40, 338);
  ctx.arcTo(canvas.width - 20, 338, canvas.width - 20, 358, 20);
  ctx.lineTo(canvas.width - 20, 378);
  ctx.arcTo(canvas.width - 20, 398, canvas.width - 40, 398, 20);
  ctx.lineTo(330, 398);
  ctx.arcTo(310, 398, 310, 378, 20);
  ctx.lineTo(310, 358);
  ctx.arcTo(310, 338, 330, 338, 20);
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.stroke();

  ctx.font = 'bold 20px sans-serif';
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = 0;
  ctx.fillText('BIO', 330, 345, 50);

  ctx.font = '15px sans-serif';
  ctx.fillStyle = 'rgba(0,0,0,0.8)';
  ctx.textAlign = 'center';
  wrapText(ctx, displayBio, 555, 368, 480, 20);

  ctx.beginPath();
  ctx.moveTo(410, 419);
  ctx.lineTo(520, 419);
  ctx.arcTo(540, 419, 540, 439, 20);
  ctx.arcTo(540, 459, 520, 459, 20);
  ctx.lineTo(330, 459);
  ctx.arcTo(310, 459, 310, 439, 20);
  ctx.arcTo(310, 419, 330, 419, 20);
  ctx.stroke();

  ctx.font = 'bold 18px sans-serif';
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.textAlign = 'left';
  ctx.fillText('BIRTHDAY', 330, 425, 80);

  ctx.font = '15px sans-serif';
  ctx.fillStyle = 'rgba(0,0,0,0.8)';
  ctx.fillText(displayBirthday, 330, 445, 230);

  ctx.beginPath();
  ctx.moveTo(410, 479);
  ctx.lineTo(520, 479);
  ctx.arcTo(540, 479, 540, 499, 20);
  ctx.lineTo(540, 509);
  ctx.arcTo(540, 529, 520, 529, 20);
  ctx.lineTo(330, 529);
  ctx.arcTo(310, 529, 310, 509, 20);
  ctx.lineTo(310, 499);
  ctx.arcTo(310, 479, 330, 479, 20);
  ctx.stroke();

  ctx.font = 'bold 18px sans-serif';
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.textAlign = 'left';
  ctx.fillText('BALANCE', 330, 485, 80);

  ctx.font = '18px sans-serif';
  ctx.fillStyle = 'rgba(0,0,0,0.8)';
  ctx.fillText('💴: 0', 330, 512, 80);
  ctx.fillText('🏦: 0', 430, 512, 80);

  if (!emblemImg) {
    ctx.beginPath();
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.font = 'bold 25px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('NO', 660, 474, 150);
    ctx.fillText('EMBLEM', 660, 505, 150);
  } else {
    ctx.shadowBlur = 10;
    ctx.shadowOffsetX = 10;
    ctx.shadowOffsetY = 10;
    ctx.beginPath();
    ctx.drawImage(emblemImg, 580, 400, 160, 160);
  }

  ctx.beginPath();
  ctx.moveTo(800, 10);
  ctx.lineTo(575, 10);
  ctx.lineTo(600, 80);
  ctx.lineTo(800, 80);
  ctx.fillStyle = displayColor;
  ctx.shadowBlur = 30;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 30;
  ctx.fill();

  ctx.font = 'bold 30px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.textAlign = 'left';
  ctx.fillText('TIP', 610, 50, 50);

  ctx.textAlign = 'right';
  ctx.fillText('0', canvas.width - 30, 50, 150);

  ctx.shadowOffsetY = 0;

  ctx.fillStyle = 'rgba(255,255,255,1)';
  ctx.beginPath();
  ctx.moveTo(0, 65);
  ctx.lineTo(0, 535);
  ctx.arcTo(0, 585, 50, 585, 50);
  ctx.lineTo(250, 585);
  ctx.lineTo(300, 585);
  ctx.arcTo(300, 15, 250, 15, 50);
  ctx.lineTo(50, 15);
  ctx.arcTo(0, 15, 0, 65, 50);
  ctx.stroke();
  ctx.shadowBlur = 10;
  ctx.shadowOffsetX = 10;
  ctx.fill();
  ctx.save();
  ctx.clip();

  if (defPattern) {
    ctx.drawImage(defPattern, 0, 0, 300, 600);
  }

  ctx.restore();

  ctx.shadowOffsetX = 0;

  ctx.beginPath();
  ctx.moveTo(0, 255);
  ctx.bezierCurveTo(0, 265, 50, 265, 50, 255);
  ctx.bezierCurveTo(50, 245, 100, 245, 100, 255);
  ctx.bezierCurveTo(100, 265, 150, 265, 150, 255);
  ctx.bezierCurveTo(150, 245, 200, 245, 200, 255);
  ctx.bezierCurveTo(200, 265, 250, 265, 250, 255);
  ctx.bezierCurveTo(250, 245, 300, 245, 300, 255);
  ctx.lineTo(300, 585);
  ctx.lineTo(50, 585);
  ctx.arcTo(0, 585, 0, 535, 50);
  ctx.fillStyle = displayColor;
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.font = 'bold 30px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText(member.displayName, 150, 350, 280);
  ctx.font = '20px sans-serif';
  ctx.fillText(author.tag, 150, 375, 280);

  const percentDiff = curXPThisLevel / maxXPThisLevel;

  ctx.arc(60, 460, 35, 0, Math.PI * 2);
  ctx.lineWidth = 10;
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(60, 460, 35, Math.PI * 1.5, Math.PI * 1.5 + (Math.PI * 2 * percentDiff || 1));
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();

  ctx.beginPath();
  ctx.font = 'bold 25px sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText(String(level), 60, 465, 35);
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText('LEVEL', 60, 485, 35);

  ctx.beginPath();
  ctx.arc(150, 460, 40, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  ctx.beginPath();
  ctx.font = 'bold 30px sans-serif';
  ctx.fillStyle = displayColor;
  ctx.textAlign = 'center';
  const rankText = rank ? text.ordinalize(rank) : 'N/A';
  ctx.fillText(rankText, 150, 465, 50);
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText('SERVER', 150, 485, 50);

  ctx.beginPath();
  ctx.arc(240, 460, 40, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  ctx.beginPath();
  ctx.font = 'bold 30px sans-serif';
  ctx.fillStyle = displayColor;
  ctx.textAlign = 'center';
  ctx.fillText('N/A', 240, 465, 50);
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText('GLOBAL', 240, 485, 50);

  ctx.beginPath();
  ctx.arc(150, 225, 75, 0, Math.PI * 2);
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';
  ctx.stroke();
  ctx.closePath();
  ctx.save();
  ctx.clip();

  if (avatarImg) {
    ctx.drawImage(avatarImg, 75, 150, 150, 150);
  } else {
    ctx.fillStyle = '#7289DA';
    ctx.fillRect(75, 150, 150, 150);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 80px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(author.username[0].toUpperCase(), 150, 225);
  }

  ctx.restore();

  if (wreathImg) {
    ctx.beginPath();
    ctx.drawImage(wreathImg, 60, 145, 180, 180);
  }

  if (hatImg) {
    ctx.beginPath();
    ctx.drawImage(hatImg, 0, 0, 300, 300);
  }

  return new AttachmentBuilder(canvas.toBuffer(), { name: 'profile.png' });
};

module.exports = generateRankCard;
