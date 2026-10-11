import { classicalRepair, type ClassicalRepairCandidate } from './classicalRepair';
import { ngramRepair, type NgramModel, type NgramRepairCandidate } from './ngramRepair';

export interface RepairBaseline {
  name: 'B0' | 'B1' | 'B2';
  label: 'none' | 'classicalRepair' | 'ngramRepair';
  repair(corruptedCode: string): BaselineCandidate[];
}

export type BaselineCandidate = ClassicalRepairCandidate | NgramRepairCandidate;

export function createBaselines(model: NgramModel): RepairBaseline[] {
  return [
    { name: 'B0', label: 'none', repair: () => [] },
    { name: 'B1', label: 'classicalRepair', repair: (code) => classicalRepair(code) },
    { name: 'B2', label: 'ngramRepair', repair: (code) => ngramRepair(code, model) },
  ];
}
