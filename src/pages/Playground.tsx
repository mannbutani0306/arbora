import { PlaygroundOverlays } from '../components/playground/PlaygroundOverlays';
import { PlaygroundWorkspace } from '../components/playground/PlaygroundWorkspace';
import { Toolbar } from '../components/playground/Toolbar';
import { usePlaygroundController } from '../components/playground/usePlaygroundController';

export function Playground() {
  const { toolbarProps, workspaceProps, overlayProps } = usePlaygroundController();
  return (
    <main className="flex h-[calc(100vh-4rem)] min-h-0 flex-col bg-[#FAFAF9] text-[#1C1917]">
      <Toolbar {...toolbarProps} />
      <PlaygroundWorkspace {...workspaceProps} />
      <PlaygroundOverlays {...overlayProps} />
    </main>
  );
}
