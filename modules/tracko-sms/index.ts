// Re-export the native module. On web, it will be resolved to TrackoSmsModule.web.ts
// and on native platforms to TrackoSmsModule.ts
export { default } from './src/TrackoSmsModule';
export * from './src/TrackoSms.types';
