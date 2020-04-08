import assert from 'assert';
import fetch from 'node-fetch';
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
