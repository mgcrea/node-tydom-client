import {assert} from 'console';
import {EventEmitter} from 'events';
import WebSocket from 'ws';
import {USER_AGENT} from './config/env';
import {buildRawHttpRequest, parseIncomingMessage} from './utils/http';
import {
  computeDigestAccessAuthenticationHeader,
  getTydomDigestAccessAuthenticationFields,
  TydomResponse
} from './utils/tydom';

export interface TydomClientOptions {
  username: string;
  password: string;
  hostname?: string;
  userAgent?: string;
}

export const defaultOptions: Required<Pick<TydomClientOptions, 'userAgent' | 'hostname'>> = {
  hostname: 'mediation.tydom.com',
  userAgent: USER_AGENT
};

export const createClient = (options: TydomClientOptions) => new TydomClient(options);

type PromiseExecutor = {resolve: (value?: any) => void; reject: (reason?: any) => void};

export default class TydomClient extends EventEmitter {
  private config: Required<TydomClientOptions>;
  private socket?: WebSocket;
  private nonce: number;
  private pool: {[s: string]: PromiseExecutor};
  constructor(options: TydomClientOptions) {
    super();
    this.config = {...defaultOptions, ...options};
    this.nonce = 0;
    this.pool = {};
  }
  private uniqueId(prefix: string = '') {
    this.nonce++;
    return `${prefix}${this.nonce}`;
  }
  public async connect() {
    const {username, password, hostname, userAgent} = this.config;
    const isRemote = hostname === 'mediation.tydom.com';
    const uri = `/mediation/client?mac=${username}&appli=1`;
    const headers = {'User-Agent': userAgent};
    const {realm, nonce, qop} = await getTydomDigestAccessAuthenticationFields({username, hostname, headers});
    const {header: authHeader} = await computeDigestAccessAuthenticationHeader(
      {uri, username, password},
      {realm, nonce, qop}
    );
    const websocketOptions: WebSocket.ClientOptions = {
      headers: {...headers, Authorization: authHeader}
    };
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(`https://${hostname}${uri}`, websocketOptions);
      socket.on('open', () => {
        console.warn(`Tydom socket opened for hostname="${hostname}"`);
        this.socket = socket;
        resolve(socket);
      });
      socket.on('message', async (data: Buffer) => {
        // d('message', data.toString('utf8'));
        const response = await parseIncomingMessage(isRemote ? data.slice('\x02'.length) : data);
        const requestId = response.headers.get('transac-id');
        if (this.pool[requestId]) {
          this.pool[requestId].resolve(response);
        }
      });
      socket.on('close', () => {
        console.warn(`Tydom socket closed for hostname="${hostname}"`);
      });
      socket.on('error', err => {
        reject(err);
      });
    });
  }
  public async close() {
    if (this.socket instanceof WebSocket) {
      this.socket.close();
    }
  }
  private send(rawHttpRequest: string) {
    assert(this.socket instanceof WebSocket, 'Required socket instance, please use connect() first');
    const {hostname} = this.config;
    const isRemote = hostname === 'mediation.tydom.com';
    this.socket!.send(Buffer.from(isRemote ? `\x02${rawHttpRequest}` : rawHttpRequest, 'ascii'));
  }
  public async get(url: string) {
    const requestId = this.uniqueId('request_');
    const headers = {
      'content-length': '0',
      'content-type': 'application/json; charset=utf-8',
      'transac-id': requestId
    };
    const rawHttpRequest = buildRawHttpRequest({url, method: 'GET', headers});
    console.warn(`Sending request "${rawHttpRequest}"`);
    return new Promise((resolve, reject) => {
      try {
        const resolveJson = async (res: TydomResponse) => resolve(await res.json());
        this.pool[requestId] = {resolve: resolveJson, reject};
        this.send(rawHttpRequest);
      } catch (err) {
        reject(err);
      }
    });
  }
  public async put(url: string, body: {[s: string]: any}) {
    const requestId = this.uniqueId('request_');
    const stringifiedBody = JSON.stringify(body);
    const headers = {
      'content-length': `${stringifiedBody.length}`,
      'content-type': 'application/json; charset=utf-8',
      'transac-id': requestId
    };
    const rawHttpRequest = buildRawHttpRequest({url, method: 'PUT', headers, body: stringifiedBody});
    console.warn(`Sending request "${rawHttpRequest}"`);
    return new Promise((resolve, reject) => {
      try {
        const resolveJson = async (res: TydomResponse) => resolve(await res.json());
        this.pool[requestId] = {resolve: resolveJson, reject};
        this.send(rawHttpRequest);
      } catch (err) {
        reject(err);
      }
    });
  }
}
