import {parseIncomingMessage} from 'src/utils/http';
import {getInfoResponse, updatedDevicesData} from '../__fixtures__/messages';

describe('parseIncomingMessage', () => {
  it('should properly parse a getInfoResponse response', async () => {
    const message = await parseIncomingMessage(getInfoResponse);
    expect(message).toBeDefined();
    expect(message).toMatchSnapshot();
  });
  it('should properly parse a updatedDevicesData response', async () => {
    const message = await parseIncomingMessage(updatedDevicesData);
    expect(message).toBeDefined();
    expect(message).toMatchSnapshot();
  });
});
