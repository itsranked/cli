import fs from 'fs';

import defaultSettings from '../settings.json';

export default function getSettings() {
  if (!fs.existsSync('settings.json')) {
    fs.writeFileSync('settings.json', JSON.stringify(defaultSettings));
  }

  const settings = JSON.parse(fs.readFileSync('settings.json').toString());

  return settings;
}
