export const getInfoResponse = Buffer.from(
  'HTTP/1.1 200 OK\r\n' +
    'Server: Tydom-001A2502951F\r\n' +
    'Uri-Origin: /info\r\n' +
    'Content-Type: application/json\r\n' +
    'Transfer-Encoding: chunked\r\n' +
    'Transac-Id: request_1\r\n' +
    '\r\n' +
    '1\r\n' +
    '{\r\n' +
    '18\r\n' +
    '"productName": "TYDOM2",\r\n' +
    '16\r\n' +
    '"mac": "001A2502951F",\r\n' +
    '11\r\n' +
    '"config": "prod",\r\n' +
    '12\r\n' +
    '"bddEmpty": false,\r\n' +
    'F\r\n' +
    '"bddStatus": 0,\r\n' +
    '10\r\n' +
    '"apiMode": true,\r\n' +
    '1C\r\n' +
    '"mainVersionSW": "02.02.53",\r\n' +
    '1C\r\n' +
    '"mainVersionHW": "00.00.01",\r\n' +
    '14\r\n' +
    '"mainId": "6414118",\r\n' +
    '1C\r\n' +
    '"mainReference": "21260010",\r\n' +
    '1B\r\n' +
    '"keyVersionSW": "01.03.03",\r\n' +
    '1B\r\n' +
    '"keyVersionHW": "00.00.01",\r\n' +
    '1E\r\n' +
    '"keyVersionStack": "01.01.03",\r\n' +
    '1B\r\n' +
    '"keyReference": "21260011",\r\n' +
    '1D\r\n' +
    '"bootReference": "P21260012",\r\n' +
    '1A\r\n' +
    '"bootVersion": "01.00.03",\r\n' +
    'F\r\n' +
    '"TYDOM.dat": 1,\r\n' +
    '11\r\n' +
    '"config.json": 1,\r\n' +
    'E\r\n' +
    '"mom.json": 0,\r\n' +
    '11\r\n' +
    '"gateway.dat": 0,\r\n' +
    'F\r\n' +
    '"bdd.json": 11,\r\n' +
    '12\r\n' +
    '"collect.json": 5,\r\n' +
    '11\r\n' +
    '"groups.json": 6,\r\n' +
    '14\r\n' +
    '"mom_api.json": 105,\r\n' +
    '13\r\n' +
    '"scenario.json": 5,\r\n' +
    '11\r\n' +
    '"site.json": 149,\r\n' +
    '12\r\n' +
    '"bdd_mig.json": 0,\r\n' +
    '13\r\n' +
    '"info_mig.json": 0,\r\n' +
    '26\r\n' +
    '"urlMediation": "mediation.tydom.com",\r\n' +
    '19\r\n' +
    '"updateAvailable": false,\r\n' +
    '17\r\n' +
    '"passwordEmpty": false,\r\n' +
    'B\r\n' +
    '"geoloc": {\r\n' +
    '15\r\n' +
    '"longitude": 2125472,\r\n' +
    '14\r\n' +
    '"latitude": 48897412\r\n' +
    '2\r\n' +
    '},\r\n' +
    'A\r\n' +
    '"clock": {\r\n' +
    '25\r\n' +
    '"clock": "2020-01-17T13:12:13+01:00",\r\n' +
    'F\r\n' +
    '"timezone": 60,\r\n' +
    '14\r\n' +
    '"summerOffset": "ON"\r\n' +
    '2\r\n' +
    '},\r\n' +
    'C\r\n' +
    '"moments": {\r\n' +
    'C\r\n' +
    '"suspend": {\r\n' +
    '7\r\n' +
    '"to": 0\r\n' +
    '2\r\n' +
    '}}\r\n' +
    '1\r\n' +
    '}\r\n' +
    '0\r\n' +
    '\r\n',
  'utf8',
);

export const updatedDevicesData = Buffer.from(
  'PUT /devices/data HTTP/1.1\r\n' +
    'Server: Tydom-001A2502951F\r\n' +
    'content-type: application/json\r\n' +
    'Transfer-Encoding: chunked\r\n' +
    '\r\n' +
    '74\r\n' +
    '[{"id":1531745761,"endpoints":[{"id":1531745761,"error":0,"data":[{"name":"level","validity":"upToDate","value":100}\r\n' +
    '3F\r\n' +
    ',{"name":"onFavPos","validity":"upToDate","value":false}]}]}]\r\n' +
    '\r\n' +
    '0\r\n' +
    '\r\n',
  'utf8',
);
