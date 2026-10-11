import { CommandPalette } from '../CommandPalette';
import { OnboardingTour } from '../OnboardingTour';
import { ReportModal } from '../ReportModal';
import type { AnalysisReportData } from '../../lib/reportGenerator';

export function PlaygroundOverlays(props: {
  reportOpen: boolean;
  tourOpen: boolean;
  reportData: AnalysisReportData;
  onCloseReport: () => void;
  onCloseTour: () => void;
  onRun: () => void;
  onOpenReport: () => void;
  onStartTour: () => void;
}) {
  return (
    <>
      <ReportModal
        isOpen={props.reportOpen}
        onClose={props.onCloseReport}
        data={props.reportData}
      />
      <OnboardingTour isOpen={props.tourOpen} onClose={props.onCloseTour} />
      <CommandPalette
        onRunCode={props.onRun}
        onOpenReport={props.onOpenReport}
        onStartTour={props.onStartTour}
      />
    </>
  );
}
