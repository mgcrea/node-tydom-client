import got, {Got, RetryObject} from 'got';
import {TydomClientOptions} from 'src/client';
import {assert} from 'src/utils/assert';
import {chalkKeyword, chalkString} from './chalk';
import debug from './debug';
import {DigestAccessAuthenticationFields, MessageType} from './http';

export type TydomResponse = Record<string, unknown> | Array<Record<string, unknown>>;

export type CastTydomMessageProps = {
  body: string;
  headers: Map<string, string>;
  method: 'GET' | 'PUT' | string | null;
  status: number | null;
  type: MessageType;
  uri: string;
};

export type TydomHttpMessage = CastTydomMessageProps & {
  body: TydomResponse;
};

export type TydomBinaryMessage = {
  type: MessageType;
  data: Buffer;
};

export const castTydomMessage = async ({
  body,
  headers,
  method,
  status,
  type,
  uri
}: CastTydomMessageProps): Promise<TydomHttpMessage> => {
  const hasBody = body.length > 0;
  const shouldBeJson =
    headers.has('content-type') && (headers.get('content-type') as string).includes('application/json');
  const isActuallyHtml = hasBody && body.startsWith('<!doctype html>');
  const isError = shouldBeJson && isActuallyHtml;
  const actualStatus = status === 200 && isError ? 400 : status;
  const json = async () => {
    if (!hasBody || !shouldBeJson) {
      return {};
    }
    if (shouldBeJson && isActuallyHtml) {
      return {error: 1, body};
    }
    return JSON.parse(body);
  };
  return {type, uri, method, status: actualStatus, body: await json(), headers};
};

export type Client = Got & {
  login: () => Promise<DigestAccessAuthenticationFields>;
};

export const setupGotClient = (config: Required<TydomClientOptions>): Client => {
  const {hostname, username, userAgent} = config;
  const client = got.extend({
    prefixUrl: `https://${hostname}`,
    // prefixUrl: `https://request.mgcrea.io/status/500/200`,
    headers: {
      'User-Agent': userAgent
    },
    retry: {
      limit: Infinity
    },
    hooks: {
      beforeRequest: [
        (options) => {
          const {method, url} = options;
          debug(`About to ${chalkKeyword(method)} request with url=${chalkString(url)}`);
        }
      ],
      beforeRetry: [
        (options, _error, _retryCount) => {
          const {method, url} = options;
          debug(`About to retry ${chalkKeyword(method)} request with url=${chalkString(url)}`);
        }
      ]
    },
    responseType: 'json',
    throwHttpErrors: false
  });

  const login = async (): Promise<DigestAccessAuthenticationFields> => {
    const searchParams = new URLSearchParams({mac: username, appli: '1'}).toString();
    const uri = 'mediation/client';
    const {statusCode, headers} = await client.get<string>(uri, {
      searchParams
    });
    assert(statusCode === 401, `Unexpected statusCode=${statusCode}`);
    const authHeader = headers['www-authenticate'];
    assert(authHeader, 'Missing required "www-authenticate" header');
    const authFieldsSplit = (authHeader as string).replace(/^Digest\s+/, '').split(',');
    const authFields = authFieldsSplit.reduce(
      (soFar: Partial<DigestAccessAuthenticationFields>, field: string) => {
        const [key, value] = field.split('="');
        soFar[key.trim() as keyof DigestAccessAuthenticationFields] = value.slice(0, -1);
        return soFar;
      },
      {uri: `/${uri}?${searchParams}`}
    ) as DigestAccessAuthenticationFields;
    return authFields;
  };

  return Object.assign(client, {login});
};

export const calculateDelay = ({attemptCount}: Pick<RetryObject, 'attemptCount'>) =>
  1000 * Math.pow(2, Math.max(0, attemptCount - 1)) + Math.random() * 100;

export const asyncWait = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
