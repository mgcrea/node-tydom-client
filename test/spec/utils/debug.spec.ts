import { redactSecrets } from "src/utils/debug";
import { describe, expect, it } from "vitest";

/**
 * Debug output is a support artefact — the README asks users to attach it to
 * bug reports — so anything that reaches it is something they are being asked
 * to publish.
 */
describe("redactSecrets", () => {
  it("removes the alarm PIN from a command body", () => {
    // The case that prompted this: every arm, disarm and zone command carries
    // the user's PIN, and it was being written to the log verbatim.
    const body = '{"value":"ON","pwd":"000000","zones":[2,3]}';
    expect(redactSecrets(body)).toBe('{"value":"ON","pwd":"[redacted]","zones":[2,3]}');
  });

  it("redacts the PIN inside a full raw request", () => {
    const raw = [
      "PUT /devices/1234567890/endpoints/1234567890/cdata?name=alarmCmd HTTP/1.1",
      "content-length: 30",
      "transac-id: 1731234567890",
      "",
      '{"value":"OFF","pwd":"000000"}',
      "",
    ].join("\r\n");
    const result = redactSecrets(raw);
    expect(result).not.toContain("000000");
    // The rest of the request has to survive: a redacted log is only useful if
    // it still shows what was sent and where.
    expect(result).toContain("cdata?name=alarmCmd");
    expect(result).toContain("transac-id: 1731234567890");
    expect(result).toContain('"value":"OFF"');
  });

  it.each(["password", "passwd", "pin", "token", "secret", "apiKey"])("redacts a %s field", (field) => {
    expect(redactSecrets(`{"${field}":"hunter2"}`)).toBe(`{"${field}":"[redacted]"}`);
  });

  it("is case-insensitive on the field name", () => {
    expect(redactSecrets('{"PWD":"000000"}')).toBe('{"PWD":"[redacted]"}');
  });

  it("keeps the key so a log still shows a secret was sent", () => {
    expect(redactSecrets('{"pwd":"000000"}')).toContain("pwd");
  });

  it("redacts credential headers", () => {
    const raw = "GET /ping HTTP/1.1\r\nAuthorization: Digest username=x, response=abc\r\ncontent-length: 0";
    const result = redactSecrets(raw);
    expect(result).not.toContain("response=abc");
    expect(result).toContain("Authorization: [redacted]");
    expect(result).toContain("content-length: 0");
  });

  it("does not spill past the end of a value", () => {
    // A greedy match would swallow the rest of the object.
    expect(redactSecrets('{"pwd":"1234","zones":[1,2],"value":"ON"}')).toBe(
      '{"pwd":"[redacted]","zones":[1,2],"value":"ON"}',
    );
  });

  it("handles an escaped quote inside the secret", () => {
    expect(redactSecrets('{"password":"a\\"b","x":1}')).toBe('{"password":"[redacted]","x":1}');
  });

  it("redacts every occurrence, not just the first", () => {
    expect(redactSecrets('[{"pwd":"111"},{"pwd":"222"}]')).toBe('[{"pwd":"[redacted]"},{"pwd":"[redacted]"}]');
  });

  it("leaves innocent payloads untouched", () => {
    const body = '[{"name":"level","value":47}]';
    expect(redactSecrets(body)).toBe(body);
  });

  it("does not redact a field that merely contains a secret word", () => {
    // `pinCode` is not in the list, but more importantly `spinner` must not be
    // mangled by a sloppy substring match.
    const body = '{"spinner":"fast","pincushion":"soft"}';
    expect(redactSecrets(body)).toBe(body);
  });
});
