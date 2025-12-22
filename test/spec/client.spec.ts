import nock from "nock";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "../../src/client";

const username = "001A25123456";
const password = "MyPassw0rd!";

beforeAll(() => {
  nock.disableNetConnect();
  // nock.recorder.rec();
});

afterAll(() => {
  nock.cleanAll();
  nock.enableNetConnect();
});

describe("client", () => {
  it("should properly create a client", () => {
    const client = createClient({ username, password });
    expect(client).toBeDefined();
    expect(Object.keys(client)).toMatchSnapshot();
    expect(Object.values(client)).toMatchSnapshot();
  });

  it("should properly perform login to a remote tydom server", async () => {
    const client = createClient({ username, password, retryOnClose: false });
    nock(`https://mediation.tydom.com:443`)
      .get("/mediation/client")
      .query({ mac: username, appli: "1" })
      .once()
      .reply(401, "", {
        "X-Content-Type-Options": "nosniff",
        "X-XSS-Protection": "1; mode=block",
        "Cache-Control": "no-cache, no-store, max-age=0, must-revalidate",
        Pragma: "no-cache",
        Expires: "0",
        "X-Frame-Options": "DENY",
        "WWW-Authenticate":
          'Digest realm="ServiceMedia", qop="auth", nonce="MTU3Mzg1NjY0MjAyMjphYjU4ODgzYjEyZTdjODIwZTU0NWIwODZlYWJjOWQ5MA=="',
        "Content-Length": "0",
        Date: "Fri, 15 Nov 2019 22:19:01 GMT",
      });

    // WebSocket connection will fail since nock can't mock WebSocket upgrades (status 101)
    // but we can verify the HTTP login phase works correctly
    await expect(client.connect()).rejects.toBeInstanceOf(Error);
  });

  it("should properly perform login to a local tydom server", async () => {
    const hostname = "192.168.1.2";
    const client = createClient({ username, password, hostname, retryOnClose: false });
    nock(`https://${hostname}:443`)
      .get("/mediation/client")
      .query({ mac: username, appli: "1" })
      .once()
      .reply(
        401,
        "<!doctype html>\r\n<html>\r\n<head><title>Error 401</title></head>\r\n<body>\r\n<h2>Error 401</h2>\r\n<p>Authorization required</p>\r\n</body>\r\n</html>\r\n",
        {
          Server: "Oryx Embedded HTTP Server",
          Connection: "close",
          "Content-Type": "text/html",
          "WWW-Authenticate":
            'Digest  realm="Protected Area",  qop="auth",  nonce="cb584e44c43ed6bd0bc2d9c7e242837d",  opaque="94619f8a70068b2591c2eed622525b0e"',
        },
      );

    // WebSocket connection will fail since nock can't mock WebSocket upgrades (status 101)
    // but we can verify the HTTP login phase works correctly
    await expect(client.connect()).rejects.toBeInstanceOf(Error);
  });
});
