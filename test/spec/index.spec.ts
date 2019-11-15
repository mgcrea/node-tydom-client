import * as packageInterface from '../../src';

describe('package', () => {
  it('should expose a stable interface', () => {
    expect(packageInterface).toBeDefined();
    expect(packageInterface).toMatchSnapshot();
  });
});
