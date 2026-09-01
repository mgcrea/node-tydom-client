import { parseIncomingMessage } from "#utils/http";
import { describe, expect, it } from "vitest";
import { getInfoResponse, updatedDevicesData } from "../__fixtures__/messages";

describe("parseIncomingMessage", () => {
  it("should properly parse a getInfoResponse response", async () => {
    const result = await parseIncomingMessage(getInfoResponse);
    expect(result).toBeDefined();
    expect(Object.keys(result)).toMatchSnapshot("getInfoResponse keys");
    const { date: _date1, ...message1 } = result as Record<string, unknown>;
    expect(message1).toMatchSnapshot("getInfoResponse message");
  });
  it("should properly parse a updatedDevicesData response", async () => {
    const result = await parseIncomingMessage(updatedDevicesData);
    expect(result).toBeDefined();
    expect(Object.keys(result)).toMatchSnapshot("updatedDevicesData keys");
    const { date: _date2, ...message2 } = result as Record<string, unknown>;
    expect(message2).toMatchSnapshot("updatedDevicesData message");
  });
});
