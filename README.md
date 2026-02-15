<!-- markdownlint-disable no-inline-html -->

# Node.js Tydom Client

<p align="center">
  <a href="https://www.npmjs.com/package/tydom-client">
    <img src="https://img.shields.io/npm/v/tydom-client.svg?style=for-the-badge" alt="npm version" />
  </a>
  <!-- <a href="https://www.npmjs.com/package/tydom-client">
    <img src="https://img.shields.io/npm/dt/tydom-client.svg?style=for-the-badge" alt="npm total downloads" />
  </a> -->
  <a href="https://www.npmjs.com/package/tydom-client">
    <img src="https://img.shields.io/npm/dm/tydom-client.svg?style=for-the-badge" alt="npm monthly downloads" />
  </a>
  <a href="https://www.npmjs.com/package/tydom-client">
    <img src="https://img.shields.io/npm/l/tydom-client.svg?style=for-the-badge" alt="npm license" />
  </a>
  <a href="https://github.com/mgcrea/node-tydom-client/actions/workflows/main.yml">
    <img src="https://img.shields.io/github/actions/workflow/status/mgcrea/node-tydom-client/main.yml?style=for-the-badge" alt="github main workflow" />
  </a>
</p>

Easily manage [Tydom hardware](https://www.deltadore.fr/domotique/pilotage-maison-connectee/box-domotique/tydom-2-0-ref-6414118) by [Delta Dore](https://www.deltadore.fr/) from [Node.js](https://nodejs.org/en/).

Originally built to enable bridging accessories to [Apple HomeKit](https://www.apple.com/ios/home/) via the related [homebridge-tydom](https://github.com/mgcrea/homebridge-tydom) plugin.

- Relies on [got](https://github.com/sindresorhus/got) for the initial HTTP handshake, [ws](https://github.com/websockets/ws) for the websocket connection and [http-parser-js](https://github.com/creationix/http-parser-js) to parse incoming messages.

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

### Command-line Usage

#### Request

Request (GET) a few known tydom endpoints and store the combined result into a JSON file

```bash
npx tydom-client request /configs/file /devices/data /devices/meta /devices/cmeta --file tydom_output.json --username 001A25XXXXXX --password XXXXXX
```

#### Listen

Connect to the Tydom socket and listen for external events

```bash
npx tydom-client listen --username 001A25XXXXXX --password XXXXXX
```

### Library Usage

#### Simple example

You can use the provided factory function to quickly get a working client

```js
// Required when testing against a local Tydom hardware
// to fix "self signed certificate" errors
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import {createClient} from 'tydom-client';

const username = '001A25123456';
const password = 'MyPassw0rd!';
const hostname = 'mediation.tydom.com'; // or '192.168.1.xxx'

const client = createClient({username, password, hostname});

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
client.on('message', (message) => {
  console.dir({message});
});
```

### Known Tydom interface (wip)

| **Method** | **Uri**                                                               | **Description**                  |
| ---------- | --------------------------------------------------------------------- | -------------------------------- |
| `GET`      | `/info`                                                               | get generic tydom information    |
| `GET`      | `/ping`                                                               | ping tydom                       |
| `GET`      | `/devices/data`                                                       | Get tydom devices data/state     |
| `GET`      | `/devices/meta`                                                       | Get tydom devices meta           |
| `GET`      | `/devices/cmeta`                                                      | Get tydom devices command meta   |
| `GET`      | `/configs/file`                                                       | Get tydom user config            |
| `GET`      | `/groups/file`                                                        | Get tydom groups config          |
| `GET`      | `/moments/file`                                                       | Get tydom moments config         |
| `GET`      | `/scenarios/file`                                                     | Get tydom scenarios config       |
| `GET`      | `/protocols`                                                          | List available protocols         |
| `POST`     | `/refresh/all`                                                        | Force refresh tydom devices data |
| `GET`      | `/devices/${DEVICE_ID}/endpoints/${DEVICE_ID}/data`                   | GET tydom device data/state      |
| `PUT`      | `/devices/${DEVICE_ID}/endpoints/${DEVICE_ID}/data`                   | Update tydom device data/state   |
| `PUT`      | `/devices/${DEVICE_ID}/endpoints/${DEVICE_ID}/cdata?name=${CMD_NAME}` | Run tydom device command         |

### Available scripts

| **Script**    | **Description**              |
| ------------- | ---------------------------- |
| start         | Run the CLI with tsx         |
| dev           | Run the CLI with debug/watch |
| test          | Run lint + unit tests        |
| spec          | Run unit tests               |
| spec:coverage | Run unit tests with coverage |
| spec:watch    | Watch unit tests             |
| lint          | Run eslint static tests      |
| format        | Run prettier formatting      |
| check         | Run TypeScript type checking |
| build         | Compile the library          |

## Authors

- [Olivier Louvignes](https://github.com/mgcrea) <<olivier@mgcrea.io>>

### Credits

- [depoon/iOSDylibInjectionDemo](https://github.com/depoon/iOSDylibInjectionDemo) for sideloading the iOS app
- [cth35/tydom_python](https://github.com/cth35/tydom_python) for API discovery

## License

```md
The MIT License

Copyright (c) 2020 Olivier Louvignes <olivier@mgcrea.io>

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit
persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the
Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```
