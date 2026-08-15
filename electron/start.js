const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const electronFolder = path.join(__dirname, '../node_modules/electron');
const executableName = fs.readFileSync(path.join(electronFolder, 'path.txt'), 'utf8').trim();
const executable = path.join(electronFolder, 'dist', executableName);
const child = spawn(executable, ['.'], {
  cwd: path.join(__dirname, '..'),
  detached: true,
  stdio: 'ignore',
});

child.unref();
