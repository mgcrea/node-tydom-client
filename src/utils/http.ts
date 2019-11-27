import {HTTPParser} from 'http-parser-js';
import {castTydomResponse} from './tydom';
import {getRequestCounter, getRandomBytes, md5} from './crypto';

export const parser = new HTTPParser(HTTPParser.RESPONSE);

export const parseIncomingMessage = async (data: Buffer): Promise<{[s: string]: any}> => {
  return new Promise((resolve /*, reject */) => {
    const bodyParts: Buffer[] = [];
    let headers = new Map<string, string>();
    parser.onHeadersComplete = (res: {headers: string[]}) => {
      headers = res.headers.reduce<{headers: Map<string, string>; lastValue: string}>(
        (soFar, value, index) => {
          index % 2 ? soFar.headers.set(soFar.lastValue.toLowerCase(), value) : (soFar.lastValue = value);
          return soFar;
        },
        {headers, lastValue: ''}
      ).headers;
    };
    parser.onBody = (chunk: Buffer, offset: number, length: number) => {
      bodyParts.push(chunk.slice(offset, offset + length));
    };
    parser.onMessageComplete = function() {
      const body = Buffer.concat(bodyParts).toString('utf8');
      resolve(castTydomResponse(body, headers));
    };
    parser.execute(data);
  });
};

export type BuildRawHttpRequestOptions = {
  url: string;
  method: 'GET' | 'PUT' | 'POST' | 'DELETE';
  headers?: {[s: string]: string};
  body?: string;
};

export const buildRawHttpRequest = ({url, method, headers = {}, body}: BuildRawHttpRequestOptions) => {
  const rawRequest = `${method} ${url} HTTP/1.1`;
  const rawHeaders = Object.keys(headers).reduce((soFar, key) => {
    return `${soFar}${key}: ${headers[key]}\r\n`;
  }, '');
  return `${rawRequest}\r\n${rawHeaders}\r\n\r\n${body ? `${body}\r\n\r\n` : ''}`;
};

export type DigestAccessAuthenticationOptions = {
  uri: string;
  username: string;
  password: string;
};

export type DigestAccessAuthenticationFields = {
  realm: string;
  qop: string;
  nonce: string;
  opaque?: string;
};

export type DigestAccessAuthenticationHeader = {
  header: string;
  response: string;
  nc: string;
  cnonce: string;
};

export const computeDigestAccessAuthenticationHeader = async (
  {uri, username, password}: DigestAccessAuthenticationOptions,
  {realm, qop, nonce /*, opaque */}: DigestAccessAuthenticationFields
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
