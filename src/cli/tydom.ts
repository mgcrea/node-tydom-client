#!/usr/bin/env node
process.env.DEBUG = `${process.env.DEBUG} tydom-client`.trim();

import chalk from 'chalk';
import {promises as fs} from 'fs';
import {resolve} from 'path';
import yargs from 'yargs';
import {createClient} from '../client';
import {chalkJson, chalkKeyword, chalkString} from '../utils/chalk';
import {dir} from '../utils/debug';
import {asyncWait} from '../utils/async';

type TydomResult = Record<string, unknown>;

const {TYDOM_USERNAME, TYDOM_PASSWORD} = process.env;

const log = console.log.bind(console);

type TydomAuthOptions = {
  username: string;
  password: string;
  hostname: string;
};

type TydomGlobalOptions = TydomAuthOptions & {
  _: string[];
  verbose: boolean;
};

type TydomRequestCommandOptions = TydomGlobalOptions & {
  uri: string;
  method: 'GET' | 'PUT' | 'POST';
  file?: string;
};

const setupClient = async ({username, password, hostname}: TydomAuthOptions) => {
  log(`Creating tydom client ...`);
  const client = createClient({username, password, hostname});
  await asyncWait(500);
  log(`Connecting to hostname=${chalkString(hostname)} with username=${chalkString(username)} ...`);
  await client.connect();
  log(`Successfully connected to Tydom hostname=${chalkString(hostname)} with username=${chalkString(username)}`);
  return client;
};

const requestCommand = async (argv: TydomRequestCommandOptions): Promise<void> => {
  const {_: args, uri, file, verbose, username, password, hostname, method} = argv;
  const client = await setupClient({username, password, hostname});
  // Perform requests
  const [, ...extraUris] = args;
  const uris = [uri, ...extraUris];
  log(`Performing ${uris.length} request(s) to "${hostname}"...`);
  const results = await uris.reduce<Promise<TydomResult>>(async (promiseSoFar, uri) => {
    const soFar = await promiseSoFar;
    log(`Performing ${method} request to "${uri}"...`);
    if (method === 'GET') {
      soFar[uri] = await client.get(uri);
    } else if (method === 'POST') {
      soFar[uri] = await client.post(uri);
    }
    log(`Performed ${method} request to "${uri}".`);
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

type TydomListenCommandOptions = TydomGlobalOptions;

const listenCommand = async (argv: TydomListenCommandOptions): Promise<void> => {
  const {verbose, username, password, hostname} = argv;
  const client = await setupClient({username, password, hostname});
  log(`Now listening to new messages from hostname=${chalkString(hostname)} (Ctrl-C to exit) ...`);
  client.on('message', (message) => {
    const {type, uri, method, status, body, date} = message;
    log(
      `[${chalk.yellow(date.toISOString())}] Received new ${chalkKeyword(type)} message on Tydom socket, ${chalkKeyword(
        method,
      )} on uri=${chalkString(uri)}" with status=${status}, body:\n${chalkJson(body)}`,
    );
    if (verbose) {
      dir({message});
    }
  });
};

yargs
  .usage('Usage: $0 <command> [options]')
  .option('username', {
    type: 'string',
    describe: 'tydom username',
    default: TYDOM_USERNAME,
  })
  .option('password', {
    type: 'string',
    describe: 'tydom password',
    default: TYDOM_PASSWORD,
  })
  .option('hostname', {
    type: 'string',
    describe: 'request hostname',
    default: 'mediation.tydom.com',
  })
  .option('method', {
    type: 'string',
    describe: 'request method',
    default: 'GET',
  })
  .demandOption(['username', 'password', 'hostname'])
  .command<TydomRequestCommandOptions>(
    'request [uri]',
    'request tydom',
    (yargs) => {
      yargs
        .example('$0 request /info --file info.json', '')
        .positional('uri', {
          type: 'string',
          describe: 'request uri',
        })
        // .option('method', {
        //   type: 'string',
        //   describe: 'request method',
        //   default: 'GET',
        //   choices: ['GET', 'PUT', 'POST']
        // })
        .option('file', {
          type: 'string',
          describe: 'save to file',
        })
        .demandOption(['uri']);
    },
    requestCommand,
  )
  .command<TydomListenCommandOptions>(
    'listen',
    'listen tydom',
    (yargs) => {
      yargs.example('$0 listen', '');
    },
    listenCommand,
  )
  .option('verbose', {
    alias: 'v',
    type: 'boolean',
    description: 'Run with verbose logging',
  })
  .demandCommand()
  .help().argv;
