import {createClient} from '../../src/client';
import nock from 'nock';

const username = '001A25123456';
const password = 'MyPassw0rd!';

beforeAll(() => {
  nock.disableNetConnect();
  // nock.recorder.rec();
});

describe('client', () => {
  it('should properly create a client', () => {
    const client = createClient({username, password});
    expect(client).toBeDefined();
    expect(Object.keys(client)).toMatchSnapshot();
    expect(Object.values(client)).toMatchSnapshot();
  });
  it('should properly connect to a remote tydom server', async () => {
    const client = createClient({username, password, retryOnClose: false});
    nock(`https://mediation.tydom.com:443`)
      .get('/mediation/client')
      .query({mac: username, appli: '1'})
      .once()
      .reply(401, '', [
        'X-Content-Type-Options',
        'nosniff',
        'X-XSS-Protection',
        '1; mode=block',
        'Cache-Control',
        'no-cache, no-store, max-age=0, must-revalidate',
        'Pragma',
        'no-cache',
        'Expires',
        '0',
        'X-Frame-Options',
        'DENY',
        'WWW-Authenticate',
        'Digest realm="ServiceMedia", qop="auth", nonce="MTU3Mzg1NjY0MjAyMjphYjU4ODgzYjEyZTdjODIwZTU0NWIwODZlYWJjOWQ5MA=="',
        'Content-Length',
        '0',
        'Date',
        'Fri, 15 Nov 2019 22:19:01 GMT'
      ]);

    nock(`https://mediation.tydom.com:443`)
      .get('/mediation/client')
      .query({mac: username, appli: '1'})
      .twice()
      .reply(101, undefined, {
        Connection: 'Upgrade',
        Upgrade: 'websocket'
      });
    try {
      await client.connect();
    } catch (err) {
      // @NOTE nock does not properly reply to Websocket handshakes for now
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toEqual('Unexpected server response: 101');
    }
  });
  it('should properly connect to a local tydom server', async () => {
    const hostname = '192.168.1.2';
    const client = createClient({username, password, hostname, retryOnClose: false});
    nock(`https://${hostname}:443`)
      .get('/mediation/client')
      .query({mac: username, appli: '1'})
      .once()
      .reply(
        401,
        '<!doctype html>\r\n<html>\r\n<head><title>Error 401</title></head>\r\n<body>\r\n<h2>Error 401</h2>\r\n<p>Authorization required</p>\r\n</body>\r\n</html>\r\n',
        {
          Server: 'Oryx Embedded HTTP Server',
          Connection: 'close',
          'Content-Type': 'text/html',
          'WWW-Authenticate':
            'Digest  realm="Protected Area",  qop="auth",  nonce="cb584e44c43ed6bd0bc2d9c7e242837d",  opaque="94619f8a70068b2591c2eed622525b0e"'
        }
      );
    nock(`https://${hostname}:443`)
      .get('/mediation/client')
      .query({mac: username, appli: '1'})
      .twice()
      .reply(101, undefined, {
        Server: 'Oryx Embedded HTTP Server',
        Connection: 'Upgrade',
        Upgrade: 'websocket'
      });
    try {
      await client.connect();
    } catch (err) {
      // @NOTE nock does not properly reply to Websocket handshakes for now
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toEqual('Unexpected server response: 101');
    }
  });
});

afterAll(() => {
  nock.cleanAll();
  nock.enableNetConnect();
});
