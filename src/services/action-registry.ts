import { ElizaAction, ThinkActionRegistry, AgentRuntime } from '../types';

export class ActionRegistry implements ThinkActionRegistry {
  actions: ElizaAction[] = [];
  
  /**
   * Collect actions from all loaded plugins
   * @param runtime The agent runtime
   */
  async collectActions(runtime: AgentRuntime): Promise<void> {
    try {
      // Get references to all loaded plugins' actions
      // This is a simplified approach - in a real implementation, 
      // you would use runtime methods to access other plugins
      const loadedPlugins = (runtime as any).plugins || [];
      
      // Temporary store for actions to remove duplicates
      const actionMap = new Map<string, ElizaAction>();
      
      // Collect actions from all plugins
      for (const plugin of loadedPlugins) {
        if (plugin.actions && Array.isArray(plugin.actions)) {
          for (const action of plugin.actions) {
            // Create a standardized action object
            const elizaAction: ElizaAction = {
              name: action.name,
              description: action.description,
              plugin: plugin.name || 'unknown',
              execute: action.execute
            };
            
            // Use action name as key to remove duplicates
            actionMap.set(action.name, elizaAction);
          }
        }
      }
      
      // Convert map to array
      this.actions = Array.from(actionMap.values());
      
      runtime.logger.info(`Collected ${this.actions.length} unique actions from loaded plugins`);
    } catch (error) {
      runtime.logger.error('Error collecting actions from plugins:', error);
      throw new Error('Failed to collect actions from plugins');
    }
  }
  
  /**
   * Get all collected actions
   * @returns ElizaAction[] Array of all collected actions
   */
  getActions(): ElizaAction[] {
    return this.actions;
  }
  
  /**
   * Get a specific action by name
   * @param name The action name
   * @returns ElizaAction | undefined The action or undefined if not found
   */
  getActionByName(name: string): ElizaAction | undefined {
    return this.actions.find(action => action.name === name);
  }
  
  /**
   * Filter actions by a predicate function
   * @param predicate The filter function
   * @returns ElizaAction[] Filtered actions
   */
  filterActions(predicate: (action: ElizaAction) => boolean): ElizaAction[] {
    return this.actions.filter(predicate);
  }
  
  /**
   * Add a custom action to the registry
   * @param action The action to add
   */
  addAction(action: ElizaAction): void {
    // Check if action already exists
    const existingIndex = this.actions.findIndex(a => a.name === action.name);
    
    if (existingIndex >= 0) {
      // Replace existing action
      this.actions[existingIndex] = action;
    } else {
      // Add new action
      this.actions.push(action);
    }
  }
} 