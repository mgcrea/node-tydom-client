import createDebug from 'debug';
import assert from 'assert';
import {EventEmitter} from 'events';
import WebSocket from 'ws';
import {USER_AGENT} from './config/env';
import {
  buildRawHttpRequest,
  parseIncomingMessage,
  BuildRawHttpRequestOptions,
  computeDigestAccessAuthenticationHeader
} from './utils/http';
import {getTydomDigestAccessAuthenticationFields, TydomResponse} from './utils/tydom';

const debug = createDebug('tydom-client');

export interface TydomClientConnectOptions {
  keepAlive?: boolean;
}

export interface TydomClientOptions extends TydomClientConnectOptions {
  username: string;
  password: string;
  hostname?: string;
  userAgent?: string;
}

export const defaultOptions: Required<Pick<TydomClientOptions, 'userAgent' | 'hostname' | 'keepAlive'>> = {
  hostname: 'mediation.tydom.com',
  userAgent: USER_AGENT,
  keepAlive: true
};

export const createClient = (options: TydomClientOptions) => new TydomClient(options);

type PromiseExecutor = {resolve: (value?: any) => void; reject: (reason?: any) => void};

export default class TydomClient extends EventEmitter {
  private config: Required<TydomClientOptions>;
  private socket?: WebSocket;
  private nonce: number;
  private pool: Map<string, PromiseExecutor>;
  private keepAliveInterval?: NodeJS.Timeout;
  constructor(options: TydomClientOptions) {
    super();
    this.config = {...defaultOptions, ...options};
    this.nonce = 0;
    this.pool = new Map();
  }
  private uniqueId(prefix: string = '') {
    this.nonce++;
    return `${prefix}${this.nonce}`;
  }
  public async connect() {
    const {username, password, hostname, userAgent, keepAlive} = this.config;
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
        debug(`Tydom socket opened for hostname="${hostname}"`);
        this.socket = socket;
        if (keepAlive) {
          this.keepAliveInterval = setInterval(() => {
            this.get('/ping');
          }, 30e3);
        }
        resolve(socket);
      });
      socket.on('message', async (data: Buffer) => {
        debug(
          `Tydom socket ${data.length}-sized message received for hostname="${hostname}":\n${data
            .toString('utf8')
            .replace(/(.+)\r\n/g, '  $1\r\n')}`
        );
        const response = await parseIncomingMessage(isRemote ? data.slice('\x02'.length) : data);
        const requestId = response.headers.get('transac-id');
        if (this.pool.has(requestId)) {
          try {
            this.pool.get(requestId)!.resolve(response);
          } catch (err) {
            this.pool.get(requestId)!.reject(err);
          } finally {
            this.pool.delete(requestId);
          }
        }
      });
      socket.on('close', () => {
        debug(`Tydom socket closed for hostname="${hostname}"`);
      });
      socket.on('error', err => {
        debug(`Tydom socket error for hostname="${hostname}"`);
        reject(err);
      });
    });
  }
  public async close() {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
    }
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
  private async request({url, method, headers: extraHeaders = {}, body}: BuildRawHttpRequestOptions) {
    const requestId = this.uniqueId('request_');
    const headers = {
      ...extraHeaders,
      'content-length': `${body ? body.length : 0}`,
      'content-type': 'application/json; charset=utf-8',
      'transac-id': requestId
    };
    const rawHttpRequest = buildRawHttpRequest({url, method, headers, body});
    debug(`Sending request "${rawHttpRequest.replace(/\r\n/g, '\\r\\n')}"`);
    return new Promise((resolve, reject) => {
      try {
        const resolveJson = async (res: TydomResponse) => {
          resolve(await res.json());
        };
        this.pool.set(requestId, {resolve: resolveJson, reject});
        this.send(rawHttpRequest);
      } catch (err) {
        reject(err);
      }
    });
  }
  public async get(url: string) {
    return await this.request({url, method: 'GET'});
  }
  public async delete(url: string) {
    return await this.request({url, method: 'DELETE'});
  }
  public async put(url: string, body: {[s: string]: any} = {}) {
    return await this.request({url, method: 'PUT', body: JSON.stringify(body)});
  }
  public async post(url: string, body: {[s: string]: any} = {}) {
    return await this.request({url, method: 'POST', body: JSON.stringify(body)});
  }
}
