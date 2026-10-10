import React, { useState, useEffect } from 'react';
import { X, ArrowRight, ArrowLeft, Check } from 'lucide-react';

export interface TourStep {
  targetId: string;
  title: string;
  description: string;
  position: 'bottom' | 'top' | 'left' | 'right';
}

const TOUR_STEPS: TourStep[] = [
  {
    targetId: 'tour-editor',
    title: 'Code Editor',
    description: 'Write MiniC source code here or load pre-built algorithms from Samples.',
    position: 'right',
  },
  {
    targetId: 'tour-mode-switch',
    title: 'Mode Switch',
    description: 'Choose Strict validation or AI Repair mode for automated error fixes.',
    position: 'bottom',
  },
  {
    targetId: 'tour-tabs-bar',
    title: 'Analysis Tabs',
    description: 'Inspect scanned tokens, parse trace, AST hierarchy, and diagnostics.',
    position: 'bottom',
  },
  {
    targetId: 'tour-explain-tab',
    title: 'Explain & Walkthrough',
    description: 'Synthesize semantic explanations and step-by-step code walkthroughs.',
    position: 'bottom',
  },
];

interface OnboardingTourProps {
  isOpen: boolean;
  onClose: () => void;
}

export function OnboardingTour({ isOpen, onClose }: OnboardingTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    function updatePosition() {
      const step = TOUR_STEPS[currentStep];
      const el = document.getElementById(step.targetId);

      if (el) {
        const rect = el.getBoundingClientRect();
        let top = rect.bottom + 8;
        let left = rect.left + 16;

        if (step.position === 'right') {
          top = rect.top + 60;
          left = Math.min(window.innerWidth - 320, rect.right + 12);
        } else if (step.position === 'top') {
          top = Math.max(10, rect.top - 120);
          left = rect.left + 16;
        }

        // Clamp inside window
        left = Math.max(12, Math.min(window.innerWidth - 300, left));
        top = Math.max(12, Math.min(window.innerHeight - 160, top));

        setCoords({ top, left });
      } else {
        // Fallback center position
        setCoords({
          top: window.innerHeight / 2 - 80,
          left: window.innerWidth / 2 - 140,
        });
      }
    }

    updatePosition();
    window.addEventListener('resize', updatePosition);
    return () => window.removeEventListener('resize', updatePosition);
  }, [isOpen, currentStep]);

  if (!isOpen) return null;

  const step = TOUR_STEPS[currentStep];
  const isLast = currentStep === TOUR_STEPS.length - 1;

  const handleNext = () => {
    if (isLast) {
      localStorage.setItem('arbora_tour_completed', 'true');
      onClose();
    } else {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleSkip = () => {
    localStorage.setItem('arbora_tour_completed', 'true');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      {/* Tooltip Card */}
      {coords && (
        <div
          style={{ top: `${coords.top}px`, left: `${coords.left}px` }}
          className="absolute pointer-events-auto w-72 bg-white rounded-xl border border-[#E7E5E4] shadow-xl p-3.5 space-y-2 text-[#1C1917] animate-in fade-in zoom-in-95 duration-150"
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#059669]">
              Step {currentStep + 1} of {TOUR_STEPS.length}
            </span>
            <button
              type="button"
              onClick={handleSkip}
              className="text-[#78716C] hover:text-[#1C1917] p-0.5 rounded transition-colors"
              title="Skip tour"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Title & Description (one short line) */}
          <div>
            <h3 className="text-xs font-semibold text-[#1C1917]">{step.title}</h3>
            <p className="text-[11px] text-[#78716C] leading-snug mt-1">{step.description}</p>
          </div>

          {/* Navigation Controls */}
          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={handleSkip}
              className="text-[10px] text-[#78716C] hover:text-[#1C1917] font-medium transition-colors"
            >
              Skip
            </button>

            <div className="flex items-center gap-1.5">
              {currentStep > 0 && (
                <button
                  type="button"
                  onClick={handlePrev}
                  className="px-2 py-1 text-xs text-[#78716C] hover:text-[#1C1917] hover:bg-stone-100 rounded-md transition-colors"
                >
                  Back
                </button>
              )}
              <button
                type="button"
                onClick={handleNext}
                className="px-2.5 py-1 text-xs font-medium text-white bg-[#059669] hover:bg-[#047857] rounded-md transition-colors flex items-center gap-1 shadow-2xs"
              >
                {isLast ? (
                  <>
                    <span>Finish</span>
                    <Check className="w-3 h-3" />
                  </>
                ) : (
                  <>
                    <span>Next</span>
                    <ArrowRight className="w-3 h-3" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
