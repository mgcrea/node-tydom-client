# Node.js Tydom Client

[![npm version](https://img.shields.io/npm/v/tydom-client.svg)](https://github.com/mgcrea/node-tydom-client/releases)
[![license](https://img.shields.io/github/license/mgcrea/node-tydom-client.svg?style=flat)](https://tldrlegal.com/license/mit-license)
[![build status](https://travis-ci.com/mgcrea/node-tydom-client.svg?branch=master)](https://travis-ci.com/mgcrea/node-tydom-client)
[![dependencies status](https://david-dm.org/mgcrea/node-tydom-client/status.svg)](https://david-dm.org/mgcrea/node-tydom-client)
[![devDependencies status](https://david-dm.org/mgcrea/node-tydom-client/dev-status.svg)](https://david-dm.org/mgcrea/node-tydom-client?type=dev)
[![coverage](https://codecov.io/gh/mgcrea/node-tydom-client/branch/master/graph/badge.svg)](https://codecov.io/gh/mgcrea/node-tydom-client)

Easily manage [Tydom hardware](https://www.deltadore.fr/domotique/pilotage-maison-connectee/box-domotique/tydom-2-0-ref-6414118) by [Delta Dore](https://www.deltadore.fr/) from [Node.js](https://nodejs.org/en/).

Originally built to enable bridging accessories to [Apple HomeKit](https://www.apple.com/ios/home/).

- Rely on [node-fetch](https://github.com/bitinn/node-fetch) for the initial HTTP handshake, [ws](https://github.com/websockets/ws) for the websocket connection and [http-parser-js](https://github.com/creationix/http-parser-js) to parse incoming messages.

- Built with [TypeScript](https://www.typescriptlang.org/) for static type checking with exported types along the library.

## Documentation

### Installation

```bash
yarn add tydom-client
# or
npm install tydom-client
```

### Debug

This library uses [debug](https://www.npmjs.com/package/debug) to provide high verbosity logs, just pass the following environment:

```bash
DEBUG=tydom-client
```

### Examples

#### Simple example

You can use the provided factory function to quickly get a working client

```js
// Required when testing against a local Tydom hardware
// to fix "self signed certificate" errors
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const {createClient} = require('tydom-client');
// -or- use named exports (requires babel)
// import {createClient} from 'tydom-client';
// -or- destructure first when using Node.js native modules (eg. `--experimental-modules`)
// import tydomClient from 'tydom-client';
// const {createClient} = tydomClient;

const username = '001A25123456';
const password = 'MyPassw0rd!';
const hostname = 'mediation.tydom.com'; // or '192.168.1.xxx'

const client = createClient({username, password, hostname});

(async () => {
  console.log(`Connecting to "${hostname}"...`);
  const socket = await client.connect();
  // Get Tydom info
  const info = await client.get('/info');
  console.dir({info});
  // Turn a light on
  await client.put(`/devices/${MY_DEVICE_ID}/endpoints/${MY_DEVICE_ID}/data`, [
    {
      name: 'level',
      value: 100
    }
  ]);
  // Listen for external messages
  client.on('message', message => {
    console.dir({message});
  });
})();
```

### Known Tydom interface (wip)

| **Method** | **Uri**                                             | **Description**                  |
| ---------- | --------------------------------------------------- | -------------------------------- |
| `GET`      | `/info`                                             | get generic tydom information    |
| `GET`      | `/ping`                                             | ping tydom                       |
| `GET`      | `/devices/data`                                     | Get tydom devices data/state     |
| `GET`      | `/devices/meta`                                     | Get tydom devices meta           |
| `GET`      | `/devices/cmeta`                                    | Get tydom devices command meta   |
| `GET`      | `/configs/file`                                     | Get tydom user config            |
| `GET`      | `/groups/file`                                      | Get tydom groups config          |
| `GET`      | `/moments/file`                                     | Get tydom moments config         |
| `GET`      | `/scenarios/file`                                   | Get tydom scenarios config       |
| `GET`      | `/protocols`                                        | List available protocols         |
| `POST`     | `/refresh/all`                                      | Force refresh tydom devices data |
| `GET`      | `/devices/${DEVICE_ID}/endpoints/${DEVICE_ID}/data` | GET tydom device data/state      |
| `PUT`      | `/devices/${DEVICE_ID}/endpoints/${DEVICE_ID}/data` | Update tydom device data/state   |

### Available scripts

| **Script**    | **Description**              |
| ------------- | ---------------------------- |
| start         | alias to `spec:watch`        |
| test          | Run all tests                |
| spec          | Run unit tests               |
| spec:coverage | Run unit tests with coverage |
| spec:watch    | Watch unit tests             |
| lint          | Run eslint static tests      |
| pretty        | Run prettier static tests    |
| build         | Compile the library          |
| build:watch   | Watch compilation            |

## Authors

**Olivier Louvignes**

- http://olouv.com
- http://github.com/mgcrea

### Credits

- [depoon/iOSDylibInjectionDemo](https://github.com/depoon/iOSDylibInjectionDemo) for sideloading the iOS app
- [cth35/tydom_python](https://github.com/cth35/tydom_python) for API discovery

## License

```
The MIT License

Copyright (c) 2019 Olivier Louvignes <olivier@mgcrea.io>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```
