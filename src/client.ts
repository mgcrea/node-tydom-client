import createDebug from 'debug';
import {assert} from './utils/assert';
import {EventEmitter} from 'events';
import WebSocket from 'ws';
import {USER_AGENT} from './config/env';
import {
  buildRawHttpRequest,
  parseIncomingMessage,
  BuildRawHttpRequestOptions,
  computeDigestAccessAuthenticationHeader
} from './utils/http';
import {getTydomDigestAccessAuthenticationFields, TydomResponse, TydomHttpMessage} from './utils/tydom';

const debug = createDebug('tydom-client');

export interface TydomClientConnectOptions {
  keepAlive?: boolean;
  closeOnExit?: boolean;
}

export interface TydomClientOptions extends TydomClientConnectOptions {
  username: string;
  password: string;
  hostname?: string;
  userAgent?: string;
  requestTimeout?: number;
  reconnectInterval?: number;
}

export const defaultOptions: Required<Pick<
  TydomClientOptions,
  'userAgent' | 'hostname' | 'keepAlive' | 'closeOnExit' | 'reconnectInterval' | 'requestTimeout'
>> = {
  hostname: 'mediation.tydom.com',
  userAgent: USER_AGENT,
  keepAlive: true,
  closeOnExit: true,
  requestTimeout: 5 * 1000,
  reconnectInterval: 10 * 1000
};

export const createClient = (options: TydomClientOptions) => new TydomClient(options);

type ResponseHandler = {resolve: (value?: any) => void; reject: (reason?: any) => void; timeout: NodeJS.Timeout | null};

export default class TydomClient extends EventEmitter {
  private config: Required<TydomClientOptions>;
  private socket?: WebSocket;
  private nonce: number;
  private pool: Map<string, ResponseHandler>;
  private keepAliveInterval?: NodeJS.Timeout;
  private reconnectInterval?: NodeJS.Timeout;
  constructor(options: TydomClientOptions) {
    super();
    this.config = {...defaultOptions, ...options};
    this.nonce = 0;
    this.pool = new Map();
  }
  private uniqueId(prefix = '') {
    this.nonce++;
    return `${prefix}${this.nonce}`;
  }
  public async connect() {
    const {username, password, hostname, userAgent, keepAlive, closeOnExit, reconnectInterval} = this.config;
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
      debug(`Attempting to open new socket for hostname="${hostname}"`);
      const socket = new WebSocket(`https://${hostname}${uri}`, websocketOptions);
      socket.on('open', () => {
        debug(`Tydom socket opened for hostname="${hostname}"`);
        this.socket = socket;
        if (this.reconnectInterval) {
          clearInterval(this.reconnectInterval);
          delete this.reconnectInterval;
        }
        if (keepAlive) {
          this.keepAliveInterval = setInterval(() => {
            this.get('/ping');
          }, 30e3);
        }
        if (closeOnExit) {
          this.attachExitListeners();
        }
        resolve(socket);
        this.emit('connect');
      });
      socket.on('message', async (data: Buffer) => {
        debug(
          `Tydom socket ${data.length}-sized message received for hostname="${hostname}":\n${data
            .toString('utf8')
            .replace(/(.+)\r\n/g, '  $1\r\n')}`
        );
        const parsedMessage = await parseIncomingMessage(isRemote ? data.slice('\x02'.length) : data);
        const requestId = parsedMessage.headers.get('transac-id');
        if (requestId && this.pool.has(requestId)) {
          const responseHandler = this.pool.get(requestId) as ResponseHandler;
          // Clear timeout watchdog
          if (responseHandler.timeout) {
            clearTimeout(responseHandler.timeout);
          }
          try {
            responseHandler.resolve(parsedMessage);
          } catch (err) {
            responseHandler.reject(err);
          } finally {
            this.pool.delete(requestId);
          }
        } else {
          // Relay message on client
          this.emit('message', parsedMessage);
        }
      });
      socket.on('close', () => {
        debug(`Tydom socket closed for hostname="${hostname}"`);
        this.emit('disconnect');
        if (reconnectInterval > 0 && !this.reconnectInterval) {
          this.reconnectInterval = setInterval(() => {
            debug(`About to attempt reconnect for hostname="${hostname}"`);
            this.connect();
          }, reconnectInterval);
        }
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
    if ([WebSocket.CLOSING, WebSocket.CLOSED].includes(this.socket.readyState)) {
      throw new Error('Socket instance is closing/closed, please reconnect with connect() first');
    }
    const {hostname} = this.config;
    const isRemote = hostname === 'mediation.tydom.com';
    this.socket.send(Buffer.from(isRemote ? `\x02${rawHttpRequest}` : rawHttpRequest, 'ascii'));
  }
  private async request({
    url,
    method,
    headers: extraHeaders = {},
    body
  }: BuildRawHttpRequestOptions): Promise<TydomResponse> {
    const {requestTimeout} = this.config;
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
        const resolveBody = (res: TydomHttpMessage) => resolve(res.body);
        const timeout =
          requestTimeout > 0
            ? setTimeout(() => {
                debug(`Timeout for request "${rawHttpRequest.replace(/\r\n/g, '\\r\\n')}"`);
                this.close();
              }, requestTimeout)
            : null;
        this.pool.set(requestId, {resolve: resolveBody, reject, timeout});
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
  private attachExitListeners() {
    const gracefullyClose = async () => {
      const {socket} = this;
      if (!socket) {
        process.exit(0);
      }
      socket.once('close', () => {
        process.nextTick(() => process.exit(0));
      });
      switch (socket.readyState) {
        case socket.CONNECTING:
        case socket.OPEN:
          this.close();
        case socket.CLOSING:
        case socket.CLOSED:
        default:
          return;
      }
    };
    process.on('SIGTERM', gracefullyClose);
    // Handle Ctrl+C
    process.on('SIGINT', gracefullyClose);
    // Handle nodemon restarts
    process.on('SIGUSR2', gracefullyClose);
  }
}
