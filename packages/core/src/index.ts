// Export all types
export * from './types';

// Export adapter interfaces
export { CommunicationAdapter, BaseAdapter } from './adapters/CommunicationAdapter';

// Export services
export { ShellSessionManager } from './services/ShellSessionManager';
export { TmuxSessionManager } from './services/TmuxSessionManager';
export { SessionManagerFactory, type SessionManagerType } from './services/SessionManagerFactory';
export { TerminalForkManager } from './services/TerminalForkManager';
export { IdeService, type IDE } from './services/IdeService';

// Export utilities
export * from './utils/git-parser';
export * from './utils/shell';
export * from './utils/git';
export * from './utils/network';
export * from './utils/shell-escape';
export * from './utils/system-diagnostics';
export * from './utils/validation';

// Version info
export const VERSION = '0.0.1';