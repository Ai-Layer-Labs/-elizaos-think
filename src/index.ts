import createThinkProtocolPlugin, {
  ThinkProtocolError,
  ThinkProtocolPluginConfig,
  Thought
} from '../think-protocol-plugin';

// Re-export all the types and functions
export {
  createThinkProtocolPlugin,
  ThinkProtocolError,
  ThinkProtocolPluginConfig,
  Thought
};

// Export a default factory function for creating the plugin
export default function createPlugin(config: ThinkProtocolPluginConfig) {
  return createThinkProtocolPlugin(config);
}