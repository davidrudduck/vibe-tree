import type { ReactNode } from 'react';
import { Terminal, GitBranch, Layers } from 'lucide-react';

export type MobileView = 'projects' | 'terminal' | 'changes';

interface MobileBottomNavProps {
  activeView: MobileView;
  onChange: (view: MobileView) => void;
}

const tabs: { view: MobileView; icon: ReactNode; label: string }[] = [
  { view: 'projects', icon: <Layers className="h-5 w-5" />, label: 'Projects' },
  { view: 'terminal', icon: <Terminal className="h-5 w-5" />, label: 'Terminal' },
  { view: 'changes', icon: <GitBranch className="h-5 w-5" />, label: 'Changes' },
];

export function MobileBottomNav({ activeView, onChange }: MobileBottomNavProps) {
  return (
    <div className="md:hidden h-14 border-t bg-background flex items-center flex-shrink-0">
      {tabs.map(({ view, icon, label }) => (
        <button
          key={view}
          onClick={() => onChange(view)}
          className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 transition-colors ${
            activeView === view ? 'text-blue-400' : 'text-muted-foreground'
          }`}
        >
          {icon}
          <span className="text-[10px] font-medium">{label}</span>
        </button>
      ))}
    </div>
  );
}
