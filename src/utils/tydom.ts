import fetch from 'node-fetch';
import assert from 'assert';
import {DigestAccessAuthenticationFields} from './http';

export type TydomResponse = {
  status: number;
  body: string;
  headers: Map<string, string>;
  json: () => Promise<{[s: string]: string}>;
};

export const castTydomResponse = (body: string, headers: Map<string, string>): TydomResponse => {
  const hasBody = body.length > 0;
  const shouldBeJson = headers.has('content-type') && headers.get('content-type')!.includes('application/json');
  const isActuallyHtml = hasBody && body.startsWith('<!doctype html>');
  const status = isActuallyHtml ? 400 : 200;
  const json = async () => {
    if (!hasBody || !shouldBeJson) {
      return {};
    }
    if (isActuallyHtml) {
      return {error: 1};
    }
    return JSON.parse(body);
  };
  return {status, body, headers, json};
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
