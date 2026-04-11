import { PartDef } from '../models/types';
import partsJson from './parts.json';

export const PARTS: Record<string, PartDef> = partsJson as Record<string, PartDef>;
