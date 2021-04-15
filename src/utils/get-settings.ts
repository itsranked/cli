import fs from 'fs';
import defaultSettings from '../settings.json';


const isProduction = fs.existsSync('/home/ubuntu');

export default function getSettings() {
  if (!fs.existsSync('settings.json')) {
    fs.writeFileSync('settings.json', JSON.stringify(defaultSettings));
  }

  const settings = JSON.parse(fs.readFileSync('settings.json').toString()) as typeof defaultSettings;

  settings.outputDir = isProduction ? settings.production.jsonDir : settings.dev.jsonDir;

  return settings;
}
