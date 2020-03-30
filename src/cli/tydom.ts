#!/usr/bin/env node

import yargs from 'yargs';
import {dir} from 'src/utils/debug';
import {createClient} from 'src/client';
import {promises as fs} from 'fs';
import {resolve} from 'path';

type TydomCommandRequestOptions = {
  _: string[];
  uri: string;
  method: 'GET' | 'PUT' | 'POST';
  file?: string;
  username: string;
  password: string;
  hostname: string;
  verbose: boolean;
};

type TydomResult = Record<string, unknown>;

const {TYDOM_USERNAME, TYDOM_PASSWORD} = process.env;

const log = console.log.bind(console);

const requestCommand = async (argv: TydomCommandRequestOptions): Promise<void> => {
  const {_: args, uri, file, verbose, username, password, hostname} = argv;
  // Setup client
  const client = createClient({username, password, hostname});
  await new Promise((resolve) => {
    setTimeout(resolve, 1000);
  });
  log(`Connecting to "${hostname}"...`);
  await client.connect();
  log(`Connected to "${hostname}".`);
  // Perform requests
  const [, ...extraUris] = args;
  const uris = [uri, ...extraUris];
  log(`Performing ${uris.length} request(s) to "${hostname}"...`);
  const results = await uris.reduce<Promise<TydomResult>>(async (promiseSoFar, uri) => {
    const soFar = await promiseSoFar;
    log(`Performing GET request to "${uri}"...`);
    soFar[uri] = await client.get(uri);
    log(`Performed GET request to "${uri}".`);
    return soFar;
  }, Promise.resolve({}));
  log(`Performed ${uris.length} request(s) to "${hostname}".`);

  if (verbose) {
    dir({results});
  }
  if (file) {
    const dest = resolve(`${process.cwd()}/${file}`);
    log(`Writing to file="${dest}"...`);
    await fs.writeFile(dest, JSON.stringify(results, null, 2));
    log(`Wrote to file="${dest}".`);
  }
  await client.close();
  setTimeout(() => {
    process.exit(0);
  }, 100);
};

yargs
  .usage('Usage: $0 <command> [options]')
  .command<TydomCommandRequestOptions>(
    'request [uri]',
    'request tydom',
    (yargs) => {
      yargs
        .example('$0 request /info --file info.json', '')
        .positional('uri', {
          type: 'string',
          describe: 'request uri'
        })
        .option('username', {
          type: 'string',
          describe: 'tydom username',
          default: TYDOM_USERNAME
        })
        .option('password', {
          type: 'string',
          describe: 'tydom password',
          default: TYDOM_PASSWORD
        })
        .option('hostname', {
          type: 'string',
          describe: 'request hostname',
          default: 'mediation.tydom.com'
        })
        // .option('method', {
        //   type: 'string',
        //   describe: 'request method',
        //   default: 'GET',
        //   choices: ['GET', 'PUT', 'POST']
        // })
        .option('file', {
          type: 'string',
          describe: 'save to file'
        })
        .demandOption(['username', 'password', 'hostname', 'uri']);
    },
    requestCommand
  )
  .option('verbose', {
    alias: 'v',
    type: 'boolean',
    description: 'Run with verbose logging'
  })
  .demandCommand()
  .help().argv;

/*
// @cli DEBUG=tydom-client nodemon --watch .idea/index.ts --watch src/ --ext "ts,tsx" --exec "yarn babel-node --extensions ".ts,.tsx" .idea/index.ts"

import {createClient as createTydomClient} from 'tydom-client';

import debug, {dir} from 'src/utils/debug';
// import {promises as fs} from 'fs';
import assert from 'src/utils/assert';

const DEFAULT_REQUESTS = '/devices/data,/devices/meta,/devices/cmeta';

const {
  TYDOM_USERNAME: username,
  TYDOM_PASSWORD: password,
  TYDOM_HOSTNAME: hostname = 'mediation.tydom.com',
  TYDOM_REQUESTS: requests = DEFAULT_REQUESTS
} = process.env;
assert(username, 'Required "TYDOM_USERNAME" environment variable');
assert(password, 'Required "TYDOM_PASSWORD" environment variable');
assert(hostname, 'Required non empty "TYDOM_HOSTNAME" environment variable when defined');
const parsedRequests: string[] = requests.split(',');
assert(parsedRequests.length, 'Required non empty "TYDOM_REQUESTS" environment variable when defined');

const fileOutput = `${__dirname}/tydom_output.json`;
const client = createTydomClient({username, password, hostname});

const getTydom = async (url: string) => {
  const result = await client.get('/info');
  // await fs.writeFile(`${__dirname}/out.json`, JSON.stringify(data, null, 2));
  dir({url, result});
};

(async () => {
  debug(`Connecting to "${hostname}"...`);
  await client.connect();
  debug(`Connected to "${hostname}"...`);

  const resuls = await parsedRequests.reduce<Promise<Record<string, unknown>>>(async (promiseSoFar, value) => {
    const soFar = await promiseSoFar;
    debug(`Performing GET request to "${value}"...`);
    soFar[value] = await client.get(value);
    debug(`Performed GET request to "${value}"...`);
    return soFar;
  }, Promise.resolve({}));

  // Save file
    debug(`Writing output to "${value}"...`);
    // await fs.writeFile(`${__dirname}/out.json`, JSON.stringify(data, null, 2));

  dir({resuls});

  // await getTydom('/info');
  // await getTydom('/devices/data');
  // await getTydom('/devices/meta');
  // await getTydom('/devices/cmeta');
})();

*/
