import fetch from 'node-fetch';
import assert from 'assert';
import {DigestAccessAuthenticationFields} from './http';

export type TydomResponse = Record<string, unknown> | Array<Record<string, unknown>>;

export type CastTydomMessageProps = {
  type: 'request' | 'response';
  uri: string;
  method: 'GET' | 'PUT' | string;
  body: string;
  headers: Map<string, string>;
};

export type TydomHttpMessage = Pick<CastTydomMessageProps, 'type' | 'uri' | 'method' | 'headers'> & {
  status: number;
  body: TydomResponse;
};

export const castTydomMessage = async ({
  type,
  uri,
  method,
  body,
  headers
}: CastTydomMessageProps): Promise<TydomHttpMessage> => {
  const hasBody = body.length > 0;
  const shouldBeJson =
    headers.has('content-type') && (headers.get('content-type') as string).includes('application/json');
  const isActuallyHtml = hasBody && body.startsWith('<!doctype html>');
  const status = isActuallyHtml ? 400 : 200;
  const json = async () => {
    if (!hasBody || !shouldBeJson) {
      return {};
    }
    if (shouldBeJson && isActuallyHtml) {
      return {error: 1, body};
    }
    return JSON.parse(body);
  };
  return {type, uri, method, status, body: await json(), headers};
};

type GetTydomDigestAccessAuthenticationOptions = {
  username: string;
  hostname: string;
  headers?: {[s: string]: string};
};

export const getTydomDigestAccessAuthenticationFields = async ({
  username,
  hostname,
  headers
}: GetTydomDigestAccessAuthenticationOptions) => {
  const query = `mac=${username}&appli=1`;
  const path = `/mediation/client?${query}`;
  const method = 'GET';
  console.log(`Connecting to url="${`https://${hostname}${path}`}"`);
  const {status, headers: responseHeaders} = await fetch(`https://${hostname}${path}`, {method, headers});
  assert(status === 401, `Unexpected status=${status}`);
  const authHeader = responseHeaders.get('www-authenticate');
  assert(authHeader, 'Missing required "www-authenticate" header');
  const authFieldsSplit = (authHeader as string).replace(/^Digest\s+/, '').split(',');
  const authFields = authFieldsSplit.reduce((soFar: {[s: string]: string}, field: string) => {
    const [key, value] = field.split('="');
    soFar[key.trim()] = value.slice(0, -1);
    return soFar;
  }, {});
  return authFields as DigestAccessAuthenticationFields;
};
