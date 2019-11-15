// @ts-ignore
import {HTTPParser} from 'http-parser-js';
import {castTydomResponse} from './tydom';

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

type BuildRawHttpRequestOptions = {
  url: string;
  method: 'GET' | 'PUT';
  headers: {[s: string]: string};
  body?: string;
};

export const buildRawHttpRequest = ({url, method, headers, body}: BuildRawHttpRequestOptions) => {
  const rawRequest = `${method} ${url} HTTP/1.1`;
  const rawHeaders = Object.keys(headers).reduce((soFar, key) => {
    return `${soFar}${key}: ${headers[key]}\r\n`;
  }, '');
  return `${rawRequest}\r\n${rawHeaders}\r\n\r\n${body ? `${body}\r\n\r\n` : ''}`;
};
