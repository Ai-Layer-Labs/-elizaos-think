import { Plugin } from "@elizaos/core";
import registerAgent from "./actions/registerAgent";
import sendMessage from "./actions/sendMessage";
import publishActions from "./actions/publishActions";
import discoverActions from "./actions/discoverActions";

export const thinkPlugin: Plugin = {
    name: "think-protocol",
    description: "THINK Protocol Plugin for ElizaOS - enables decentralized agent action discovery and communication",
    actions: [registerAgent, sendMessage, publishActions, discoverActions],
    evaluators: [],
    providers: [],
};

export default thinkPlugin;