import { createRequire } from "node:module";
import PDFDocument from "pdfkit";
import { SYNAPSE_BODY_MUTED, SYNAPSE_BRAND_BLUE, SYNAPSE_BRAND_BLUE_LIGHT } from "./hr-contract-brand.constants";

export type HrContractPdfBlock = {
  title?: string;
  content: string;
  key?: string;
};

export type HrContractPdfRenderInput = {
  documentTitle: string;
  subtitle?: string;
  metaLines?: string[];
  blocks: HrContractPdfBlock[];
  footerNote?: string;
};

let montserratRegularPath: string | null | undefined;

function resolveMontserratRegular(): string | null {
  if (montserratRegularPath !== undefined) {
    return montserratRegularPath;
  }
  try {
    const req = createRequire(__filename);
    montserratRegularPath = req.resolve("@fontsource/montserrat/files/montserrat-latin-400-normal.ttf");
  } catch {
    montserratRegularPath = null;
  }
  return montserratRegularPath;
}

type PdfDoc = InstanceType<typeof PDFDocument>;

function registerFonts(pdf: PdfDoc): { body: string; bold: string; display: string } {
  const montserrat = resolveMontserratRegular();
  if (montserrat) {
    pdf.registerFont("SynapseBody", montserrat);
    pdf.registerFont("SynapseBold", montserrat);
    pdf.registerFont("SynapseDisplay", montserrat);
    return { body: "SynapseBody", bold: "SynapseBold", display: "SynapseDisplay" };
  }
  return { body: "Helvetica", bold: "Helvetica-Bold", display: "Helvetica-Bold" };
}

function drawBrandHeader(pdf: PdfDoc, fonts: { display: string; body: string }, subtitle?: string): number {
  const headerH = 72;
  pdf.save();
  pdf.rect(0, 0, pdf.page.width, headerH).fill(SYNAPSE_BRAND_BLUE);
  pdf.fillColor("#ffffff").font(fonts.display).fontSize(22).text("SYNAPSE", 48, 22, { continued: false });
  pdf.font(fonts.body).fontSize(9).text("Nexa HR", 48, 46);
  if (subtitle?.trim()) {
    pdf.fontSize(8).fillColor("#c8d9f0").text(subtitle.trim(), 48, 58, { width: pdf.page.width - 96 });
  }
  pdf.restore();
  pdf.fillColor("#000000");
  return headerH + 12;
}

export async function renderSynapseContractPdf(input: HrContractPdfRenderInput): Promise<Buffer> {
  const out: Buffer[] = [];
  const pdf = new PDFDocument({ size: "A4", margin: 48 });
  pdf.on("data", (chunk) => out.push(chunk as Buffer));
  const done = new Promise<Buffer>((resolve, reject) => {
    pdf.on("end", () => resolve(Buffer.concat(out)));
    pdf.on("error", reject);
  });

  const fonts = registerFonts(pdf);
  let y = drawBrandHeader(pdf, fonts, input.subtitle);

  pdf.y = y;
  pdf.font(fonts.bold).fontSize(17).fillColor(SYNAPSE_BRAND_BLUE).text(input.documentTitle, { align: "left" });
  pdf.moveDown(0.4);
  pdf.fillColor(SYNAPSE_BODY_MUTED).font(fonts.body).fontSize(9);
  for (const line of input.metaLines ?? []) {
    if (line.trim()) {
      pdf.text(line.trim());
    }
  }
  pdf.fillColor("#1a202c");
  pdf.moveDown(0.8);

  for (const block of input.blocks) {
    const title = block.title?.trim();
    if (title) {
      pdf.font(fonts.bold).fontSize(12).fillColor(SYNAPSE_BRAND_BLUE_LIGHT).text(title);
      pdf.moveDown(0.25);
    }
    pdf.font(fonts.body).fontSize(10.5).fillColor("#1a202c").text(block.content || "", {
      align: "left",
      lineGap: 3
    });
    pdf.moveDown(0.75);
  }

  if (input.footerNote?.trim()) {
    pdf.moveDown(0.5);
    pdf
      .font(fonts.body)
      .fontSize(8)
      .fillColor(SYNAPSE_BODY_MUTED)
      .text(input.footerNote.trim(), { align: "center" });
  }

  pdf.end();
  return done;
}
