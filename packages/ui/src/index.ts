// Export terminal component
export { Terminal } from './components/Terminal';
export type { TerminalProps, TerminalConfig } from './components/Terminal';

// Export tabs component
export { Tabs, TabsList, TabsTrigger, TabsContent } from './components/Tabs';
export type { TabsProps, TabsListProps, TabsTriggerProps, TabsContentProps } from './components/Tabs';

// Export error boundary component
export { ErrorBoundary } from './components/ErrorBoundary';
export type { ErrorBoundaryProps, ErrorBoundaryState } from './components/ErrorBoundary';

// Export settings dialog component and types
export { SettingsDialog } from './components/SettingsDialog';
export type { SettingsAdapter, TerminalSettings, Project } from './types/settings';
export { DEFAULT_TERMINAL_SETTINGS } from './types/settings';

// Future exports for other shared components
// export { WorktreeList } from './components/WorktreeList';
// export { GitDiffViewer } from './components/GitDiffViewer';
// export { Button } from './components/Button';
// export { Dialog } from './components/Dialog';