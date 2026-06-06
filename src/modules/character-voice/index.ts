/**
 * Character Voice Module
 *
 * 提供角色语言指纹和称呼链的提取与追踪能力。
 *
 *  - `voice-extractor.ts` — 从章节对白中构建语言指纹
 *  - `address-tracker.ts` — 追踪和检测角色之间的称呼链
 *
 * @packageDocumentation
 */

export {
  extractVoiceFromChapter,
  parseAddressChainJson,
} from "./voice-extractor.js";

export type {
  VoiceFingerprint,
  ExtractionResult,
} from "./voice-extractor.js";

export {
  trackAddressChanges,
  diffAddressChain,
  recordAddressChange,
} from "./address-tracker.js";

export type {
  AddressChain,
  AddressChange,
  AddressDiffEntry,
} from "./address-tracker.js";
