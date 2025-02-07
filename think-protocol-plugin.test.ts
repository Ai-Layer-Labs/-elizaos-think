import { ThinkProtocolPlugin, ThinkProtocolError } from './think-protocol-plugin';
import { MockRuntime } from '@elizaos/core/testing';

describe('ThinkProtocolPlugin', () => {
    let plugin: ThinkProtocolPlugin;
    let runtime: MockRuntime;

    beforeEach(() => {
        runtime = new MockRuntime();
        plugin = new ThinkProtocolPlugin({
            networkId: 'testnet',
            contractAddress: '0x123...'
        });
    });

    describe('SEND_THOUGHT action', () => {
        it('should validate thought format', async () => {
            const invalidThought = { content: 'test' };
            await expect(
                plugin.actions[0].handler(runtime, invalidThought)
            ).rejects.toThrow(ThinkProtocolError);
        });

        // Add more test cases...
    });

    // Add tests for other actions...
}); 