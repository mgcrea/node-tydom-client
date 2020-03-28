import {EventEmitter} from 'events';
import {debounce, get} from 'lodash';
import debug from 'src/utils/debug';
import WebSocket from 'ws';
import {USER_AGENT} from './config/env';
import {assert} from './utils/assert';
import {
  buildRawHttpRequest,
  BuildRawHttpRequestOptions,
  computeDigestAccessAuthenticationHeader,
  parseIncomingMessage
} from './utils/http';
import {getTydomDigestAccessAuthenticationFields, TydomHttpMessage, TydomResponse} from './utils/tydom';

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
  followUpDebounce?: number;
}

export const defaultOptions: Required<Pick<
  TydomClientOptions,
  'userAgent' | 'hostname' | 'keepAlive' | 'closeOnExit' | 'reconnectInterval' | 'requestTimeout' | 'followUpDebounce'
>> = {
  hostname: 'mediation.tydom.com',
  userAgent: USER_AGENT,
  keepAlive: true,
  closeOnExit: true,
  requestTimeout: 5 * 1000,
  reconnectInterval: 10 * 1000,
  followUpDebounce: 400
};

export const createClient = (options: TydomClientOptions) => new TydomClient(options);

type ResponseHandler = {resolve: (value?: any) => void; reject: (reason?: any) => void; timeout: NodeJS.Timeout | null};

export default class TydomClient extends EventEmitter {
  private config: Required<TydomClientOptions>;
  private socket?: WebSocket;
  private lastUniqueId: number;
  private pool: Map<string, ResponseHandler> = new Map();
  private keepAliveInterval?: NodeJS.Timeout;
  private reconnectInterval?: NodeJS.Timeout;
  constructor(options: TydomClientOptions) {
    super();
    this.config = {...defaultOptions, ...options};
    this.lastUniqueId = 0;
  }
  private uniqueId() {
    let nextUniqueId = Date.now();
    if (nextUniqueId <= this.lastUniqueId) {
      nextUniqueId = this.lastUniqueId + 1;
    }
    this.lastUniqueId = nextUniqueId;
    return `${nextUniqueId}`;
  }
  public async connect(): Promise<WebSocket> {
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
        const requestId = parsedMessage.headers.get('transac-id') as string;
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
        } else if (requestId) {
          // Relay follow-up
          this.emit(requestId, parsedMessage);
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
      socket.on('error', (err) => {
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
  send(rawHttpRequest: string) {
    assert(this.socket instanceof WebSocket, 'Required socket instance, please use connect() first');
    if ([WebSocket.CLOSING, WebSocket.CLOSED].includes(this.socket.readyState)) {
      throw new Error('Socket instance is closing/closed, please reconnect with connect() first');
    }
    const {hostname} = this.config;
    const isRemote = hostname === 'mediation.tydom.com';
    this.socket.send(Buffer.from(isRemote ? `\x02${rawHttpRequest}` : rawHttpRequest, 'ascii'));
  }
  private async request<T extends TydomResponse = TydomResponse>(
    {url, method, headers: extraHeaders = {}, body}: BuildRawHttpRequestOptions,
    requestId: string = this.uniqueId()
  ): Promise<T> {
    const {requestTimeout} = this.config;
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
        const resolveBody = (res: TydomHttpMessage) => resolve(res.body as T);
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
  public async get<T extends TydomResponse = TydomResponse>(url: string) {
    return await this.request<T>({url, method: 'GET'});
  }
  public async delete<T extends TydomResponse = TydomResponse>(url: string) {
    return await this.request<T>({url, method: 'DELETE'});
  }
  public async put<T extends TydomResponse = TydomResponse>(url: string, body: {[s: string]: any} = {}) {
    return await this.request<T>({url, method: 'PUT', body: JSON.stringify(body)});
  }
  public async post<T extends TydomResponse = TydomResponse>(url: string, body: {[s: string]: any} = {}) {
    return await this.request<T>({url, method: 'POST', body: JSON.stringify(body)});
  }
  public async command<T extends TydomResponse = TydomResponse>(url: string): Promise<T[]> {
    const {followUpDebounce} = this.config;
    const matches = url.match(/\/devices\/(\d+)\/endpoints\/(\d+)\/cdata\?name=(\w*)/i);
    assert(matches && matches.length === 4, 'Invalid command url');
    // const [_, deviceId, endpointId, commandName] = matches;
    const requestId = this.uniqueId();
    const results: T[] = [];
    return new Promise(async (resolve, reject) => {
      const debounceResolve = debounce(() => resolve(results), followUpDebounce);
      this.on(requestId, ({body}: TydomHttpMessage) => {
        const values = get(body, '0.endpoints.0.cdata.0.values');
        if (values) {
          results.push(values);
        } else {
          debug(`Unexpected command follow-up body="${body}"`);
        }
        debounceResolve();
      });
      try {
        await this.request<T>({url, method: 'GET'}, requestId);
      } catch (err) {
        reject(err);
      }
    });
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
