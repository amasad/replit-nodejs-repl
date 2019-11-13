#!/usr/bin/nodejs

const repl = require('repl');
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const rl = require('readline-sync');
const tty = require('tty');
const Module = require('module');

let r;

// Red errors.
function logError(msg) {
  process.stdout.write('\u001b[90m' + msg + '\u001b[39m');
}

// The nodejs repl operates in raw mode and does some funky stuff to
// the terminal. This ns the repl and forces non-raw mode.
function pauseRepl() {
  if (!r) return;

  r.pause();
  process.stdin.setRawMode(false);
}

// Forces raw mode and resumes the repl.
function resumeRepl() {
  if (!r) return;

  process.stdin.setRawMode(true);
  r.resume();
}

// Clear the line if it has anything on it.
function clearLine() {
  if (r && r.line) r.clearLine();
}

// Adapted from the internal node repl code just a lot simpler and adds
// red errors (see https://bit.ly/2FRM86S)
function handleError(e) {
  if (r) {
    r.lastError = e;
  }

  if (e && typeof e === 'object' && e.stack && e.name) {
    if (e.name === 'SyntaxError') {
      e.stack = e.stack
        .replace(/^repl:\d+\r?\n/, '')
        .replace(/^\s+at\s.*\n?/gm, '');
    }

    logError(e.stack);
  } else {
    // For some reason needs a newline to flush.
    logError('Thrown: ' + r.writer(e) + '\n');
  }

  if (r) {
    r.clearBufferedCommand();
    r.lines.level = [];
    r.displayPrompt();
  }
}

function start(context) {
  r = repl.start({
    prompt: '\u001b[33m\uEEA7\u001b[00m ',
  });
  if (context) r.context = context;

  // remove the internal error and ours for red etc.
  r._domain.removeListener('error', r._domain.listeners('error')[0]);
  r._domain.on('error', handleError);
  process.on('uncaughtException', handleError);
}

global.alert = console.log;
global.prompt = p => {
  pauseRepl();
  clearLine();

  let ret = rl.question(`${p}> `, {
    hideEchoBack: false,
  });

  resumeRepl();

  // Display prompt on the next turn.
  if (r) setImmediate(() => r.displayPrompt());

  return ret;
};

global.confirm = q => {
  pauseRepl();
  clearLine();

  const ret = rl.keyInYNStrict(q);

  resumeRepl();

  // Display prompt on the next turn.
  if (r) setImmediate(() => r.displayPrompt());
  return ret;
};

if (process.argv[2]) {
  const mainPath = path.resolve(process.argv[2]);
  const main = fs.readFileSync(mainPath, 'utf-8');
  const module = new Module(mainPath, null);

  module.id = '.';
  process.mainModule = module;
  module.filename = mainPath;
  const sandbox = {
    module,
    require: module.require.bind(module),
    __dirname: path.dirname(mainPath),
    __filename: mainPath,

    // These are deprecated properties and accessing them will trigger a warning.
    // We add them manually for backward compat.
    GLOBAL: global,
    root: global,
  };


  // These properties will show a warning. We can avoid them.
  for (const prop of Object.getOwnPropertyNames(global)) {
    if (sandbox.hasOwnProperty(prop)) {
      continue;
    }

    sandbox[prop] = global[prop];
  }

  console.log('\u001b[90mHint: hit control+c anytime to enter REPL.\u001b[39m');
  const context = vm.createContext(sandbox);

  let script;
  try {
    script = vm.createScript(main, {
      filename: mainPath,
      displayErrors: false,
    });
  } catch (e) {
    handleError(e);
  }

  if (script) {
    let res;
    try {
      res = script.runInContext(context, {
        displayErrors: false,
      });
    } catch (e) {
      handleError(e);
    }

    if (typeof res !== 'undefined') {    
      console.log(res);
    }
  }


  process.chdir(path.dirname(mainPath))
  process.on('SIGINT', () => start(context));

  process.on('beforeExit', () => start(context));
} else {
  start();
}