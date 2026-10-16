/// <reference types="vite/client" />

// 打光报告生成器的模板：以 URL 形式引入（开发/常规构建产出独立文件；
// `npm run build:offline` 时被 vite-plugin-singlefile 内联成 data URI，仍然是单文件）
declare module "*.pptx?url" {
  const src: string;
  export default src;
}
