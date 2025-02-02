import { thinkProtocolPlugin } from './think-protocol-plugin';

describe('thinkProtocolPlugin', () => {
  it('should have the correct name', () => {
    expect(thinkProtocolPlugin.name).toBe('think-protocol-plugin');
  });

  it('should have the correct actions', () => {
    expect(thinkProtocolPlugin.actions).toHaveLength(4);
    expect(thinkProtocolPlugin.actions[0].name).toBe('SEND_THOUGHT');
    expect(thinkProtocolPlugin.actions[1].name).toBe('VERIFY_THOUGHT');
    expect(thinkProtocolPlugin.actions[2].name).toBe('HANDSHAKE');
    expect(thinkProtocolPlugin.actions[3].name).toBe('BURN_COIN');
  });

  it('should have the correct evaluators', () => {
    expect(thinkProtocolPlugin.evaluators).toHaveLength(1);
    expect(thinkProtocolPlugin.evaluators[0].name).toBe('think-trust-evaluator');
  });

  it('should have the correct providers', () => {
    expect(thinkProtocolPlugin.providers).toHaveLength(2);
    expect(thinkProtocolPlugin.providers[0].name).toBe('thought-provider');
    expect(thinkProtocolPlugin.providers[1].name).toBe('rolodex-provider');
  });
});