/**
 * Stateless Utilities → Tools helpers.
 * Nothing here touches AppData / persistence — UI holds ephemeral React state only.
 */

export { encodeBase64Utf8, decodeBase64Utf8 } from './base64';
export { encodeUrlComponent, decodeUrlComponent } from './urlCodec';
export { decodeJwt, type JwtDecodeResult } from './jwtDecode';
export { digestAllHashes, type HashDigestResult } from './hashDigest';
export { generateUuids, MAX_UUID_BATCH } from './uuidBatch';
export {
  toCamelCase,
  toSnakeCase,
  toKebabCase,
  toPascalCase,
  toConstantCase,
  convertAllCases,
  type StringCaseMap,
} from './stringCase';
export { testRegex, MAX_REGEX_PATTERN_LEN, MAX_REGEX_INPUT_LEN, REGEX_FLAG_OPTIONS, REGEX_FLAG_PRESETS, type RegexTestResult } from './regexTester';
export { parseEpochInput, formatEpochViews, isoToEpochMs, type EpochParseResult } from './epochConvert';
export { explainCron, type CronExplainResult } from './cronExplain';
export { jsonToTypescript, jsonToCode, type JsonToTsResult, type JsonToCodeResult, type JsonCodeLang } from './jsonToTs';
export { curlToCode, type CurlCodeTarget, type CurlToCodeResult } from './curlToCode';
