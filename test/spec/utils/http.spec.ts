import { omit } from "lodash-es";
import { parseIncomingMessage } from "src/utils/http";
import { describe, expect, it } from "vitest";
import { getInfoResponse, updatedDevicesData } from "../__fixtures__/messages";

describe("parseIncomingMessage", () => {
  it("should properly parse a getInfoResponse response", async () => {
    const message = await parseIncomingMessage(getInfoResponse);
    expect(message).toBeDefined();
    expect(Object.keys(message)).toMatchSnapshot();
    expect(omit(message, "date")).toMatchSnapshot();
  });
  it("should properly parse a updatedDevicesData response", async () => {
    const message = await parseIncomingMessage(updatedDevicesData);
    expect(message).toBeDefined();
    expect(Object.keys(message)).toMatchSnapshot();
    expect(omit(message, "date")).toMatchSnapshot();
  });
});
