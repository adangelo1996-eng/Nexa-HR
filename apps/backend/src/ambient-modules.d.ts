/** I tipi ESM di openai 4.77 e pdf-parse 2 non sono risolti con moduleResolution Node. */
declare module "openai" {
  const OpenAI: any;
  export default OpenAI;
}

declare module "pdf-parse" {
  export const PDFParse: any;
}
