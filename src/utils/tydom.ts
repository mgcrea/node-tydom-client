import got, { Got } from "got";
import { URLSearchParams } from "url";
import { TydomClientOptions } from "../client";
import { assert } from "./assert";
import { chalkKeyword, chalkString } from "./chalk";
import debug from "./debug";
import { DigestAccessAuthenticationFields, MessageType } from "./http";

export type TydomResponse = Record<string, unknown> | Record<string, unknown>[];

export type CastTydomMessageProps = {
  body: string;
  headers: Map<string, string>;
  method: string | null;
  status: number | null;
  type: MessageType;
  uri: string;
  date: Date;
};

export type TydomHttpMessage = Omit<CastTydomMessageProps, "body"> & {
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
  uri,
  date,
}: CastTydomMessageProps): Promise<TydomHttpMessage> => {
  const hasBody = body.length > 0;
  const contentType = headers.get("content-type");
  const shouldBeJson = contentType?.includes("application/json") ?? false;
  const isActuallyHtml = hasBody && body.startsWith("<!doctype html>");
  const isError = shouldBeJson && isActuallyHtml;
  const actualStatus = status === 200 && isError ? 400 : status;
  // eslint-disable-next-line @typescript-eslint/require-await
  const json = async (): Promise<TydomResponse> => {
    if (!hasBody || !shouldBeJson) {
      return {};
    }
    if (isActuallyHtml) {
      return { error: 1, body };
    }
    return JSON.parse(body) as TydomResponse;
  };
  return { type, uri, method, status: actualStatus, body: await json(), headers, date };
};

export type Client = Got & {
  login: () => Promise<DigestAccessAuthenticationFields>;
};

export const setupGotClient = (config: Required<TydomClientOptions>): Client => {
  const { hostname, username, userAgent } = config;
  const isRemote = hostname === "mediation.tydom.com";
  const client = got.extend({
    prefixUrl: `https://${hostname}`,
    // prefixUrl: `https://request.mgcrea.io/status/500/200`,
    headers: {
      "User-Agent": userAgent,
    },
    retry: {
      limit: Infinity,
    },
    hooks: {
      beforeRequest: [
        (options) => {
          const { method, url } = options;
          debug(`About to ${chalkKeyword(method)} request with url=${chalkString(url)}`);
        },
      ],
      beforeRetry: [
        (error, retryCount) => {
          debug(`About to retry request (attempt ${retryCount}) after error: ${error.message}`);
        },
      ],
    },
    responseType: "json",
    throwHttpErrors: false,
    https: {
      rejectUnauthorized: isRemote,
    },
  });

  const login = async (): Promise<DigestAccessAuthenticationFields> => {
    const searchParams = new URLSearchParams({ mac: username, appli: "1" }).toString();
    const uri = "mediation/client";
    const response = await client.get(uri, {
      searchParams,
      responseType: "text",
    });
    assert(response.statusCode === 401, `Unexpected statusCode=${response.statusCode}`);
    const authHeader = response.headers["www-authenticate"];
    assert(authHeader, 'Missing required "www-authenticate" header');
    const authFieldsSplit = authHeader.replace(/^Digest\s+/, "").split(",");
    const authFields = authFieldsSplit.reduce(
      (soFar: Partial<DigestAccessAuthenticationFields>, field: string) => {
        const [key, value] = field.split('="');
        soFar[key.trim() as keyof DigestAccessAuthenticationFields] = value.slice(0, -1);
        return soFar;
      },
      { uri: `/${uri}?${searchParams}` },
    ) as DigestAccessAuthenticationFields;
    return authFields;
  };

  return Object.assign(client, { login });
};
