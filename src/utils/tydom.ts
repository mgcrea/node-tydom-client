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

export type Client = {
  login: () => Promise<DigestAccessAuthenticationFields>;
};

export const setupClient = (config: Required<TydomClientOptions>): Client => {
  const { hostname, username, userAgent } = config;

  const login = async (): Promise<DigestAccessAuthenticationFields> => {
    const searchParams = new URLSearchParams({ mac: username, appli: "1" }).toString();
    const uri = "mediation/client";
    const url = `https://${hostname}/${uri}?${searchParams}`;
    debug(`About to ${chalkKeyword("GET")} request with url=${chalkString(url)}`);
    const response = await fetch(url, {
      headers: { "User-Agent": userAgent },
    });
    assert(response.status === 401, `Unexpected statusCode=${response.status}`);
    const authHeader = response.headers.get("www-authenticate");
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

  return { login };
};
