import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { createClient } from "../../src/client";
import { server } from "../msw-server";

const username = "001A25123456";
const password = "MyPassw0rd!";

describe("client", () => {
  it("should properly create a client", () => {
    const client = createClient({ username, password });
    expect(client).toBeDefined();
    expect(Object.keys(client)).toMatchSnapshot("client keys");
    expect(Object.values(client)).toMatchSnapshot("client values");
  });

  it("should properly perform login to a remote tydom server", async () => {
    const client = createClient({ username, password, retryOnClose: false });
    server.use(
      http.get("https://mediation.tydom.com/mediation/client", () => {
        return new HttpResponse(null, {
          status: 401,
          headers: {
            "X-Content-Type-Options": "nosniff",
            "X-XSS-Protection": "1; mode=block",
            "Cache-Control": "no-cache, no-store, max-age=0, must-revalidate",
            Pragma: "no-cache",
            Expires: "0",
            "X-Frame-Options": "DENY",
            "WWW-Authenticate":
              'Digest realm="ServiceMedia", qop="auth", nonce="MTU3Mzg1NjY0MjAyMjphYjU4ODgzYjEyZTdjODIwZTU0NWIwODZlYWJjOWQ5MA=="',
            Date: "Fri, 15 Nov 2019 22:19:01 GMT",
          },
        });
      }),
    );

    // The digest challenge is the whole HTTP phase; the WebSocket upgrade that
    // follows is not stubbed, so connect() is expected to reject after the
    // login it does exercise has succeeded.
    await expect(client.connect()).rejects.toBeInstanceOf(Error);
  });

  it("should properly perform login to a local tydom server", async () => {
    const hostname = "192.168.1.2";
    const client = createClient({ username, password, hostname, retryOnClose: false });
    server.use(
      http.get(`https://${hostname}/mediation/client`, () => {
        return new HttpResponse(
          "<!doctype html>\r\n<html>\r\n<head><title>Error 401</title></head>\r\n<body>\r\n<h2>Error 401</h2>\r\n<p>Authorization required</p>\r\n</body>\r\n</html>\r\n",
          {
            status: 401,
            headers: {
              Server: "Oryx Embedded HTTP Server",
              Connection: "close",
              "Content-Type": "text/html",
              "WWW-Authenticate":
                'Digest  realm="Protected Area",  qop="auth",  nonce="cb584e44c43ed6bd0bc2d9c7e242837d",  opaque="94619f8a70068b2591c2eed622525b0e"',
            },
          },
        );
      }),
    );

    await expect(client.connect()).rejects.toBeInstanceOf(Error);
  });
});
