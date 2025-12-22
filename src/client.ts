/* eslint-disable  */
import { EventEmitter } from "events";
import * as chalk from "kolorist";
import { debounce, get } from "lodash-es";
import WebSocket from "ws";
import { USER_AGENT } from "./config/env";
import { assert } from "./utils/assert";
import { calculateDelay } from "./utils/async";
import { chalkJson, chalkNumber, chalkString } from "./utils/chalk";
import debug, { dir, toHexString } from "./utils/debug";
import {
  buildRawHttpRequest,
  BuildRawHttpRequestOptions,
  computeDigestAccessAuthenticationHeader,
  parseIncomingMessage,
} from "./utils/http";
import { Client, setupGotClient, TydomHttpMessage, TydomResponse } from "./utils/tydom";

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
  keepAliveInterval?: number;
  followUpDebounce?: number;
  retryOnClose?: boolean;
}

export const defaultOptions: Required<
  Pick<
    TydomClientOptions,
    | "userAgent"
    | "hostname"
    | "keepAlive"
    | "closeOnExit"
    | "keepAliveInterval"
    | "requestTimeout"
    | "followUpDebounce"
    | "retryOnClose"
  >
> = {
  hostname: "mediation.tydom.com",
  userAgent: USER_AGENT,
  keepAlive: true,
  closeOnExit: true,
  requestTimeout: 5 * 1000,
  keepAliveInterval: 30 * 1000,
  followUpDebounce: 400,
  retryOnClose: true,
};

export const createClient = (options: TydomClientOptions): TydomClient => new TydomClient(options);

type ResponseHandler = {
  resolve: (value?: any) => void;
  reject: (reason?: any) => void;
  timeout: NodeJS.Timeout | null;
};

export type TydomClientEvents = {
  connect: [];
  disconnect: [];
  message: [TydomHttpMessage];
  // [key: string]: [TydomHttpMessage | TydomBinaryMessage];
};

export default class TydomClient extends EventEmitter<TydomClientEvents> {
  private config: Required<TydomClientOptions>;
  private socket?: WebSocket;
  private client: Client;
  private lastUniqueId: number = 0;
  private attemptCount: number = 0;
  private pool: Map<string, ResponseHandler> = new Map();
  private keepAliveInterval?: NodeJS.Timeout;
  private reconnectTimeout?: NodeJS.Timeout;
  private retrySuccessTimeout?: NodeJS.Timeout;
  constructor(options: TydomClientOptions) {
    super();
    this.config = { ...defaultOptions, ...options };
    this.client = setupGotClient(this.config);
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
    const {
      username,
      password,
      hostname,
      userAgent,
      keepAlive,
      closeOnExit,
      keepAliveInterval,
      retryOnClose,
    } = this.config;
    const isRemote = hostname === "mediation.tydom.com";
    // Http Login
    const { uri, realm, nonce, qop } = await this.client.login();
    const { header: authHeader } = await computeDigestAccessAuthenticationHeader(
      { username, password },
      { uri, realm, nonce, qop },
    );
    // WebSocket
    const websocketOptions: WebSocket.ClientOptions = {
      headers: { "User-Agent": userAgent, Authorization: authHeader },
    };
    return new Promise((resolve, reject) => {
      debug(`Attempting to open new socket for hostname=${chalkString(hostname)}`);
      const socket = new WebSocket(`wss://${hostname}${uri}`, websocketOptions);
      socket.on("open", () => {
        debug(`Tydom socket opened for hostname=${chalkString(hostname)}`);
        this.socket = socket;
        if (keepAlive) {
          if (this.keepAliveInterval) {
            debug(`Removing existing keep-alive interval`);
            clearInterval(this.keepAliveInterval);
          }
          const actualKeepAliveInterval = Math.max(1000, keepAliveInterval);
          debug(
            `Configuring keep-alive interval of ~${chalkNumber(Math.round(actualKeepAliveInterval / 1000))}s`,
          );
          this.keepAliveInterval = setInterval(() => {
            this.get("/ping").catch((err: unknown) => {
              debug(`Failed to ping hostname=${chalkString(hostname)} with err=${chalkString(err)}`);
            });
          }, actualKeepAliveInterval);
        }
        if (closeOnExit) {
          this.attachExitListeners();
        }
        resolve(socket);
        this.emit("connect");
      });
      socket.on("message", async (data: Buffer) => {
        debug(
          `Tydom socket received a ${chalkNumber(data.length)}-sized message received for hostname=${chalkString(
            hostname,
          )}`,
        );
        try {
          const parsedMessage = await parseIncomingMessage(isRemote ? data.slice("\x02".length) : data);
          const { type } = parsedMessage;
          if (type === "binary") {
            debug(
              `Parsed ${chalkNumber(data.length)}-sized received message as ${chalk.blue(type)}:\n${chalk.gray(
                toHexString(data),
              )}`,
            );
            return;
          }
          debug(
            `Parsed ${chalkNumber(data.length)}-sized received message as ${chalk.blue(type)}:\n${chalk.gray(
              data.toString("utf8"),
            )}`,
          );
          const requestId = (parsedMessage as TydomHttpMessage).headers.get("transac-id") as string;
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
          } else if (parsedMessage) {
            // Relay message on client
            this.emit("message", parsedMessage as TydomHttpMessage);
            // Dynamic requestId relay for specific command requests
            this.emit(requestId, parsedMessage);
          }
        } catch (err) {
          debug(`Failed to properly parse message hex=[${toHexString(data)}]`);
          dir(err);
        }
      });
      socket.on("close", () => {
        debug(`Tydom socket closed for hostname=${chalkString(hostname)}`);
        this.emit("disconnect");
        // Clear any pending successTimeout
        if (this.retrySuccessTimeout) {
          clearTimeout(this.retrySuccessTimeout);
        }
        // Reconnect
        if (this.reconnectTimeout) {
          debug(`Removing existing reconnect timeout`);
          clearTimeout(this.reconnectTimeout);
        }
        if (retryOnClose && !this.isExiting) {
          setImmediate(() => {
            this.attemptCount += 1;
            const actualReconnectTimeout = Math.max(1000, calculateDelay({ attemptCount: this.attemptCount }));
            debug(
              `Configuring socket reconnection timeout of ~${chalkNumber(Math.round(actualReconnectTimeout / 1000))}s`,
            );
            this.reconnectTimeout = setTimeout(() => {
              debug(
                `About to attempt to reconnect to hostname=${chalkString(hostname)} for the ${chalkNumber(
                  this.attemptCount,
                )}-th time ...`,
              );
              this.connect().catch((err) => {
                debug(
                  `Failed attempt to reconnect to hostname=${chalkString(hostname)} with err=${chalkString(
                    err.message,
                  )} for the ${chalkNumber(this.attemptCount)}-th time!`,
                );
              });
              // Consider attempt successful after a 60s+ stable connection
              this.retrySuccessTimeout = setTimeout(() => {
                debug(
                  `Reconnection to hostname=${chalkString(hostname)} for the ${chalkNumber(
                    this.attemptCount,
                  )}-th time was successful (> 60s), will reset \`attemptCount\``,
                );
                this.attemptCount = 0;
              }, 60 * 1000);
            }, actualReconnectTimeout);
          });
        }
      });
      socket.on("error", (err) => {
        this.attemptCount += 1;
        debug(`Tydom socket error for hostname=${chalkString(hostname)}`);
        reject(err);
      });
    });
  }
  public close(): void {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
    }
    if (!(this.socket instanceof WebSocket)) {
      debug(`Socket instance is missing while performing close()`);
      return;
    }
    this.socket.close();
  }
  send(rawHttpRequest: string): void {
    assert(this.socket instanceof WebSocket, "Required socket instance, please use connect() first");
    // @ts-expect-error wtf?
    if ([WebSocket.CLOSING, WebSocket.CLOSED].includes(this.socket.readyState)) {
      debug(
        `Closed/closing socket instance, readyState=${this.socket.readyState} for request="${rawHttpRequest}"`,
      );
      throw new Error("Socket instance is closing/closed, please reconnect with connect() first");
    }
    const { hostname } = this.config;
    const isRemote = hostname === "mediation.tydom.com";
    this.socket.send(Buffer.from(isRemote ? `\x02${rawHttpRequest}` : rawHttpRequest, "ascii"));
  }
  private async request<T extends TydomResponse = TydomResponse>(
    { url, method, headers: extraHeaders = {}, body = "" }: BuildRawHttpRequestOptions,
    requestId: string = this.uniqueId(),
  ): Promise<T> {
    const { requestTimeout } = this.config;
    const headers = {
      ...extraHeaders,
      "content-length": `${body ? body.length : 0}`,
      "content-type": "application/json; charset=utf-8",
      "transac-id": requestId,
    };
    const rawHttpRequest = buildRawHttpRequest({ url, method, headers, body });
    debug(
      `Writing ${chalkNumber(rawHttpRequest.length)}-sized request on Tydom socket:\n${chalk.gray(
        rawHttpRequest.replace(/\r\n/g, "\\r\\n"),
      )}`,
    );
    return new Promise((resolve, reject) => {
      try {
        const resolveBody = (res: TydomHttpMessage) => resolve(res.body as T);
        const timeout =
          requestTimeout > 0
            ? setTimeout(() => {
                debug(`Timeout for request "${rawHttpRequest.replace(/\r\n/g, "\\r\\n")}"`);
                debug(`Closing the socket following request timeout to trigger a reconnection`);
                this.close();
              }, requestTimeout)
            : null;
        this.pool.set(requestId, { resolve: resolveBody, reject, timeout });
        this.send(rawHttpRequest);
      } catch (err) {
        reject(err);
      }
    });
  }
  public async get<T extends TydomResponse = TydomResponse>(url: string): Promise<T> {
    return await this.request<T>({ url, method: "GET" });
  }
  public async delete<T extends TydomResponse = TydomResponse>(url: string): Promise<T> {
    return await this.request<T>({ url, method: "DELETE" });
  }
  public async put<T extends TydomResponse = TydomResponse>(
    url: string,
    body: { [s: string]: any } = {},
  ): Promise<T> {
    return await this.request<T>({ url, method: "PUT", body: JSON.stringify(body) });
  }
  public async post<T extends TydomResponse = TydomResponse>(
    url: string,
    body: { [s: string]: any } = {},
  ): Promise<T> {
    return await this.request<T>({ url, method: "POST", body: JSON.stringify(body) });
  }
  public async command<T extends TydomResponse = TydomResponse>(url: string): Promise<T[]> {
    const { followUpDebounce } = this.config;
    const matches = url.match(/\/devices\/(\d+)\/endpoints\/(\d+)\/cdata\?name=(\w*)/i);
    assert(matches && matches.length === 4, "Invalid command url");
    // const [_, deviceId, endpointId, commandName] = matches;
    const requestId = this.uniqueId();
    const results: T[] = [];
    return new Promise(async (resolve, reject) => {
      const debounceResolve = debounce(() => resolve(results), followUpDebounce);
      this.on(requestId, ({ body }: TydomHttpMessage) => {
        const values = get(body, "0.endpoints.0.cdata.0.values");
        if (values) {
          results.push(values);
        } else {
          debug(`Unexpected command follow-up body="${chalkJson(body)}"`);
        }
        debounceResolve();
      });
      try {
        await this.request<T>({ url, method: "GET" }, requestId);
      } catch (err) {
        reject(err);
      }
    });
  }
  private isExiting = false;
  private attachExitListeners() {
    const gracefullyClose = async () => {
      const { socket } = this;
      // Exit only once
      if (this.isExiting) {
        return;
      }
      this.isExiting = true;
      debug("Attempting to gracefully close socket ...");
      // Properly clear any running setInterval
      if (this.reconnectTimeout) {
        clearTimeout(this.reconnectTimeout);
      }
      if (this.keepAliveInterval) {
        clearInterval(this.keepAliveInterval);
      }
      if (!socket) {
        debug("Socket instance not found, exiting!");
        setImmediate(() => process.exit(0));
        return;
      }
      socket.once("close", () => {
        debug("Socket instance properly closed, exiting!");
        setImmediate(() => process.exit(0));
      });
      switch (socket.readyState) {
        case socket.CONNECTING:
        case socket.OPEN: {
          this.close();
          break;
        }
        case socket.CLOSING:
        case socket.CLOSED:
        default:
          return;
      }
    };
    process.on("SIGTERM", gracefullyClose);
    // Handle Ctrl+C
    process.on("SIGINT", gracefullyClose);
    // Handle nodemon restarts
    process.on("SIGUSR2", gracefullyClose);
  }
}
