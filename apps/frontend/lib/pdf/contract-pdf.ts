import jsPDF from "jspdf";
import type { HrContractDoc } from "../contracts";

export function renderContractToPdf(doc: HrContractDoc): Blob {
  const pdf = new jsPDF({ unit: "pt", format: "a4" });

  const marginX = 48;
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const maxW = pageW - marginX * 2;
  const lineH = 14;
  let y = 56;

  pdf.setFont("times", "normal");
  pdf.setFontSize(12);

  const addLines = (text: string): void => {
    const paragraphs = text.replace(/\r\n/g, "\n").split("\n");
    for (const p of paragraphs) {
      const lines = p.trim().length === 0 ? [""] : pdf.splitTextToSize(p, maxW);
      for (const ln of lines) {
        if (y > pageH - 56) {
          pdf.addPage();
          y = 56;
        }
        pdf.text(String(ln), marginX, y);
        y += lineH;
      }
      y += 6;
    }
  };

  pdf.setFont("times", "bold");
  pdf.setFontSize(14);
  const title = doc.title || "Contratto di lavoro";
  pdf.text(title, marginX, y);
  y += 22;

  pdf.setFont("times", "normal");
  pdf.setFontSize(12);
  addLines(`Stato: ${doc.status.toUpperCase()}`);
  addLines("");

  for (const block of doc.blocks) {
    pdf.setFont("times", "bold");
    pdf.setFontSize(12);
    addLines(block.title);
    pdf.setFont("times", "normal");
    pdf.setFontSize(12);
    addLines(block.content);
    addLines("");
  }

  const arr = pdf.output("arraybuffer");
  return new Blob([arr], { type: "application/pdf" });
}

