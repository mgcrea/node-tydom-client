import {HTTPParser} from 'http-parser-js';
import {assert} from './assert';
import {getRandomBytes, getRequestCounter, md5} from './crypto';
import {castTydomMessage, TydomBinaryMessage, TydomHttpMessage} from './tydom';

const requestParser = new HTTPParser(HTTPParser.REQUEST);
const responseParser = new HTTPParser(HTTPParser.RESPONSE);

const REQUEST_REGEX = /^([A-Z-]+) ([^ ]+) HTTP\/(\d)\.(\d)$/;
const RESPONSE_REGEX = /^HTTP\/(\d)\.(\d) (\d{3}) ?(.*)$/;

export type MessageType = 'response' | 'request' | 'binary';
export const getMessageType = (data: Buffer): {type: MessageType; matches: RegExpMatchArray | null} => {
  const firstLine = data.slice(0, data.indexOf('\r\n')).toString('ascii');
  if (RESPONSE_REGEX.test(firstLine)) {
    return {type: 'response', matches: firstLine.match(RESPONSE_REGEX)};
  }
  if (REQUEST_REGEX.test(firstLine)) {
    return {type: 'request', matches: firstLine.match(REQUEST_REGEX)};
  }
  return {type: 'binary', matches: null};
};

export const parseIncomingMessage = async (data: Buffer): Promise<TydomBinaryMessage | TydomHttpMessage> => {
  return new Promise((resolve, reject) => {
    try {
      const {type: messageType, matches: messageMatches} = getMessageType(data);
      if (messageType === 'binary') {
        resolve({type: messageType, data});
        return;
      }
      assert(messageMatches, 'Unexpected empty messageMatches');
      const parser = messageType === 'response' ? responseParser : requestParser;
      const bodyParts: Buffer[] = [];
      let headers = new Map<string, string>();
      parser.onHeadersComplete = (res: {headers: string[]}) => {
        headers = res.headers.reduce<{headers: Map<string, string>; lastValue: string}>(
          (soFar, value, index) => {
            index % 2 ? soFar.headers.set(soFar.lastValue.toLowerCase(), value) : (soFar.lastValue = value);
            return soFar;
          },
          {headers, lastValue: ''},
        ).headers;
      };
      parser.onBody = (chunk: Buffer, offset: number, length: number) => {
        bodyParts.push(chunk.slice(offset, offset + length));
      };
      parser.onMessageComplete = () => {
        const date = new Date();
        const body = Buffer.concat(bodyParts).toString('utf8');
        switch (messageType) {
          case 'response': {
            const method = null;
            const uri = headers.get('uri-origin') || '/';
            const status = parseInt(messageMatches[3], 10);
            resolve(castTydomMessage({type: messageType, method, uri, status, body, headers, date}));
            return;
          }
          case 'request': {
            const method = messageMatches[1];
            const uri = messageMatches[2];
            const status = null;
            resolve(castTydomMessage({type: messageType, method, uri, status, body, headers, date}));
            return;
          }
          default: {
            throw new Error(`Unhandled messageType=${messageType}`);
          }
        }
      };
      parser.execute(data);
    } catch (err) {
      reject(err);
    }
  });
};

export type BuildRawHttpRequestOptions = {
  url: string;
  method: 'GET' | 'PUT' | 'POST' | 'DELETE';
  headers?: {[s: string]: string};
  body?: string;
};

export const buildRawHttpRequest = ({url, method, headers = {}, body}: BuildRawHttpRequestOptions): string => {
  const rawRequest = `${method} ${url} HTTP/1.1`;
  const rawHeaders = Object.keys(headers).reduce((soFar, key) => {
    return `${soFar}${key}: ${headers[key]}\r\n`;
  }, '');
  return `${rawRequest}\r\n${rawHeaders}\r\n\r\n${body ? `${body}\r\n\r\n` : ''}`;
};

export type DigestAccessAuthenticationOptions = {
  username: string;
  password: string;
};

export type DigestAccessAuthenticationFields = {
  realm: string;
  qop: string;
  nonce: string;
  opaque?: string;
  uri: string;
};

export type DigestAccessAuthenticationHeader = {
  header: string;
  response: string;
  nc: string;
  cnonce: string;
};

export const computeDigestAccessAuthenticationHeader = async (
  {username, password}: DigestAccessAuthenticationOptions,
  {uri, realm, qop, nonce /*, opaque */}: DigestAccessAuthenticationFields,
): Promise<DigestAccessAuthenticationHeader> => {
  const nc = getRequestCounter();
  const cnonce = (await getRandomBytes(4)).toString('hex');
  const ha1 = (await md5(`${username}:${realm}:${password}`)).toString('hex');
  const ha2 = (await md5(`GET:${uri}`)).toString('hex');
  const res = `${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`;
  const response = (await md5(res)).toString('hex');
  const header = `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${response}", qop=${qop}, nc=${nc}, cnonce="${cnonce}"`;
  return {header, response, nc, cnonce};
};
