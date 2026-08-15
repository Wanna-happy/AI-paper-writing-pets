const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const petIds = ['ember-pup', 'shadow-kit', 'nori'];

async function cleanSprite(petId) {
  const input = path.join(__dirname, '../assets/openpets', petId, 'spritesheet.webp');
  const output = path.join(__dirname, '../assets/openpets', petId, 'spritesheet-clean.png');
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  for (let index = 0; index < data.length; index += 4) {
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    const isTealArtifact = red < 52 && green > 72 && blue > 72 && Math.abs(green - blue) < 150;
    if (isTealArtifact) data[index + 3] = 0;
  }

  await sharp(data, { raw: info }).png().toFile(output);
  console.log(`Cleaned ${petId}: ${fs.statSync(output).size} bytes`);
}

Promise.all(petIds.map(cleanSprite)).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
