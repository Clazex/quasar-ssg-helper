'use strict';
/* eslint-env node */

/**
 * A simple SSG module for Quasar Framework
 * @module quasar-ssg-helper
 * This module assumes that:
 *   - your SSR server take a port specified in environment variable `PORT`
 */

const { spawn } = require('child_process');
const { assert } = require('console');

const dedent = require('dedent');
const { copy, emptyDir, ensureDir, outputFile, pathExists } = require('fs-extra');
const { getPortPromise: getPort } = require('portfinder');
const { get } = require('axios').default;

const envPort = Number(process.env.PORT);

/**
 * Default parameters
 * @property {string} cwd CWD for server child process
 * @property {number|array|undefined} port Port to use, can be either a number or an array containing the start and end port range. If not provided, try `process.env.PORT`, then try to find an available one
 * @property {string|number} wait Wait strategy, see below
 * @property {string} dir.ssr The location of SSR server, server must be able to start when running `node ${dir.ssr}`
 * @property {string} dir.static The location of static files, which are directly copied
 * @property {string} dir.ssg Output path
 *
 * Wait strategy:
 *   - if is String:
 *     - if is 'stdout': wait until any data comes from stdout
 *     - if is 'ipc': wait until any message comes from ipc
 *   - if is Number and is greater than zero: wait this long (in millis)
 */
const defaultParam = {
  cwd: process.cwd(),
  port: undefined,
  wait: 'stdout',
  dir: {
    ssr: 'dist/ssr',
    static: 'dist/ssr/www',
    ssg: 'dist/ssg'
  }
};

/**
 * @see _generateSsg
 */
module.exports = async function generateSsg (parObj) {
  return _generateSsg({
    ...defaultParam,
    ...parObj
  });
};

/**
 * Perform SSG on the existing SSR dist
 * @async
 * @param {object} parObj
 * @returns {Promise<void>} Promise
 */
async function _generateSsg ({ cwd, port, wait, dir } = defaultParam) {
  assert(await pathExists(dir.ssr), dedent`
    SSR dist path does not exist, please build SSR first.
  `);

  await ensureDir(dir.ssg)
    .then(emptyDir(dir.ssg))
    .then(copy(dir.static, dir.ssg));

  if (!Number(port)) {
    if (envPort) {
      port = envPort;
    } else if (typeof port === typeof []) {
      port = await getPort({ startPort: port[0], stopPort: port[1] });
    } else {
      port = await getPort();
    }
  }

  assert(port > 0 && port <= 65535, dedent`
        No available ports
    `);

  if (typeof wait === 'string') {
    assert(['stdout', 'ipc'].includes(wait), dedent`
            Invalid String parameter.
            Allowed String parameters:
              - stdout
        `);

    const srvProc = spawnSrv(cwd, dir.ssr, port, { stdout: 'pipe', ipc: 'ipc' }[wait]);

    srvProc.stdout.on({ stdout: 'data', ipc: 'message' }[wait], async () => {
      await captureIndex(port);
      srvProc.kill();
    });
  } else if (typeof wait === 'number') {
    assert(wait > 0, dedent`
            Invalid Number parameter.
            Number parameters must be greater than zero
        `);

    const srvProc = spawnSrv(cwd, dir.ssr, port, 'ignore');

    setTimeout(async () => {
      await captureIndex(port);
      srvProc.kill();
    }, wait);
  } else {
    throw new Error('Invalid parameters');
  }
}

/**
 * Spawn a SSR server child process
 * @param {string} cwd
 * @param {string} ssrDir SSR server dir
 * @param {number} port Port to use (inject into env var `PORT`)
 * @param {string} stdout option for `stdout`, see {@link https://nodejs.org/dist/latest-v14.x/docs/api/child_process.html#child_process_options_stdio| Node.js Doc}
 * @returns {ChildProcess} the server process
 */
function spawnSrv (cwd, ssrDir, port, stdout) {
  return spawn('node', [ssrDir], {
    cwd,
    stdio: ['ignore', stdout, 'ignore'],
    env: {
      ...process.env,
      PORT: port
    }
  });
}

/**
 * Capture index.html of a local server on the specified port
 * @async
 * @param {number} port
 * @returns {Promise<void>} Promise
 */
async function captureIndex (port) {
  return get(`http://127.0.0.1:${port}/`).then(({ data }) => { outputFile('dist/ssg/index.html', data); });
}
