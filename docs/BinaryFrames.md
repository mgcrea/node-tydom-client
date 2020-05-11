# Tydom Binary Frames

## Introduction

Delta Dore home automation devices rely on a proprietary radio protocol called X3D, that is operating on the 868.350MHz band.

The mobile application API uses a WebSocket communication to interact with the Tydom gateway.

Inside this channel, most communication is done throught HTTP-like requests/responses UTF-8 encoded messages.

However the server sometimes relays messages as binary frames (usually 24B or 32B long), these might be the raw radio packets?

> Example binary frame:
>
> ```js
> 0x02 0x17 0x01 0x00 0x02 0x01 0x0a 0x02 0x00 0x0d 0x91 0x39 0x68 0x00 0x41 0x82 0x01 0x00 0x00 0x00 0xfe 0x0a 0xfc 0xce
> ```

What is interesting is that somes binary frames can be linked to regular HTTP-like WebSocket messages relayed at the same time so we have some good understanding of the underlying data being transmitted.

These binary frame are not protected by any kind of rolling/time-code scheme as the same action (eg. open a window) will produce the same frame.

Decoding them might lead to a proper reverse-engineering of the X3D protocol.

## Base Framing Protocol

With [quite a lot of messages](./files/UniqueBinaryFrames.txt), you can clearly see some kind of pattern in the bytes:

Here is my current understanding of it for a 24-byte long message:

Possible that the proper framing is at the bit-level but does not look like it (for a neophyte)

| **Bytes** | **Value**                  | **Description**                                          |
| --------- | -------------------------- | -------------------------------------------------------- |
| 0         | `0x02`                     | Header byte (same in HTTP-like messages)                 |
| 1         | `0x17`                     | Message size in bytes without header                     |
| 2-4       | `0x01 0x00 0x02`           | ? - Same accross all messages (or gateway/user related)  |
| 5         | `0x01`                     | Device "rang" (radio-related property)                   |
| 6-8       | `0x0a 0x02 0x00`           | ? - Same accross all messages (or gateway/user related)  |
| 9         | `0x0d`                     | ? - Same accross all same-sized messages (message type?) |
| 10-12     | `0x91 0x39 0x68`           | Device identifier `${LSB} ${ISB} ${MSB}`                 |
| 13-14     | `0x00 0x41`                | ? - Property value being updated                         |
| 15-18     | `0x82 0x01 0x00 0x00 0x00` | ? - Property name being updated                          |
| 19-23     | `0xfd, 0x52, 0xfb, 0xd0`   | ? - Maybe some checksum (last four bytes)                |

### Analysis

Some binary frame being relayed along traditionnal HTTP-like messages, it helped guess the device identifier and state:

When a window (contact sensor) is opened:

```js
0x02 0x17 0x01 0x00 0x02 0x01 0x0a 0x02 0x00 0x0d 0x91 0x39 0x68 0x00 0x41 0x82 0x01 0x00 0x00 0x00 0xfe 0x0a 0xfc 0xce
```

```json
[{"id": 1586250781, "endpoints": [{"id": 1586250781, "error": 0, "data": [{"name": "intrusionDetect", "validity": "upToDate", "value": true}]}]}]
```

When the same window (contact sensor) is closed:

```js
0x02 0x17 0x01 0x00 0x02 0x01 0x0a 0x02 0x00 0x0d 0x91 0x39 0x68 0x00 0x01 0x82 0x01 0x00 0x00 0x00 0xfe 0x4a 0xfc 0xce
```

```json
[{"id": 1586250781, "endpoints": [{"id": 1586250781, "error": 0, "data": [{"name": "intrusionDetect", "validity": "upToDate", "value": false}]}]}]
```

Which in that case gives us:

- Device/Endpoint identifier: `0x91 0x39 0x68` === `1586250781`
- Property value: `0x00 0x41` === `true` & `0x00 0x01` === `false`
- Property name (?): ``0x82 0x01 0x00 0x00 0x00`===`intrusionDetect`

```js
0x02 0x17 0x01 0x00 0x02 0x09 0x0a 0x02 0x00 0x0d 0xa2 0x39 0x68 0x00 0x00 0x82 0x01 0x00 0x00 0x00 0xfe 0x3a 0xfc 0xc6
```

### Device identifier

- Looking at the raw logs, you can guess the following matches for device identifiers:

| **Values**   | **Bytes**        |
| ------------ | ---------------- |
| `1586250781` | `0x91 0x39 0x68` |
| `1586251098` | `0x9e 0x39 0x68` |
| `1586254078` | `0xa2 0x39 0x68` |
| `1586251023` | `0x80 0x39 0x68` |
| `1586250858` | `0x9a 0x39 0x68` |
| `1521931577` | `0x11 0x89 0x80` |

- first two-digits, `15` might be a global prefix
- next four digits, `8625` might be related to device type
- last four digits, `0781` is the proper device identifier

For now I haven't found a way to decode from the numeric device id to the hex bytes of the binary frame.

Querying the API `/devices/access` access you can find some RF-relevant, for the device `1586250781`:

```json
{
  "id": 1586250781,
  "endpoints": [
    {
      "id": 1586250781,
      "error": 0,
      "access": {
        "protocol": "X3D",
        "profile": "detector",
        "type": "direct",
        "addr": {
          "rang": 1,
          "MSB": "0x68",
          "ISB": "0x39",
          "LSB": "0x91",
          "code": "0x08",
          "msg": "0x01",
          "var": "0x00",
          "index": "0x00",
          "canal": "0x00",
          "uFM": "0x20",
          "CS": "0x95"
        },
        "subAddr": 0
      }
    }
  ]
}
```

You can conclude that the deviceId is `${LSB} ${ISB} ${MSB}`

## Related

- [X2D decoding](https://github.com/sasu-drooz/Domoticz-Rfplayer/blob/master/plugin.py#L1473)

```python
id=1586250781
idb= bin(int(id))[2:]
print("id binary : " + str(idb))
Unit=idb[-6:]
idd=idb[:-6]
print("area b: " + str(Unit))
print("id decode b: " + str(idd))
print("area i: " + str(int(Unit,2)+1))
print("id decode i: " + str(int(idd,2)))
print("id decode h: " + str(hex(int(idd,2)))[2:])
```
