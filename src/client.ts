import { EventEmitter } from "events";
import * as chalk from "kolorist";
import WebSocket from "ws";
import { USER_AGENT } from "./config/env";
import { assert } from "./utils/assert";
import { calculateDelay } from "./utils/async";
import { chalkJson, chalkNumber, chalkString } from "./utils/chalk";
import { debounce } from "./utils/debounce";
import debug, { dir, toHexString } from "./utils/debug";
import {
  buildRawHttpRequest,
  BuildRawHttpRequestOptions,
  computeDigestAccessAuthenticationHeader,
  parseIncomingMessage,
} from "./utils/http";
import { Client, setupClient, TydomHttpMessage, TydomResponse } from "./utils/tydom";

export type TydomRequestBody = Record<string, unknown> | Record<string, unknown>[];

export type TydomClientConnectOptions = {
  keepAlive?: boolean;
  closeOnExit?: boolean;
};

export type TydomClientOptions = TydomClientConnectOptions & {
  username: string;
  password: string;
  hostname?: string;
  userAgent?: string;
  requestTimeout?: number;
  keepAliveInterval?: number;
  followUpDebounce?: number;
  retryOnClose?: boolean;
};

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
  resolve: (value?: TydomHttpMessage) => void;
  reject: (reason?: Error) => void;
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
  private lastUniqueId = 0;
  private attemptCount = 0;
  private pool = new Map<string, ResponseHandler>();
  private keepAliveInterval?: NodeJS.Timeout;
  private reconnectTimeout?: NodeJS.Timeout;
  private retrySuccessTimeout?: NodeJS.Timeout;
  constructor(options: TydomClientOptions) {
    super();
    this.config = { ...defaultOptions, ...options };
    this.client = setupClient(this.config);
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
      socket.on("message", (data: Buffer) => {
        debug(
          `Tydom socket received a ${chalkNumber(data.length)}-sized message received for hostname=${chalkString(
            hostname,
          )}`,
        );
        void (async () => {
          try {
            const parsedMessage = await parseIncomingMessage(isRemote ? data.subarray("\x02".length) : data);
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
            const requestId = (parsedMessage as TydomHttpMessage).headers.get("transac-id") ?? "";
            const responseHandler = requestId ? this.pool.get(requestId) : undefined;
            if (responseHandler) {
              // Clear timeout watchdog
              if (responseHandler.timeout) {
                clearTimeout(responseHandler.timeout);
              }
              try {
                responseHandler.resolve(parsedMessage as TydomHttpMessage);
              } catch (err) {
                responseHandler.reject(err instanceof Error ? err : new Error(String(err)));
              } finally {
                this.pool.delete(requestId);
              }
            } else {
              // Relay message on client
              this.emit("message", parsedMessage as TydomHttpMessage);
              // Dynamic requestId relay for specific command requests
              if (requestId) {
                this.emit(requestId, parsedMessage);
              }
            }
          } catch (err) {
            debug(`Failed to properly parse message hex=[${toHexString(data)}]`);
            dir(err);
          }
        })();
      });
      socket.on("close", () => {
        debug(`Tydom socket closed for hostname=${chalkString(hostname)}`);
        // Reject all pending requests to prevent hanging promises
        for (const [_requestId, handler] of this.pool) {
          if (handler.timeout) {
            clearTimeout(handler.timeout);
          }
          handler.reject(new Error("Socket closed while request was pending"));
        }
        this.pool.clear();
        // Clear keepAlive to prevent pinging a dead socket
        if (this.keepAliveInterval) {
          clearInterval(this.keepAliveInterval);
          this.keepAliveInterval = undefined;
        }
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
              this.connect().catch((err: unknown) => {
                const message = err instanceof Error ? err.message : String(err);
                debug(
                  `Failed attempt to reconnect to hostname=${chalkString(hostname)} with err=${chalkString(
                    message,
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
    if (this.socket.readyState === WebSocket.CLOSING || this.socket.readyState === WebSocket.CLOSED) {
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
      "content-length": `${body ? Buffer.byteLength(body) : 0}`,
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
      const resolveBody = (res?: TydomHttpMessage) => {
        resolve(res?.body as T);
      };
      const timeout =
        requestTimeout > 0
          ? setTimeout(() => {
              debug(`Timeout for request "${rawHttpRequest.replace(/\r\n/g, "\\r\\n")}"`);
              debug(`Closing the socket following request timeout to trigger a reconnection`);
              this.pool.delete(requestId);
              reject(new Error(`Request timed out after ${requestTimeout}ms`));
              this.close();
            }, requestTimeout)
          : null;
      this.pool.set(requestId, { resolve: resolveBody, reject, timeout });
      try {
        this.send(rawHttpRequest);
      } catch (err) {
        if (timeout) {
          clearTimeout(timeout);
        }
        this.pool.delete(requestId);
        reject(err instanceof Error ? err : new Error(String(err)));
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
    body: TydomRequestBody = {},
  ): Promise<T> {
    return await this.request<T>({ url, method: "PUT", body: JSON.stringify(body) });
  }
  public async post<T extends TydomResponse = TydomResponse>(
    url: string,
    body: TydomRequestBody = {},
  ): Promise<T> {
    return await this.request<T>({ url, method: "POST", body: JSON.stringify(body) });
  }
  public async command<T extends TydomResponse = TydomResponse>(url: string): Promise<T[]> {
    const { followUpDebounce, requestTimeout } = this.config;
    const matches = /\/devices\/(\d+)\/endpoints\/(\d+)\/cdata\?name=(\w*)/i.exec(url);
    assert(matches?.length === 4, "Invalid command url");
    const requestId = this.uniqueId();
    const results: T[] = [];
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        this.removeAllListeners(requestId);
        clearTimeout(maxTimeout);
      };
      const debounceResolve = debounce(() => {
        cleanup();
        resolve(results);
      }, followUpDebounce);
      const maxTimeout = setTimeout(() => {
        debounceResolve.cancel();
        cleanup();
        resolve(results);
      }, requestTimeout * 3);
      this.on(requestId, ({ body }: TydomHttpMessage) => {
        const bodyArray = body as Record<string, unknown>[];
        const endpoints = bodyArray[0]?.endpoints as Record<string, unknown>[] | undefined;
        const cdataArray = endpoints?.[0]?.cdata as Record<string, unknown>[] | undefined;
        const cdata = cdataArray?.[0];
        const values = cdata?.values as T | undefined;
        if (values) {
          results.push(values);
        } else if (cdata && !cdata.EOR) {
          // Only warn if it's not an End-Of-Response marker
          debug(`Unexpected command follow-up body="${chalkJson(body)}"`);
        }
        debounceResolve();
      });
      this.request<T>({ url, method: "GET" }, requestId).catch((err: unknown) => {
        cleanup();
        reject(err instanceof Error ? err : new Error(String(err)));
      });
    });
  }
  private isExiting = false;
  private exitListenersAttached = false;
  private attachExitListeners() {
    if (this.exitListenersAttached) {
      return;
    }
    this.exitListenersAttached = true;
    const gracefullyClose = () => {
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
